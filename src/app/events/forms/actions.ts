"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { parseDateTimeInTimezone } from "@/lib/timezones";
import { isEmailConfigured, sendFormLinkEmail } from "@/lib/email";
import { formConfig, loadFormSnapshot } from "@/lib/forms/index";
import {
  diffFunctionReview,
  functionReviewContactMatches,
  functionReviewVersions,
  type ContactChoice,
} from "@/lib/forms/functionReview";
import { FORM_TYPE_LABEL, type FunctionReviewBaseline, type FunctionReviewPayload } from "@/lib/forms/meta";
import { applyFormSubmissionCore, createFormLinkCore, rejectFormSubmissionCore, revokeFormLinkCore } from "./core";

async function eventTimezone(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { timezone: true, name: true } });
  return { timezone: event?.timezone || "America/Chicago", name: event?.name ?? "" };
}

// A date input (YYYY-MM-DD) as the end of that day in the event's time zone.
function endOfDay(value: string | null, timezone: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return parseDateTimeInTimezone(`${value}T23:59`, timezone);
}

export async function getFormLinks(eventId: string, functionId?: string) {
  await requirePermission("FORMS", "VIEW", eventId);
  return prisma.formLink.findMany({
    where: { eventId, ...(functionId ? { functionId } : {}) },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      token: true,
      formType: true,
      label: true,
      recipientName: true,
      recipientEmail: true,
      expiresAt: true,
      revokedAt: true,
      dueAt: true,
      maxSubmissions: true,
      submittedCount: true,
      accessCount: true,
      lastAccessedAt: true,
      createdAt: true,
      function: { select: { id: true, name: true, functionNumber: true, breakoutGroup: { select: { name: true } } } },
      workflowTemplate: { select: { name: true } },
      createdBy: { select: { name: true, email: true } },
    },
  });
}

export async function createFormLink(eventId: string, formData: FormData) {
  const session = await requirePermission("FORMS", "WRITE", eventId);
  const { timezone, name: eventName } = await eventTimezone(eventId);
  const expiresAt = endOfDay(formData.get("expiresAt") as string, timezone);
  if (!expiresAt) throw new Error("Pick a close date");
  const maxRaw = formData.get("maxSubmissions") as string;
  const link = await createFormLinkCore(
    {
      eventId,
      formType: formData.get("formType") as FormType,
      functionId: (formData.get("functionId") as string) || null,
      contactId: (formData.get("contactId") as string) || null,
      label: (formData.get("label") as string) || null,
      recipientName: (formData.get("recipientName") as string) || null,
      recipientEmail: (formData.get("recipientEmail") as string) || null,
      sections: formData.getAll("sections") as string[],
      intro: (formData.get("intro") as string) || null,
      workflowTemplateId: (formData.get("workflowTemplateId") as string) || null,
      dueAt: endOfDay(formData.get("dueAt") as string, timezone),
      expiresAt,
      maxSubmissions: maxRaw ? parseInt(maxRaw) : null,
    },
    session.user.id,
  );

  let emailed = false;
  if (formData.get("sendEmail") === "true" && link.recipientEmail && isEmailConfigured()) {
    const snapshot = await loadFormSnapshot({ ...link, event: { timezone } });
    await sendFormLinkEmail({
      to: link.recipientEmail,
      recipientName: link.recipientName,
      eventName,
      formTitle: FORM_TYPE_LABEL[link.formType],
      targetName: snapshot?.baseline.functionLabel ?? eventName,
      token: link.token,
      dueAt: link.dueAt?.toLocaleDateString("en-US", { timeZone: timezone, month: "long", day: "numeric", year: "numeric" }) ?? null,
    });
    emailed = true;
  }
  revalidatePath(`/events/${eventId}/forms`);
  if (link.functionId) revalidatePath(`/events/${eventId}/functions/${link.functionId}`);
  return { id: link.id, token: link.token, emailed };
}

