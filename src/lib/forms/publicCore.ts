// What the public form can do: save a draft, submit, discard, attach and
// remove files. Plain module, NOT "use server": every function takes a link
// already resolved from its token, so nothing here is reachable from the
// browser except through src/app/f/[token]/ (which resolves the token first).

import { randomUUID } from "crypto";
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from "fs";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveCreateStatus } from "@/lib/statusDefaults";
import { autoAssignDefaultWorkflowsCore } from "@/app/events/workflows/core";
import {
  getUploadDir,
  getUploadPath,
  sniffPublicUpload,
  cleanUploadFileName,
  PUBLIC_UPLOAD_MAX_BYTES,
  PUBLIC_UPLOAD_MAX_FILES,
  PUBLIC_UPLOAD_MAX_SUBMISSION_BYTES,
  PUBLIC_UPLOAD_MAX_LINK_BYTES_PER_HOUR,
} from "@/lib/uploads";
import { isEmailConfigured, sendFormReceiptEmail, sendFormSubmittedNotice } from "@/lib/email";
import {
  type ActiveFormLink,
  PublicFormError,
  assertLinkHasCapacity,
  claimSubmissionSlot,
  findDraft,
  formLinkIsFull,
  generateDraftKey,
  purgeStaleFormSubmissions,
  removeSubmissionFiles,
} from "./links";
import { formConfig, formModule } from "./index";
import type { FormSnapshot } from "./types";
import { FORM_TYPE_LABEL } from "./meta";

function submitterFields(formData: FormData, required: boolean) {
  const read = (key: string, max: number) => {
    const raw = formData.get(key);
    if (raw != null && typeof raw !== "string") throw new PublicFormError("invalid");
    const value = (raw ?? "").trim();
    if (value.length > max) throw new PublicFormError("invalid");
    return value || null;
  };
  const submitterName = read("submitterName", 120);
  const submitterEmail = read("submitterEmail", 200)?.toLowerCase() ?? null;
  const submitterOrg = read("submitterOrg", 120);
  if (submitterEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submitterEmail)) throw new PublicFormError("invalid");
  if (required && !submitterName) throw new PublicFormError("invalid");
  return { submitterName, submitterEmail, submitterOrg };
}

// The target as it is now, refusing a form rendered against an older version.
async function currentSnapshot(link: ActiveFormLink, formData: FormData): Promise<FormSnapshot<unknown>> {
  const snapshot = await formModule(link.formType).snapshot(link);
  if (!snapshot) throw new PublicFormError("closed");
  if (formData.get("version") !== snapshot.version) throw new PublicFormError("stale");
  return snapshot;
}

// Creates or updates this browser's draft. Returns the draft key the caller
// stores in the cookie.
export async function saveFormDraftCore(link: ActiveFormLink, draftKey: string | undefined, formData: FormData): Promise<string> {
  if (formLinkIsFull(link)) throw new PublicFormError("closed");
  const snapshot = await currentSnapshot(link, formData);
  const payload = await formModule(link.formType).parse(formData, snapshot, link);
  return writeDraft(link, draftKey, formData, payload, snapshot.baseline);
}

// The size cap on the posted baseline: well above any real projection, well
// under the Server Action body limit.
const MAX_POSTED_BASELINE_CHARS = 200_000;

// The baseline the form rendered against, as it posted it back. Null when the
// page predates the field. The submitter controls it like the rest of their
// payload; it only steers the rebase of their own draft.
function postedBaseline(formData: FormData): Prisma.InputJsonValue | null {
  const raw = formData.get("baseline");
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string" || raw.length > MAX_POSTED_BASELINE_CHARS) throw new PublicFormError("invalid");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new PublicFormError("invalid");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new PublicFormError("invalid");
  return value as Prisma.InputJsonValue;
}

// A submit or save that came back stale: keeps the answers as this browser's
// draft over the baseline the submitter saw, so the page's rebase brings in
// the staff changes and leaves theirs. Returns the draft key, or null when
// the answers don't fit the current form (or the link can't take a draft).
// Throws "invalid" for a malformed baseline.
export async function keepStaleAnswersCore(
  link: ActiveFormLink,
  draftKey: string | undefined,
  formData: FormData,
): Promise<string | null> {
  const baseline = postedBaseline(formData);
  if (!baseline || formLinkIsFull(link)) return null;
  const snapshot = await formModule(link.formType).snapshot(link);
  if (!snapshot) return null;
  try {
    const payload = await formModule(link.formType).parse(formData, snapshot, link);
    return await writeDraft(link, draftKey, formData, payload, baseline);
  } catch (err) {
    if (err instanceof PublicFormError) return null;
    throw err;
  }
}

