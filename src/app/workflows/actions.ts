"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PermissionResource } from "@prisma/client";
import type { EntityStatus } from "@prisma/client";

// --- Templates ---

export async function getWorkflowTemplates() {
  await requireAuth();
  return prisma.workflowTemplate.findMany({
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
  return prisma.workflowTemplate.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });
}

export async function getWorkflowTemplate(id: string) {
  await requireAuth();
  return prisma.workflowTemplate.findUnique({
    where: { id },
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

export async function createWorkflowTemplate(formData: FormData) {
  const session = await requirePermission(PermissionResource.WORKFLOWS, "WRITE");
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const defaultForEntityTypes = formData.getAll("defaultForEntityTypes") as string[];

  const maxOrder = await prisma.workflowTemplate.findFirst({
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const template = await prisma.workflowTemplate.create({
    data: {
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
    where: { id },
    data: { name, description: description || null, defaultForEntityTypes, pendingStatusValue, pendingSubstatusValue, completionStatusValue, completionSubstatusValue, updatedById: session.user.id },
  });

  revalidatePath(`/workflows/${id}`);
  revalidatePath("/workflows");
}

export async function deleteWorkflowTemplate(id: string) {
  await requirePermission(PermissionResource.WORKFLOWS, "DELETE");
  await prisma.workflowTemplate.delete({ where: { id } });
  redirect("/workflows");
}

// --- Steps ---

export async function createWorkflowStep(templateId: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.WORKFLOWS, "WRITE");
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
  const label = formData.get("label") as string;
  const pendingStatusValue = (formData.get("pendingStatusValue") as EntityStatus | null) || null;
  const pendingSubstatusValue = (formData.get("pendingSubstatusValue") as string | null) || null;

  await prisma.workflowStep.update({
    where: { id },
    data: { label, pendingStatusValue, pendingSubstatusValue },
  });
  await bumpWorkflowTemplate(templateId, session.user.id);
  revalidatePath(`/workflows/${templateId}`);
}

export async function deleteWorkflowStep(id: string, templateId: string) {
  const session = await requirePermission(PermissionResource.WORKFLOWS, "DELETE");
  await prisma.workflowStep.delete({ where: { id } });
  await bumpWorkflowTemplate(templateId, session.user.id);
  revalidatePath(`/workflows/${templateId}`);
}

export async function reorderWorkflowSteps(templateId: string, orderedIds: string[]) {
  const session = await requirePermission(PermissionResource.WORKFLOWS, "WRITE");
  await Promise.all(
    orderedIds.map((id, index) =>
      prisma.workflowStep.update({ where: { id }, data: { sortOrder: index } })
    )
  );
  await bumpWorkflowTemplate(templateId, session.user.id);
  revalidatePath(`/workflows/${templateId}`);
}

// --- Checklist Items ---

export async function createChecklistItem(stepId: string, templateId: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.WORKFLOWS, "WRITE");
  const label = formData.get("label") as string;

  const maxOrder = await prisma.workflowChecklistItem.findFirst({
    where: { stepId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

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
  const label = formData.get("label") as string;

  await prisma.workflowChecklistItem.update({ where: { id }, data: { label } });
  await bumpWorkflowTemplate(templateId, session.user.id);
  revalidatePath(`/workflows/${templateId}`);
}

export async function deleteChecklistItem(id: string, templateId: string) {
  const session = await requirePermission(PermissionResource.WORKFLOWS, "DELETE");
  await prisma.workflowChecklistItem.delete({ where: { id } });
  await bumpWorkflowTemplate(templateId, session.user.id);
  revalidatePath(`/workflows/${templateId}`);
}

export async function reorderChecklistItems(stepId: string, templateId: string, orderedIds: string[]) {
  const session = await requirePermission(PermissionResource.WORKFLOWS, "WRITE");
  await Promise.all(
    orderedIds.map((id, index) =>
      prisma.workflowChecklistItem.update({ where: { id }, data: { sortOrder: index } })
    )
  );
  await bumpWorkflowTemplate(templateId, session.user.id);
  revalidatePath(`/workflows/${templateId}`);
}