export async function revokeFormLink(eventId: string, linkId: string) {
  const session = await requirePermission("FORMS", "WRITE", eventId);
  await revokeFormLinkCore(linkId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/forms`);
}

export type SubmissionView = "open" | "done";

export async function getFormSubmissions(eventId: string, view: SubmissionView) {
  await requirePermission("FORMS", "VIEW", eventId);
  return prisma.formSubmission.findMany({
    where: { eventId, state: view === "open" ? "SUBMITTED" : { in: ["APPLIED", "REJECTED"] } },
    orderBy: { submittedAt: "desc" },
    select: {
      id: true,
      formType: true,
      state: true,
      status: true,
      substatus: true,
      submitterName: true,
      submitterOrg: true,
      submittedAt: true,
      handledAt: true,
      formLink: {
        select: { function: { select: { name: true, functionNumber: true, breakoutGroup: { select: { name: true } } } } },
      },
    },
  });
}

export async function getFormSubmissionReview(eventId: string, id: string) {
  const session = await requirePermission("FORMS", "VIEW", eventId);
  const sub = await prisma.formSubmission.findFirst({
    where: { id, eventId, tenantId: session.tenantId, state: { not: "DRAFT" } },
    include: {
      formLink: {
        select: {
          id: true,
          formType: true,
          functionId: true,
          eventId: true,
          config: true,
          label: true,
          recipientName: true,
          recipientEmail: true,
          event: { select: { timezone: true } },
        },
      },
      files: { select: { id: true, fileName: true, fileSize: true, mimeType: true }, orderBy: { createdAt: "asc" } },
      handledBy: { select: { name: true, email: true } },
    },
  });
  if (!sub) return null;

  switch (sub.formType) {
    case "FUNCTION_REVIEW": {
      const baseline = sub.baseline as FunctionReviewBaseline;
      const payload = sub.payload as FunctionReviewPayload;
      const sections = formConfig(sub.formLink).sections;
      const snapshot = await loadFormSnapshot(sub.formLink);
      const versions = sub.formLink.functionId ? await functionReviewVersions(sub.formLink.functionId, eventId) : null;
      return {
        submission: sub,
        functionId: sub.formLink.functionId,
        diff: diffFunctionReview(baseline, payload, snapshot?.baseline ?? baseline, sections),
        targetName: snapshot?.baseline.functionLabel ?? baseline.functionLabel,
        versions,
        contactMatches: await functionReviewContactMatches(payload, session.tenantId),
      };
    }
    default: {
      const _exhaustive: never = sub.formType;
      throw new Error(`Unhandled form type: ${_exhaustive}`);
    }
  }
}

export async function applyFormSubmission(eventId: string, id: string, formData: FormData) {
  const session = await requirePermission("FORMS", "WRITE", eventId);
  const choice = (formData.get("contactChoice") as string) || "skip";
  await applyFormSubmissionCore(
    id,
    eventId,
    {
      sections: formData.getAll("sections") as string[],
      versions: {
        function: formData.get("versionFunction") as string,
        catering: (formData.get("versionCatering") as string) || null,
      },
      contactChoice: (choice === "new" || choice.startsWith("existing:") ? choice : "skip") as ContactChoice,
      notes: (formData.get("reviewNotes") as string) || null,
    },
    session.user.id,
  );
  revalidatePath(`/events/${eventId}/forms`);
  revalidatePath(`/events/${eventId}/forms/${id}`);
  redirect(`/events/${eventId}/forms/${id}?success=Applied`);
}

export async function rejectFormSubmission(eventId: string, id: string, formData: FormData) {
  const session = await requirePermission("FORMS", "WRITE", eventId);
  await rejectFormSubmissionCore(id, eventId, (formData.get("reviewNotes") as string) || null, session.user.id);
  revalidatePath(`/events/${eventId}/forms`);
  revalidatePath(`/events/${eventId}/forms/${id}`);
  redirect(`/events/${eventId}/forms/${id}?success=Rejected`);
}
