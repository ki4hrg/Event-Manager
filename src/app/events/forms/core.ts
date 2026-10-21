// Staff-side cores for public forms: links and the review queue. NOT a
// "use server" file — see src/app/contacts/core.ts for the security rationale.
// The public side lives in src/lib/forms/publicCore.ts.

import { copyFileSync, mkdirSync } from "fs";
import type { FormType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PermissionError, requireEventTenantId, requirePermissionForUser } from "@/lib/permissions";
import { generateShareToken } from "@/lib/shareLinks";
import { getUploadDir, getUploadPath } from "@/lib/uploads";
import { formSectionKeys } from "@/lib/forms/index";
import {
  applyFunctionReview,
  type ContactChoice,
  type FunctionReviewVersions,
} from "@/lib/forms/functionReview";
import type { FunctionReviewBaseline, FunctionReviewPayload } from "@/lib/forms/meta";
import { workflowCompletionCore } from "@/app/events/workflows/core";

const MAX_LINK_DAYS = 366;

export type CreateFormLinkArgs = {
  eventId: string;
  formType: FormType;
  functionId: string | null;
  contactId: string | null;
  label: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  sections: string[];
  intro: string | null;
  workflowTemplateId: string | null;
  dueAt: Date | null;
  expiresAt: Date;
  maxSubmissions: number | null;
};

export async function createFormLinkCore(args: CreateFormLinkArgs, userId: string) {
  await requirePermissionForUser(userId, "FORMS", "WRITE", args.eventId);
  const tenantId = await requireEventTenantId(args.eventId);

  switch (args.formType) {
    case "FUNCTION_REVIEW": {
      if (!args.functionId) throw new Error("Pick a function");
      await requirePermissionForUser(userId, "FUNCTIONS", "VIEW", args.eventId);
      const fn = await prisma.function.findFirst({ where: { id: args.functionId, eventId: args.eventId }, select: { id: true } });
      if (!fn) throw new PermissionError("NOT_FOUND", "Function not found");
      break;
    }
    default: {
      const _exhaustive: never = args.formType;
      throw new Error(`Unhandled form type: ${_exhaustive}`);
    }
  }
  if (args.contactId) {
    const contact = await prisma.contact.findFirst({ where: { id: args.contactId, tenantId }, select: { id: true } });
    if (!contact) throw new PermissionError("NOT_FOUND", "Contact not found");
  }
  if (args.workflowTemplateId) {
    const template = await prisma.workflowTemplate.findFirst({
      where: { id: args.workflowTemplateId, tenantId },
      select: { id: true },
    });
    if (!template) throw new PermissionError("NOT_FOUND", "Workflow not found");
  }

  const keys = formSectionKeys(args.formType);
  const sections = args.sections.filter((s) => keys.has(s));
  if (sections.length === 0) throw new Error("Pick at least one section");
  const now = Date.now();
  if (args.expiresAt.getTime() <= now) throw new Error("The close date must be in the future");
  if (args.expiresAt.getTime() > now + MAX_LINK_DAYS * 86_400_000) throw new Error("Links can stay open for at most a year");
  if (args.maxSubmissions != null && (args.maxSubmissions < 1 || args.maxSubmissions > 1000)) {
    throw new Error("Responses allowed must be between 1 and 1000");
  }

  return prisma.formLink.create({
    data: {
      token: generateShareToken(),
      tenantId,
      eventId: args.eventId,
      formType: args.formType,
      functionId: args.functionId,
      contactId: args.contactId,
      label: args.label,
      recipientName: args.recipientName,
      recipientEmail: args.recipientEmail?.toLowerCase() ?? null,
      config: { sections, intro: args.intro } satisfies Prisma.InputJsonValue,
      workflowTemplateId: args.workflowTemplateId,
      dueAt: args.dueAt,
      expiresAt: args.expiresAt,
      maxSubmissions: args.maxSubmissions,
      createdById: userId,
    },
  });
}

