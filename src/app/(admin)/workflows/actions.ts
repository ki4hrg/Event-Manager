"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { requireActiveTenantId } from "@/lib/tenant";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PermissionResource } from "@prisma/client";
import type { EntityStatus, WorkflowCompletionMode } from "@prisma/client";
import { isWorkflowCheckKey } from "@/lib/workflowChecks";

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
  const template = await prisma.workflowTemplate.findFirst({
    where: { id: templateId, tenantId },
    select: { id: true },
  });
  if (!template) throw new Error("Workflow not found");
}

export async function createWorkflowTemplate(formData: FormData) {
  const session = await requirePermission(PermissionResource.WORKFLOWS, "WRITE");
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const defaultForEntityTypes = formData.getAll("defaultForEntityTypes") as string[];

  const maxOrder = await prisma.workflowTemplate.findFirst({
    where: { tenantId: session.tenantId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const template = await prisma.workflowTemplate.create({
    data: {
      tenantId: session.tenantId,
      name,
      description: description || null,
      defaultForEntityTypes,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
      updatedById: session.user.id,
    },
  });

  redirect(`/workflows/${template.id}`);
}

export async function updateWorkflowTemplate(id: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.WORKFLOWS, "WRITE");
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const defaultForEntityTypes = formData.getAll("defaultForEntityTypes") as string[];
  const pendingStatusValue = (formData.get("pendingStatusValue") as EntityStatus | null) || null;
  const pendingSubstatusValue = (formData.get("pendingSubstatusValue") as string | null) || null;
  const completionStatusValue = (formData.get("completionStatusValue") as EntityStatus | null) || null;
  const completionSubstatusValue = (formData.get("completionSubstatusValue") as string | null) || null;

  await prisma.workflowTemplate.update({
    where: { id, tenantId: session.tenantId },
    data: { name, description: description || null, defaultForEntityTypes, pendingStatusValue, pendingSubstatusValue, completionStatusValue, completionSubstatusValue, updatedById: session.user.id },
  });

  revalidatePath(`/workflows/${id}`);
  revalidatePath("/workflows");
}

export async function deleteWorkflowTemplate(id: string) {
  const { tenantId } = await requirePermission(PermissionResource.WORKFLOWS, "DELETE");
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
  const label = formData.get("label") as string;
  const pendingStatusValue = (formData.get("pendingStatusValue") as EntityStatus | null) || null;
  const pendingSubstatusValue = (formData.get("pendingSubstatusValue") as string | null) || null;

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
  const label = formData.get("label") as string;
  const pendingStatusValue = (formData.get("pendingStatusValue") as EntityStatus | null) || null;
  const pendingSubstatusValue = (formData.get("pendingSubstatusValue") as string | null) || null;

  await prisma.workflowStep.update({
    where: { id, templateId },
    data: { label, pendingStatusValue, pendingSubstatusValue, ...parseCompletion(formData) },
  });
  await bumpWorkflowTemplate(templateId, session.user.id);
  revalidatePath(`/workflows/${templateId}`);
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
    orderedIds.map((id, index) =>
      prisma.workflowStep.update({ where: { id, templateId }, data: { sortOrder: index } })
    )
  );
  await bumpWorkflowTemplate(templateId, session.user.id);
  revalidatePath(`/workflows/${templateId}`);
}

// --- Checklist Items ---

export async function createChecklistItem(stepId: string, templateId: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.WORKFLOWS, "WRITE");
  await assertTemplateInTenant(templateId, session.tenantId);
  const label = formData.get("label") as string;

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
  const label = formData.get("label") as string;
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
    orderedIds.map((id, index) =>
      prisma.workflowChecklistItem.update({ where: { id, step: { templateId } }, data: { sortOrder: index } })
    )
  );
  await bumpWorkflowTemplate(templateId, session.user.id);
  revalidatePath(`/workflows/${templateId}`);
}
