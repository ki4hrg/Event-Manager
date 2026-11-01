"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { requireActiveTenantId } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { EntityStatus, PermissionResource } from "@prisma/client";
import type { WorkflowCompletionMode } from "@prisma/client";
import { z } from "zod";
import { UserFacingError } from "@/lib/userErrors";
import { assertIds, formText, idList, parseArgs } from "@/lib/validation";
import { isWorkflowEntityType } from "@/app/events/workflows/entity-types";
import { isWorkflowCheckKey } from "@/lib/workflowChecks";
import { applyStatusMoves, stepChangeImpact } from "@/app/events/workflows/core";

const COMPLETION_MODES: readonly WorkflowCompletionMode[] = ["MANUAL", "AUTO", "PROMPT"];

// The step's completion fields, when the form posts them (the label and status
// forms don't). Automatic and confirm modes need a known check; manual drops it.
function parseCompletion(formData: FormData) {
  if (!formData.has("completionMode")) return {};
  const mode = formData.get("completionMode") as WorkflowCompletionMode;
  if (!COMPLETION_MODES.includes(mode)) throw new Error("Unknown completion mode");
  if (mode === "MANUAL") return { completionMode: mode, computedKey: null };
  const key = formData.get("computedKey") as string | null;
  if (!isWorkflowCheckKey(key)) throw new Error("Pick what completes the step");
  return { completionMode: mode, computedKey: key };
}

// What the template, step and item forms post, checked instead of cast.
const field = (formData: FormData, key: string) => {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
};
// A status select: blank is none. A substatus is a CustomOption label, stored as sent.
function statusValue(formData: FormData, key: string): EntityStatus | null {
  const v = field(formData, key);
  if (!v) return null;
  const parsed = z.enum(EntityStatus).safeParse(v);
  if (!parsed.success) throw new UserFacingError("Pick a status from the list");
  return parsed.data;
}
function entityTypes(formData: FormData) {
  const values = formData.getAll("defaultForEntityTypes");
  if (!values.every(isWorkflowEntityType)) throw new UserFacingError("Pick record types from the list");
  return Array.from(new Set(values));
}

// --- Templates ---

export async function getWorkflowTemplates() {
  await requireAuth();
  const tenantId = await requireActiveTenantId();
  return prisma.workflowTemplate.findMany({
    where: { tenantId },
    orderBy: { sortOrder: "asc" },
    include: {
      steps: {
        orderBy: { sortOrder: "asc" },
        include: {
          items: { orderBy: { sortOrder: "asc" } },
        },
      },
      _count: { select: { instances: true } },
    },
  });
}

