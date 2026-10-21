"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { isEmailConfigured, sendFormLinkEmail } from "@/lib/email";
import { formConfig, formModule } from "@/lib/forms/index";
import { FORM_TYPE_LABEL } from "@/lib/forms/meta";
import {
  applyFormSubmissionCore,
  createFormLinkCore,
  endOfDayInEvent,
  listFormLinksCore,
  listFormSubmissionsCore,
  loadFormSubmissionReviewCore,
  rejectFormSubmissionCore,
  revokeFormLinkCore,
  type SubmissionView,
} from "./core";

export type { SubmissionView };

async function eventTimezone(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { timezone: true, name: true } });
  return { timezone: event?.timezone || "America/Chicago", name: event?.name ?? "" };
}


export async function getFormLinks(
  eventId: string,
  filter: { functionId?: string; presentationId?: string; formType?: FormType } = {},
) {
  const session = await requirePermission("FORMS", "VIEW", eventId);
  return listFormLinksCore(eventId, filter, session.user.id);
}

export async function createFormLink(eventId: string, formData: FormData) {
  const session = await requirePermission("FORMS", "WRITE", eventId);
  const { timezone, name: eventName } = await eventTimezone(eventId);
  const expiresAt = await endOfDayInEvent(formData.get("expiresAt") as string, eventId);
  if (!expiresAt) throw new Error("Pick a close date");
  const maxRaw = formData.get("maxSubmissions") as string;
  const link = await createFormLinkCore(
    {
      eventId,
      formType: formData.get("formType") as FormType,
      functionId: (formData.get("functionId") as string) || null,
      contactId: (formData.get("contactId") as string) || null,
      presentationId: (formData.get("presentationId") as string) || null,
      boothGroupId: (formData.get("boothGroupId") as string) || null,
      label: (formData.get("label") as string) || null,
      recipientName: (formData.get("recipientName") as string) || null,
      recipientEmail: (formData.get("recipientEmail") as string) || null,
      sections: formData.getAll("sections") as string[],
      intro: (formData.get("intro") as string) || null,
      mediaUploadUrl: (formData.get("mediaUploadUrl") as string) || null,
      workflowTemplateId: (formData.get("workflowTemplateId") as string) || null,
      dueAt: await endOfDayInEvent(formData.get("dueAt") as string, eventId),
      expiresAt,
      maxSubmissions: maxRaw ? parseInt(maxRaw) : null,
    },
    session.user.id,
  );

  let emailed = false;
  if (formData.get("sendEmail") === "true" && link.recipientEmail && isEmailConfigured()) {
    const snapshot = await formModule(link.formType).snapshot({ ...link, event: { name: eventName, timezone } });
    await sendFormLinkEmail({
      to: link.recipientEmail,
      recipientName: link.recipientName,
      eventName,
      formTitle: FORM_TYPE_LABEL[link.formType],
      targetName: snapshot?.targetName ?? eventName,
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

export async function getFormSubmissions(eventId: string, view: SubmissionView) {
  const session = await requirePermission("FORMS", "VIEW", eventId);
  return listFormSubmissionsCore(eventId, view, session.user.id);
}

export async function getFormSubmissionReview(eventId: string, id: string) {
  const session = await requirePermission("FORMS", "VIEW", eventId);
  return loadFormSubmissionReviewCore(eventId, id, session.user.id);
}

export async function applyFormSubmission(eventId: string, id: string, formData: FormData) {
  const session = await requirePermission("FORMS", "WRITE", eventId);
  const choices: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (key.startsWith("choice_") && typeof value === "string") choices[key.slice("choice_".length)] = value;
  });
  await applyFormSubmissionCore(
    id,
    eventId,
    {
      sections: formData.getAll("sections") as string[],
      version: formData.get("version") as string,
      choices,
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
