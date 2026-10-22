// Staff-side cores for public forms: links and the review queue. NOT a
// "use server" file — see src/app/contacts/core.ts for the security rationale.
// The public side lives in src/lib/forms/publicCore.ts.

import { copyFileSync, mkdirSync } from "fs";
import type { FormType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PermissionError, requireEventTenantId, requirePermissionForUser } from "@/lib/permissions";
import { generateShareToken } from "@/lib/shareLinks";
import { ENTITY_FK_FIELD, getUploadDir, getUploadPath } from "@/lib/uploads";
import { formConfig, formModule } from "@/lib/forms/index";
import { parseDateTimeInTimezone } from "@/lib/timezones";
import type { FileTarget, FormLinkTarget } from "@/lib/forms/types";
import { FORM_TYPE_LABEL, formsHeading, httpsUrl } from "@/lib/forms/meta";
import { BUNDLE_ORDER, removeSubmissionFiles } from "@/lib/forms/links";
import { workflowCompletionCore } from "@/app/events/workflows/core";

const MAX_LINK_DAYS = 366;

export const STALE_REVIEW = "This record changed after the review was opened. Reload to see the latest before applying.";

export type CreateFormLinkArgs = {
  eventId: string;
  formType: FormType;
  functionId: string | null;
  contactId: string | null;
  presentationId: string | null;
  boothGroupId: string | null;
  label: string | null;
  recipientName: string | null;
  recipientEmail: string | null;
  sections: string[];
  intro: string | null;
  mediaUploadUrl: string | null;
  // Several functions for one Function Review link (a bundle); overrides functionId.
  functionIds?: string[];
  // More forms for the same target, sent as one bundle (a speaker's profile and deliverables).
  alsoFormTypes?: FormType[];
  // The form type's own settings; see FormModule.linkOptions.
  options: unknown;
  workflowTemplateId: string | null;
  dueAt: Date | null;
  expiresAt: Date;
  maxSubmissions: number | null;
};

const MAX_BUNDLE_LINKS = 50;