export async function revokeFormLinkCore(id: string, eventId: string, userId: string) {
  await requirePermissionForUser(userId, "FORMS", "WRITE", eventId);
  await prisma.formLink.updateMany({ where: { id, eventId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function rejectFormSubmissionCore(id: string, eventId: string, notes: string | null, userId: string) {
  await requirePermissionForUser(userId, "FORMS", "WRITE", eventId);
  const r = await prisma.formSubmission.updateMany({
    where: { id, eventId, state: "SUBMITTED" },
    data: { state: "REJECTED", reviewNotes: notes, handledById: userId, handledAt: new Date() },
  });
  if (r.count === 0) throw new Error("This submission was already handled");
}

export type ApplyFormSubmissionArgs = {
  sections: string[];
  versions: FunctionReviewVersions;
  contactChoice: ContactChoice;
  notes: string | null;
};

// Approval gate: every workflow on the submission is complete, and the one
// the link required at submit is still among them (removing it doesn't
// waive it).
async function assertApproved(id: string, requiredTemplateId: string | null) {
  const { complete, templateIds } = await workflowCompletionCore("form_submission", id);
  if (requiredTemplateId && !templateIds.has(requiredTemplateId)) {
    throw new Error("The approval workflow this form requires was removed. Assign it again and complete it to apply.");
  }
  if (!complete) throw new Error("Finish the approval workflow before applying");
}

export async function applyFormSubmissionCore(id: string, eventId: string, args: ApplyFormSubmissionArgs, userId: string) {
  await requirePermissionForUser(userId, "FORMS", "WRITE", eventId);
  const tenantId = await requireEventTenantId(eventId);
  const sub = await prisma.formSubmission.findFirst({
    where: { id, eventId, tenantId },
    include: { formLink: { select: { functionId: true } }, event: { select: { timezone: true } }, files: true },
  });
  if (!sub) throw new PermissionError("NOT_FOUND", "Submission not found");
  if (sub.state !== "SUBMITTED") throw new Error("This submission was already handled");
  if (args.sections.length === 0) throw new Error("Pick at least one section to apply");

  await assertApproved(id, sub.requiredTemplateId);
  // Claim it so a second click can't apply twice; put it back if apply fails.
  const claimed = await prisma.formSubmission.updateMany({
    where: { id, state: "SUBMITTED" },
    data: { state: "APPLIED", handledById: userId, handledAt: new Date(), reviewNotes: args.notes },
  });
  if (claimed.count === 0) throw new Error("This submission was already handled");

  let result: Prisma.InputJsonValue;
  try {
    // Re-checked after the claim: a step un-ticked in between still blocks.
    await assertApproved(id, sub.requiredTemplateId);
    switch (sub.formType) {
      case "FUNCTION_REVIEW": {
        if (!sub.formLink.functionId) throw new Error("This form's function no longer exists");
        result = await applyFunctionReview({
          functionId: sub.formLink.functionId,
          eventId,
          baseline: sub.baseline as FunctionReviewBaseline,
          payload: sub.payload as FunctionReviewPayload,
          sections: new Set(args.sections),
          versions: args.versions,
          contactChoice: args.contactChoice,
          submitter: { name: sub.submitterName, org: sub.submitterOrg },
          submittedAt: sub.submittedAt ?? sub.createdAt,
          timezone: sub.event.timezone || "America/Chicago",
          userId,
        });
        break;
      }
      default: {
        const _exhaustive: never = sub.formType;
        throw new Error(`Unhandled form type: ${_exhaustive}`);
      }
    }
  } catch (err) {
    await prisma.formSubmission.update({
      where: { id },
      data: { state: "SUBMITTED", handledById: sub.handledById, handledAt: sub.handledAt, reviewNotes: sub.reviewNotes },
    });
    throw err;
  }

  const filed = await fileSubmissionAttachments(id, eventId, sub.files);
  await prisma.formSubmission.update({
    where: { id },
    data: { applyResult: { ...(result as Prisma.JsonObject), filedFiles: filed } },
  });
}

// Files the submission's attachments on the event's Files page: copies under
// the event with the same storedName, as inbound-email attachments are filed.
async function fileSubmissionAttachments(
  id: string,
  eventId: string,
  files: { fileName: string; storedName: string; mimeType: string; fileSize: number }[],
) {
  if (files.length === 0) return 0;
  mkdirSync(getUploadDir("event", eventId), { recursive: true });
  for (const f of files) {
    copyFileSync(getUploadPath("formSubmission", id, f.storedName), getUploadPath("event", eventId, f.storedName));
  }
  await prisma.fileUpload.createMany({
    data: files.map((f) => ({
      fileName: f.fileName,
      storedName: f.storedName,
      mimeType: f.mimeType,
      fileSize: f.fileSize,
      eventId,
    })),
  });
  return files.length;
}
