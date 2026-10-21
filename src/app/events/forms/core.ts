// Staff-side cores for public forms: links and the review queue. NOT a
// "use server" file — see src/app/contacts/core.ts for the security rationale.
// The public side lives in src/lib/forms/publicCore.ts.

import { copyFileSync, mkdirSync } from "fs";
import type { FormType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PermissionError, requireEventTenantId, requirePermissionForUser } from "@/lib/permissions";
import { generateShareToken } from "@/lib/shareLinks";
import { ENTITY_FK_FIELD, getUploadDir, getUploadPath } from "@/lib/uploads";
import { formModule } from "@/lib/forms/index";
import type { FileTarget, FormLinkTarget } from "@/lib/forms/types";
import { workflowCompletionCore } from "@/app/events/workflows/core";

const MAX_LINK_DAYS = 366;

export const STALE_REVIEW = "This record changed after the review was opened. Reload to see the latest before applying.";

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
  const mod = formModule(args.formType);
  await mod.assertTarget(args, userId);

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

  // A form with one section has nothing to pick.
  const sections = mod.sectionKeys.size === 1 ? Array.from(mod.sectionKeys) : args.sections.filter((s) => mod.sectionKeys.has(s));
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
  // The snapshot version the reviewer's diff was computed against.
  version: string;
  choices: Record<string, string>;
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

const linkTargetSelect = {
  formType: true,
  tenantId: true,
  eventId: true,
  functionId: true,
  contactId: true,
  config: true,
  event: { select: { name: true, timezone: true } },
} as const;

export async function applyFormSubmissionCore(id: string, eventId: string, args: ApplyFormSubmissionArgs, userId: string) {
  await requirePermissionForUser(userId, "FORMS", "WRITE", eventId);
  const tenantId = await requireEventTenantId(eventId);
  const sub = await prisma.formSubmission.findFirst({
    where: { id, eventId, tenantId },
    include: { formLink: { select: linkTargetSelect }, files: true },
  });
  if (!sub) throw new PermissionError("NOT_FOUND", "Submission not found");
  if (sub.state !== "SUBMITTED") throw new Error("This submission was already handled");
  if (args.sections.length === 0) throw new Error("Pick at least one section to apply");

  const link: FormLinkTarget = sub.formLink;
  const mod = formModule(sub.formType);
  const snapshot = await mod.snapshot(link);
  if (!snapshot) throw new Error("The record this form reviews no longer exists");
  if (snapshot.version !== args.version) throw new Error(STALE_REVIEW);

  await assertApproved(id, sub.requiredTemplateId);
  // Claim it so a second click can't apply twice; put it back if apply fails.
  const claimed = await prisma.formSubmission.updateMany({
    where: { id, state: "SUBMITTED" },
    data: { state: "APPLIED", handledById: userId, handledAt: new Date(), reviewNotes: args.notes },
  });
  if (claimed.count === 0) throw new Error("This submission was already handled");

  let result: Awaited<ReturnType<typeof mod.apply>>;
  try {
    // Re-checked after the claim: a step un-ticked in between still blocks.
    await assertApproved(id, sub.requiredTemplateId);
    result = await mod.apply({
      submission: {
        id,
        payload: sub.payload,
        baseline: sub.baseline,
        submitterName: sub.submitterName,
        submitterOrg: sub.submitterOrg,
        submittedAt: sub.submittedAt ?? sub.createdAt,
      },
      link,
      sections: new Set(args.sections),
      choices: args.choices,
      userId,
    });
  } catch (err) {
    await prisma.formSubmission.update({
      where: { id },
      data: { state: "SUBMITTED", handledById: sub.handledById, handledAt: sub.handledAt, reviewNotes: sub.reviewNotes },
    });
    throw err;
  }

  const filed = await fileSubmissionAttachments(id, result.filesTo ?? { entityType: "event", entityId: eventId }, sub.files);
  await prisma.formSubmission.update({
    where: { id },
    data: { applyResult: { ...result, filedFiles: filed } as Prisma.InputJsonValue },
  });
}

// Files the submission's attachments on the record apply chose (the event's
// Files by default): copies with the same storedName, as inbound-email
// attachments are filed.
async function fileSubmissionAttachments(
  id: string,
  target: FileTarget,
  files: { fileName: string; storedName: string; mimeType: string; fileSize: number }[],
) {
  if (files.length === 0) return 0;
  mkdirSync(getUploadDir(target.entityType, target.entityId), { recursive: true });
  for (const f of files) {
    copyFileSync(getUploadPath("formSubmission", id, f.storedName), getUploadPath(target.entityType, target.entityId, f.storedName));
  }
  await prisma.fileUpload.createMany({
    data: files.map((f) => ({
      fileName: f.fileName,
      storedName: f.storedName,
      mimeType: f.mimeType,
      fileSize: f.fileSize,
      [ENTITY_FK_FIELD[target.entityType]]: target.entityId,
    })),
  });
  return files.length;
}