// Lightweight query for assignment dropdowns — only id and name
export async function getWorkflowTemplateOptions() {
  await requireAuth();
  const tenantId = await requireActiveTenantId();
  return prisma.workflowTemplate.findMany({
    where: { tenantId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });
}

export async function getWorkflowTemplate(id: string) {
  await requireAuth();
  const tenantId = await requireActiveTenantId();
  return prisma.workflowTemplate.findFirst({
    where: { id, tenantId },
    include: {
      steps: {
        orderBy: { sortOrder: "asc" },
        include: {
          items: { orderBy: { sortOrder: "asc" } },
        },
      },
      _count: { select: { instances: true } },
      updatedBy: { select: { name: true, email: true } },
    },
  });
}

async function bumpWorkflowTemplate(templateId: string, userId: string) {
  await prisma.workflowTemplate.update({ where: { id: templateId }, data: { updatedById: userId } });
}

// Steps and checklist items are reached by template id; the template must be
// the tenant's own before any child row is written under it.
async function assertTemplateInTenant(templateId: string, tenantId: string) {
  assertIds(templateId);
  const template = await prisma.workflowTemplate.findFirst({
    where: { id: templateId, tenantId },
    select: { id: true },
  });
  if (!template) throw new Error("Workflow not found");
}

export async function createWorkflowTemplate(formData: FormData) {
  const session = await requirePermission(PermissionResource.WORKFLOWS, "WRITE");
  const name = formText(formData, "name", { label: "Name", max: 1_000, required: true });
  const description = formText(formData, "description", { label: "Description", max: 100_000 });
  const defaultForEntityTypes = entityTypes(formData);

  const maxOrder = await prisma.workflowTemplate.findFirst({
    where: { tenantId: session.tenantId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const template = await prisma.workflowTemplate.create({
    data: {
      tenantId: session.tenantId,
      name,
      description,
      defaultForEntityTypes,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
      updatedById: session.user.id,
    },
  });

  redirect(`/workflows/${template.id}`);
}

export async function updateWorkflowTemplate(id: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.WORKFLOWS, "WRITE");
  assertIds(id);
  const name = formText(formData, "name", { label: "Name", max: 1_000, required: true });
  const description = formText(formData, "description", { label: "Description", max: 100_000 });
  const defaultForEntityTypes = entityTypes(formData);
  const pendingStatusValue = statusValue(formData, "pendingStatusValue");
  const pendingSubstatusValue = formText(formData, "pendingSubstatusValue", { label: "Substatus", max: 1_000 });
  const completionStatusValue = statusValue(formData, "completionStatusValue");
  const completionSubstatusValue = formText(formData, "completionSubstatusValue", { label: "Substatus", max: 1_000 });

  await prisma.workflowTemplate.update({
    where: { id, tenantId: session.tenantId },
    data: { name, description, defaultForEntityTypes, pendingStatusValue, pendingSubstatusValue, completionStatusValue, completionSubstatusValue, updatedById: session.user.id },
  });

  revalidatePath(`/workflows/${id}`);
  revalidatePath("/workflows");
}

export async function deleteWorkflowTemplate(id: string) {
  const { tenantId } = await requirePermission(PermissionResource.WORKFLOWS, "DELETE");
  assertIds(id);
  // Submissions record the approval they need by id; deleting the template
  // would leave them unappliable.
  const awaiting = await prisma.formSubmission.count({
    where: { tenantId, requiredTemplateId: id, state: "SUBMITTED" },
  });
  if (awaiting > 0) {
    throw new Error(`${awaiting} form submission${awaiting === 1 ? " still needs" : "s still need"} this workflow's approval`);
  }
  await prisma.workflowTemplate.delete({ where: { id, tenantId } });
  redirect("/workflows");
}

// --- Steps ---

export async function createWorkflowStep(templateId: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.WORKFLOWS, "WRITE");
  await assertTemplateInTenant(templateId, session.tenantId);
  const label = formText(formData, "label", { label: "Label", max: 10_000, required: true });
  const pendingStatusValue = statusValue(formData, "pendingStatusValue");
  const pendingSubstatusValue = formText(formData, "pendingSubstatusValue", { label: "Substatus", max: 1_000 });

  const maxOrder = await prisma.workflowStep.findFirst({
    where: { templateId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.workflowStep.create({
    data: {
      templateId,
      label,
      pendingStatusValue,
      pendingSubstatusValue,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
    },
  });
  await bumpWorkflowTemplate(templateId, session.user.id);

  revalidatePath(`/workflows/${templateId}`);
}

export async function updateWorkflowStep(id: string, templateId: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.WORKFLOWS, "WRITE");
  await assertTemplateInTenant(templateId, session.tenantId);
  const label = formText(formData, "label", { label: "Label", max: 10_000, required: true });
  const pendingStatusValue = statusValue(formData, "pendingStatusValue");
  const pendingSubstatusValue = formText(formData, "pendingSubstatusValue", { label: "Substatus", max: 1_000 });

  const completion = parseCompletion(formData);
  // "Update them too" from the editor's prompt: move the records whose status
  // follows this workflow, worked out against the step as it was.
  const moves =
    completion.completionMode && formData.get("updateRecords") === "true"
      ? await stepChangeImpact(templateId, id, { completionMode: completion.completionMode, computedKey: completion.computedKey }, session.tenantId)
      : [];
  await prisma.workflowStep.update({
    where: { id, templateId },
    data: { label, pendingStatusValue, pendingSubstatusValue, ...completion },
  });
  await applyStatusMoves(moves);
  await bumpWorkflowTemplate(templateId, session.user.id);
  revalidatePath(`/workflows/${templateId}`);
}

// How many records' status would move if the step completed as the form
// says, for the editor's prompt before it saves.
export async function previewStepCompletionChange(id: string, templateId: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.WORKFLOWS, "WRITE");
  await assertTemplateInTenant(templateId, session.tenantId);
  const completion = parseCompletion(formData);
  if (!completion.completionMode) return { records: 0 };
  const moves = await stepChangeImpact(
    templateId,
    id,
    { completionMode: completion.completionMode, computedKey: completion.computedKey },
    session.tenantId,
  );
  return { records: moves.length };
}

export async function deleteWorkflowStep(id: string, templateId: string) {
  const session = await requirePermission(PermissionResource.WORKFLOWS, "DELETE");
  await assertTemplateInTenant(templateId, session.tenantId);
  await prisma.workflowStep.delete({ where: { id, templateId } });
  await bumpWorkflowTemplate(templateId, session.user.id);
  revalidatePath(`/workflows/${templateId}`);
}

export async function reorderWorkflowSteps(templateId: string, orderedIds: string[]) {
  const session = await requirePermission(PermissionResource.WORKFLOWS, "WRITE");
  await assertTemplateInTenant(templateId, session.tenantId);
  await Promise.all(
    parseArgs(idList(500), orderedIds).map((id, index) =>
      prisma.workflowStep.update({ where: { id, templateId }, data: { sortOrder: index } })
    )
  );
  await bumpWorkflowTemplate(templateId, session.user.id);
  revalidatePath(`/workflows/${templateId}`);
}

// --- Checklist Items ---

export async function createChecklistItem(stepId: string, templateId: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.WORKFLOWS, "WRITE");
  assertIds(stepId);
  await assertTemplateInTenant(templateId, session.tenantId);
  const label = formText(formData, "label", { label: "Label", max: 10_000, required: true });

  const maxOrder = await prisma.workflowChecklistItem.findFirst({
    where: { stepId, step: { templateId } },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const step = await prisma.workflowStep.findFirst({ where: { id: stepId, templateId }, select: { id: true } });
  if (!step) throw new Error("Workflow step not found");
  await prisma.workflowChecklistItem.create({
    data: {
      stepId,
      label,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
    },
  });
  await bumpWorkflowTemplate(templateId, session.user.id);

  revalidatePath(`/workflows/${templateId}`);
}

export async function updateChecklistItem(id: string, templateId: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.WORKFLOWS, "WRITE");
  await assertTemplateInTenant(templateId, session.tenantId);
  const label = formText(formData, "label", { label: "Label", max: 10_000, required: true });
  const required = formData.has("required") ? { required: formData.get("required") === "true" } : {};

  await prisma.workflowChecklistItem.update({ where: { id, step: { templateId } }, data: { label, ...required } });
  await bumpWorkflowTemplate(templateId, session.user.id);
  revalidatePath(`/workflows/${templateId}`);
}

export async function deleteChecklistItem(id: string, templateId: string) {
  const session = await requirePermission(PermissionResource.WORKFLOWS, "DELETE");
  await assertTemplateInTenant(templateId, session.tenantId);
  await prisma.workflowChecklistItem.delete({ where: { id, step: { templateId } } });
  await bumpWorkflowTemplate(templateId, session.user.id);
  revalidatePath(`/workflows/${templateId}`);
}

export async function reorderChecklistItems(stepId: string, templateId: string, orderedIds: string[]) {
  const session = await requirePermission(PermissionResource.WORKFLOWS, "WRITE");
  await assertTemplateInTenant(templateId, session.tenantId);
  await Promise.all(
    parseArgs(idList(500), orderedIds).map((id, index) =>
      prisma.workflowChecklistItem.update({ where: { id, step: { templateId } }, data: { sortOrder: index } })
    )
  );
  await bumpWorkflowTemplate(templateId, session.user.id);
  revalidatePath(`/workflows/${templateId}`);
}