// One link, or a bundle when the args name several functions or several form
// types for the same target: the parent carries the recipient and the email,
// and each (form type, function) pair is its own child link.
export async function createFormLinkCore(args: CreateFormLinkArgs, userId: string) {
  await requirePermissionForUser(userId, "FORMS", "WRITE", args.eventId);
  const tenantId = await requireEventTenantId(args.eventId);

  const formTypes = Array.from(new Set([args.formType, ...(args.alsoFormTypes ?? [])]));
  const functionIds = args.functionIds?.length ? Array.from(new Set(args.functionIds)) : [args.functionId];
  if (functionIds.length > 1 && formTypes.some((t) => t !== "FUNCTION_REVIEW")) {
    throw new Error("Only a Function Review can cover several functions");
  }
  if (formTypes.length * functionIds.length > MAX_BUNDLE_LINKS) throw new Error(`One link can cover at most ${MAX_BUNDLE_LINKS} forms`);

  if (args.contactId) {
    const contact = await prisma.contact.findFirst({ where: { id: args.contactId, tenantId }, select: { id: true } });
    if (!contact) throw new PermissionError("NOT_FOUND", "Contact not found");
  }
  // Every target id is stored on the link whichever form uses it, and the
  // links list renders their names: each must be this event's own, not only
  // the ones the form's assertTarget checks.
  const targetFunctionIds = functionIds.filter((id): id is string => !!id);
  const [fnCount, presentation, boothGroup] = await Promise.all([
    targetFunctionIds.length ? prisma.function.count({ where: { id: { in: targetFunctionIds }, eventId: args.eventId } }) : 0,
    args.presentationId ? prisma.presentation.findFirst({ where: { id: args.presentationId, eventId: args.eventId }, select: { id: true } }) : true,
    args.boothGroupId ? prisma.exhibitBoothGroup.findFirst({ where: { id: args.boothGroupId, eventId: args.eventId }, select: { id: true } }) : true,
  ]);
  if (fnCount !== targetFunctionIds.length) throw new PermissionError("NOT_FOUND", "Function not found");
  if (!presentation) throw new PermissionError("NOT_FOUND", "Presentation not found");
  if (!boothGroup) throw new PermissionError("NOT_FOUND", "Booth group not found");
  if (args.workflowTemplateId) {
    const template = await prisma.workflowTemplate.findFirst({
      where: { id: args.workflowTemplateId, tenantId },
      select: { id: true },
    });
    if (!template) throw new PermissionError("NOT_FOUND", "Workflow not found");
  }

  let mediaUploadUrl: string | null = null;
  if (args.mediaUploadUrl) {
    if (!formTypes.some((t) => formModule(t).externalUpload)) throw new Error("This form doesn't take an upload link");
    mediaUploadUrl = httpsUrl(args.mediaUploadUrl);
    if (!mediaUploadUrl) throw new Error("The upload link must be an https:// address");
  }

  const now = Date.now();
  if (args.expiresAt.getTime() <= now) throw new Error("The close date must be in the future");
  if (args.expiresAt.getTime() > now + MAX_LINK_DAYS * 86_400_000) throw new Error("Links can stay open for at most a year");
  if (args.maxSubmissions != null && (args.maxSubmissions < 1 || args.maxSubmissions > 1000)) {
    throw new Error("Responses allowed must be between 1 and 1000");
  }

  const shared = {
    tenantId,
    eventId: args.eventId,
    contactId: args.contactId,
    label: args.label,
    recipientName: args.recipientName,
    recipientEmail: args.recipientEmail?.toLowerCase() ?? null,
    dueAt: args.dueAt,
    expiresAt: args.expiresAt,
    createdById: userId,
  };

  const links: Prisma.FormLinkCreateManyInput[] = [];
  for (const formType of formTypes) {
    const mod = formModule(formType);
    // A form with one section has nothing to pick.
    const sections = mod.sectionKeys.size === 1 ? Array.from(mod.sectionKeys) : args.sections.filter((s) => mod.sectionKeys.has(s));
    if (sections.length === 0) throw new Error(`Pick at least one ${FORM_TYPE_LABEL[formType]} section`);
    for (const functionId of functionIds) {
      const target = { ...args, functionId };
      await mod.assertTarget(target, userId);
      const options = mod.linkOptions ? await mod.linkOptions(args.options, target) : null;
      links.push({
        ...shared,
        token: generateShareToken(),
        formType,
        functionId,
        presentationId: args.presentationId,
        boothGroupId: args.boothGroupId,
        config: {
          sections,
          intro: args.intro,
          mediaUploadUrl: mod.externalUpload ? mediaUploadUrl : null,
          options,
        } satisfies Prisma.InputJsonValue,
        workflowTemplateId: args.workflowTemplateId,
        maxSubmissions: args.maxSubmissions,
      });
    }
  }

  if (links.length === 1) return prisma.formLink.create({ data: links[0] });
  return prisma.$transaction(async (tx) => {
    const parent = await tx.formLink.create({
      data: {
        ...shared,
        token: generateShareToken(),
        formType: args.formType,
        bundle: true,
        config: { sections: [], intro: args.intro } satisfies Prisma.InputJsonValue,
      },
    });
    await tx.formLink.createMany({ data: links.map((l) => ({ ...l, parentId: parent.id })) });
    return parent;
  });
}

// What an email or a staff list calls a link: the form title and its target.
// A bundle names each of its forms, or the one target they share.
export async function formLinkDisplay(link: FormLinkTarget & { id: string; bundle: boolean }) {
  const parts = link.bundle
    ? await prisma.formLink.findMany({ where: { parentId: link.id }, orderBy: BUNDLE_ORDER, select: linkTargetSelect })
    : [link];
  const snapshots = await Promise.all(parts.map((p) => formModule(p.formType).snapshot(p)));
  const heading = formsHeading(
    parts.map((p, i) => ({ formTitle: FORM_TYPE_LABEL[p.formType], targetName: snapshots[i]?.targetName ?? null })),
    link.event.name,
  );
  return { formTitle: heading.formTitle, targetName: heading.targetName ?? link.event.name };
}

// Revoking a bundle revokes every link in it.
export async function revokeFormLinkCore(id: string, eventId: string, userId: string) {
  await requirePermissionForUser(userId, "FORMS", "WRITE", eventId);
  await prisma.formLink.updateMany({
    where: { eventId, revokedAt: null, OR: [{ id }, { parentId: id }] },
    data: { revokedAt: new Date() },
  });
}

