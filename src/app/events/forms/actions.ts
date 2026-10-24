"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { isEmailConfigured, sendFormLinkEmail } from "@/lib/email";
import { formModule } from "@/lib/forms/index";
import { UserFacingError, withUserErrors } from "@/lib/userErrors";
import {
  applyFormSubmissionCore,
  createFormLinkCore,
  deleteFormLinkCore,
  endOfDayInEvent,
  formLinkDisplay,
  listFormLinksCore,
  listFormSubmissionsCore,
  loadFormSubmissionReviewCore,
  rejectFormSubmissionCore,
  revokeFormLinkCore,
  type SubmissionView,
} from "./core";

export type { SubmissionView };

// Function Review links pick from every function with its contacts (names and
// emails for the Send to list).
export async function getFunctionReviewPicker(eventId: string) {
  await requirePermission("FUNCTIONS", "VIEW", eventId);
  const functions = await prisma.function.findMany({
    where: { eventId },
    orderBy: [{ functionNumber: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      functionNumber: true,
      breakoutGroup: { select: { name: true } },
      contacts: { select: { contact: { select: { id: true, firstName: true, lastName: true, email: true } } } },
    },
  });
  return functions.map(({ contacts, ...f }) => ({
    ...f,
    contacts: contacts.map(({ contact: c }) => ({
      contactId: c.id,
      name: [c.firstName, c.lastName].filter(Boolean).join(" "),
      email: c.email,
    })),
  }));
}

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
  return withUserErrors(async () => {
    const { timezone, name: eventName } = await eventTimezone(eventId);
    const expiresAt = await endOfDayInEvent(formData.get("expiresAt") as string, eventId);
    if (!expiresAt) throw new UserFacingError("Pick a close date");
    const maxRaw = formData.get("maxSubmissions") as string;
    const formType = formData.get("formType") as FormType;
    // "anyone" links carry no recipient, whatever the hidden fields held.
    const specific = formData.get("audience") !== "anyone";
    const link = await createFormLinkCore(
      {
        eventId,
        formType,
        functionId: (formData.get("functionId") as string) || null,
        contactId: specific ? (formData.get("contactId") as string) || null : null,
        presentationId: (formData.get("presentationId") as string) || null,
        boothGroupId: (formData.get("boothGroupId") as string) || null,
        label: (formData.get("label") as string) || null,
        recipientName: specific ? (formData.get("recipientName") as string) || null : null,
        recipientEmail: specific ? (formData.get("recipientEmail") as string) || null : null,
        sections: formData.getAll("sections") as string[],
        intro: (formData.get("intro") as string) || null,
        mediaUploadUrl: (formData.get("mediaUploadUrl") as string) || null,
        functionIds: formData.getAll("functionIds") as string[],
        alsoFormTypes: formData.getAll("alsoFormTypes") as FormType[],
        options: formModule(formType).linkOptionsFromForm?.(formData) ?? null,
        workflowTemplateId: (formData.get("workflowTemplateId") as string) || null,
        dueAt: await endOfDayInEvent(formData.get("dueAt") as string, eventId),
        expiresAt,
        maxSubmissions: maxRaw ? parseInt(maxRaw) : null,
      },
      session.user.id,
    );

    let emailed = false;
    if (formData.get("sendEmail") === "true" && link.recipientEmail && isEmailConfigured()) {
      const { formTitle, targetName } = await formLinkDisplay({ ...link, event: { name: eventName, timezone } });
      await sendFormLinkEmail({
        to: link.recipientEmail,
        recipientName: link.recipientName,
        eventName,
        formTitle,
        targetName,
        token: link.token,
        dueAt: link.dueAt?.toLocaleDateString("en-US", { timeZone: timezone, month: "long", day: "numeric", year: "numeric" }) ?? null,
      });
      emailed = true;
    }
    revalidatePath(`/events/${eventId}/forms`);
    for (const functionId of [link.functionId, ...(formData.getAll("functionIds") as string[])]) {
      if (functionId) revalidatePath(`/events/${eventId}/functions/${functionId}`);
    }
    return { id: link.id, token: link.token, emailed };
  });
}

export async function revokeFormLink(eventId: string, linkId: string) {
  const session = await requirePermission("FORMS", "WRITE", eventId);
  await revokeFormLinkCore(linkId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/forms`);
}

export async function deleteFormLink(eventId: string, linkId: string) {
  const session = await requirePermission("FORMS", "WRITE", eventId);
  return withUserErrors(async () => {
    await deleteFormLinkCore(linkId, eventId, session.user.id);
    revalidatePath(`/events/${eventId}/forms`);
  });
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