async function writeDraft(
  link: ActiveFormLink,
  draftKey: string | undefined,
  formData: FormData,
  payload: unknown,
  baseline: unknown,
): Promise<string> {
  const submitter = submitterFields(formData, false);
  const data = {
    ...submitter,
    payload: payload as Prisma.InputJsonValue,
    baseline: baseline as Prisma.InputJsonValue,
  };
  const draft = await findDraft(link.id, draftKey);
  if (draft) {
    await prisma.formSubmission.update({ where: { id: draft.id }, data });
    return draft.draftKey;
  }
  await assertLinkHasCapacity(link.id);
  const created = await prisma.formSubmission.create({
    data: {
      ...data,
      draftKey: generateDraftKey(),
      tenantId: link.tenantId,
      eventId: link.eventId,
      formLinkId: link.id,
      formType: link.formType,
    },
  });
  return created.draftKey;
}

export async function submitFormCore(link: ActiveFormLink, draftKey: string | undefined, formData: FormData) {
  if (formLinkIsFull(link)) throw new PublicFormError("closed");
  const snapshot = await currentSnapshot(link, formData);
  const payload = await formModule(link.formType).parse(formData, snapshot, link);
  const submitter = submitterFields(formData, true);
  const draft = await findDraft(link.id, draftKey);
  if (!draft) await assertLinkHasCapacity(link.id);

  // The link template's pending status is applied by
  // autoAssignDefaultWorkflowsCore below, over this create-time default.
  const status = await resolveCreateStatus(link.eventId, "FORM_SUBMISSION");
  const template = link.workflowTemplateId
    ? await prisma.workflowTemplate.findFirst({
        where: { id: link.workflowTemplateId, tenantId: link.tenantId },
        select: { id: true },
      })
    : null;

  const data = {
    ...submitter,
    ...status,
    payload: payload as Prisma.InputJsonValue,
    baseline: snapshot.baseline as Prisma.InputJsonValue,
    state: "SUBMITTED" as const,
    submittedAt: new Date(),
    requiredTemplateId: template?.id ?? null,
  };
  const submission = await prisma.$transaction(async (tx) => {
    if (!(await claimSubmissionSlot(tx, link.id))) throw new PublicFormError("closed");
    if (draft) {
      const claimed = await tx.formSubmission.updateMany({ where: { id: draft.id, state: "DRAFT" }, data });
      if (claimed.count === 0) throw new PublicFormError("closed");
      return { id: draft.id };
    }
    return tx.formSubmission.create({
      data: {
        ...data,
        draftKey: generateDraftKey(),
        tenantId: link.tenantId,
        eventId: link.eventId,
        formLinkId: link.id,
        formType: link.formType,
      },
      select: { id: true },
    });
  });

  // Outside the transaction: the workflow helper uses the global client. The
  // link's template goes on first so its pending status leads.
  if (template) {
    await prisma.workflowInstance.createMany({
      data: [{ templateId: template.id, entityType: "form_submission", entityId: submission.id }],
      skipDuplicates: true,
    });
  }
  await autoAssignDefaultWorkflowsCore("form_submission", submission.id, link.eventId);

  notifySubmitted(link, submission.id, snapshot);
  purgeStaleFormSubmissions().catch(() => {});
}

function notifySubmitted(link: ActiveFormLink, submissionId: string, snapshot: FormSnapshot<unknown>) {
  if (!isEmailConfigured()) return;
  const formTitle = FORM_TYPE_LABEL[link.formType];
  const targetName = snapshot.targetName;
  if (link.recipientEmail) {
    sendFormReceiptEmail({ to: link.recipientEmail, eventName: link.event.name, formTitle, targetName }).catch(() => {});
  }
  if (link.createdById) {
    prisma.user
      .findUnique({ where: { id: link.createdById }, select: { email: true } })
      .then((u) =>
        u?.email
          ? sendFormSubmittedNotice({
              to: u.email,
              eventName: link.event.name,
              formTitle,
              targetName,
              reviewPath: `/events/${link.eventId}/forms/${submissionId}`,
            })
          : undefined,
      )
      .catch(() => {});
  }
}