// Only a revoked link can be deleted, and only once nothing it (or, for a
// bundle, any of its links) received is waiting for review. Drafts and
// handled submissions go with it; files already applied were copied onto
// their records and stay.
export async function deleteFormLinkCore(id: string, eventId: string, userId: string) {
  await requirePermissionForUser(userId, "FORMS", "WRITE", eventId);
  const link = await prisma.formLink.findFirst({ where: { id, eventId }, select: { revokedAt: true } });
  if (!link) throw new PermissionError("NOT_FOUND", "Form link not found");
  if (!link.revokedAt) throw new Error("Revoke the link before deleting it");
  const submissions = await prisma.formSubmission.findMany({
    where: { eventId, OR: [{ formLinkId: id }, { formLink: { parentId: id } }] },
    select: { id: true, state: true },
  });
  const waiting = submissions.filter((s) => s.state === "SUBMITTED").length;
  if (waiting > 0) {
    throw new Error(`This link has ${waiting} submission${waiting === 1 ? "" : "s"} to review. Apply or reject ${waiting === 1 ? "it" : "them"} first.`);
  }
  // Re-checked in the delete. A revoked link takes no new submissions, but a
  // bundle's child may still be open.
  const pending = { some: { state: "SUBMITTED" as const } };
  const r = await prisma.formLink.deleteMany({
    where: { id, eventId, revokedAt: { not: null }, NOT: [{ submissions: pending }, { children: { some: { submissions: pending } } }] },
  });
  if (r.count === 0) throw new Error("This link changed. Reload and try again.");
  for (const s of submissions) removeSubmissionFiles(s.id);
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
  presentationId: true,
  boothGroupId: true,
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
        fileCount: sub.files.length,
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

  const placed = new Set(result.filedByApply ?? []);
  const filed = await fileSubmissionAttachments(
    id,
    result.filesTo ?? { entityType: "event", entityId: eventId },
    sub.files.filter((f) => !placed.has(f.id)),
  );
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

// A date input (YYYY-MM-DD) as the end of that day in the event's time zone.
export async function endOfDayInEvent(value: string | null | undefined, eventId: string): Promise<Date | null> {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { timezone: true } });
  return parseDateTimeInTimezone(`${value}T23:59`, event?.timezone || "America/Chicago");
}

// ─── Readers (shared by the pages and the MCP tools) ────────────────────────

export async function listFormLinksCore(
  eventId: string,
  filter: { functionId?: string; presentationId?: string; formType?: FormType },
  userId: string,
) {
  await requirePermissionForUser(userId, "FORMS", "VIEW", eventId);
  // A target's page lists the links for it, bundled or not; elsewhere a
  // bundle lists once, as its parent.
  const targeted = !!(filter.functionId || filter.presentationId);
  return prisma.formLink.findMany({
    where: { eventId, ...filter, ...(targeted ? { bundle: false } : { parentId: null }) },
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
      bundle: true,
      parentId: true,
      function: { select: { id: true, name: true, functionNumber: true, breakoutGroup: { select: { name: true } } } },
      presentation: { select: { id: true, title: true } },
      children: {
        orderBy: BUNDLE_ORDER,
        select: {
          id: true,
          formType: true,
          submittedCount: true,
          revokedAt: true,
          function: { select: { id: true, name: true, functionNumber: true, breakoutGroup: { select: { name: true } } } },
          presentation: { select: { id: true, title: true } },
        },
      },
      workflowTemplate: { select: { name: true } },
      createdBy: { select: { name: true, email: true } },
    },
  });
}

export type SubmissionView = "open" | "done";

export async function listFormSubmissionsCore(eventId: string, view: SubmissionView, userId: string) {
  await requirePermissionForUser(userId, "FORMS", "VIEW", eventId);
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
        select: {
          function: { select: { name: true, functionNumber: true, breakoutGroup: { select: { name: true } } } },
          presentation: { select: { title: true } },
        },
      },
    },
  });
}

export async function loadFormSubmissionReviewCore(eventId: string, id: string, userId: string) {
  await requirePermissionForUser(userId, "FORMS", "VIEW", eventId);
  const tenantId = await requireEventTenantId(eventId);
  const sub = await prisma.formSubmission.findFirst({
    where: { id, eventId, tenantId, state: { not: "DRAFT" } },
    include: {
      formLink: {
        select: {
          formType: true,
          tenantId: true,
          eventId: true,
          functionId: true,
          contactId: true,
          presentationId: true,
          boothGroupId: true,
          config: true,
          recipientName: true,
          event: { select: { name: true, timezone: true } },
        },
      },
      files: { select: { id: true, fileName: true, fileSize: true, mimeType: true }, orderBy: { createdAt: "asc" } },
      handledBy: { select: { name: true, email: true } },
    },
  });
  if (!sub) return null;
  const mod = formModule(sub.formType);
  const snapshot = await mod.snapshot(sub.formLink);
  const sections = formConfig(sub.formLink).sections;
  return {
    submission: sub,
    functionId: sub.formLink.functionId,
    diff: mod.diff(sub.baseline, sub.payload, snapshot?.baseline ?? sub.baseline, sections),
    targetName: snapshot?.targetName ?? sub.formLink.event.name,
    open: mod.open,
    // Null when the target is gone; apply is then refused.
    version: snapshot?.version ?? null,
    choices: sub.state === "SUBMITTED" ? await mod.reviewChoices(sub.payload, sub.formLink, sub.files) : [],
  };
}