export async function discardFormDraftCore(link: ActiveFormLink, draftKey: string | undefined) {
  const draft = await findDraft(link.id, draftKey);
  if (!draft) return;
  const done = await prisma.formSubmission.updateMany({
    where: { id: draft.id, state: "DRAFT" },
    data: { state: "WITHDRAWN", payload: {}, submitterName: null, submitterEmail: null, submitterOrg: null },
  });
  if (done.count === 0) return;
  await prisma.fileUpload.deleteMany({ where: { formSubmissionId: draft.id } });
  removeSubmissionFiles(draft.id);
}

export async function removeDraftFileCore(link: ActiveFormLink, draftKey: string | undefined, fileId: string) {
  const draft = await findDraft(link.id, draftKey);
  if (!draft) return;
  const file = await prisma.fileUpload.findFirst({ where: { id: fileId, formSubmissionId: draft.id } });
  if (!file) return;
  await prisma.fileUpload.delete({ where: { id: file.id } });
  const filePath = getUploadPath("formSubmission", draft.id, file.storedName);
  if (existsSync(filePath)) unlinkSync(filePath);
}

// Stores one uploaded file on this browser's draft, creating the draft when
// the upload comes first. Returns the draft key and the stored file.
export async function attachPublicUploadCore(link: ActiveFormLink, draftKey: string | undefined, file: File) {
  if (formLinkIsFull(link)) throw new PublicFormError("closed");
  // Staff host this link's uploads themselves.
  if (formConfig(link).mediaUploadUrl) throw new PublicFormError("upload");
  if (file.size === 0 || file.size > PUBLIC_UPLOAD_MAX_BYTES) throw new PublicFormError("upload");

  let draft = await findDraft(link.id, draftKey);
  if (draft) {
    const totals = await prisma.fileUpload.aggregate({
      where: { formSubmissionId: draft.id },
      _count: true,
      _sum: { fileSize: true },
    });
    if (totals._count >= PUBLIC_UPLOAD_MAX_FILES) throw new PublicFormError("upload");
    if ((totals._sum.fileSize ?? 0) + file.size > PUBLIC_UPLOAD_MAX_SUBMISSION_BYTES) throw new PublicFormError("upload");
  }
  const hour = await prisma.fileUpload.aggregate({
    where: { formSubmission: { formLinkId: link.id }, createdAt: { gt: new Date(Date.now() - 3_600_000) } },
    _sum: { fileSize: true },
  });
  if ((hour._sum.fileSize ?? 0) + file.size > PUBLIC_UPLOAD_MAX_LINK_BYTES_PER_HOUR) throw new PublicFormError("busy");

  const buffer = Buffer.from(await file.arrayBuffer());
  const kind = sniffPublicUpload(buffer, file.name);
  if (!kind) throw new PublicFormError("upload");

  if (!draft) {
    await assertLinkHasCapacity(link.id);
    const snapshot = await formModule(link.formType).snapshot(link);
    if (!snapshot) throw new PublicFormError("closed");
    const created = await prisma.formSubmission.create({
      data: {
        draftKey: generateDraftKey(),
        tenantId: link.tenantId,
        eventId: link.eventId,
        formLinkId: link.id,
        formType: link.formType,
        baseline: snapshot.baseline as Prisma.InputJsonValue,
      },
    });
    draft = { ...created, files: [] };
  }

  const storedName = `${randomUUID()}${kind.ext}`;
  const filePath = getUploadPath("formSubmission", draft.id, storedName);
  mkdirSync(getUploadDir("formSubmission", draft.id), { recursive: true });
  writeFileSync(filePath, buffer);
  try {
    const record = await prisma.fileUpload.create({
      data: {
        fileName: cleanUploadFileName(file.name),
        storedName,
        mimeType: kind.mimeType,
        fileSize: buffer.length,
        formSubmissionId: draft.id,
      },
      select: { id: true, fileName: true, fileSize: true },
    });
    return { draftKey: draft.draftKey, file: record };
  } catch (err) {
    if (existsSync(filePath)) unlinkSync(filePath);
    throw err;
  }
}
