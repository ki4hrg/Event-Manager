"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EntityStatus } from "@prisma/client";

// --- Templates ---

export async function getWorkflowTemplates() {
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
  return prisma.workflowTemplate.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });
}

export async function getWorkflowTemplate(id: string) {
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
    },
  });
}

export async function createWorkflowTemplate(formData: FormData) {
  await requireAdmin();
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
    },
  });

  redirect(`/workflows/${template.id}`);
}

export async function updateWorkflowTemplate(id: string, formData: FormData) {
  await requireAdmin();
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const defaultForEntityTypes = formData.getAll("defaultForEntityTypes") as string[];

  await prisma.workflowTemplate.update({
    where: { id },
    data: { name, description: description || null, defaultForEntityTypes },
  });

  revalidatePath(`/workflows/${id}`);
  revalidatePath("/workflows");
}

export async function deleteWorkflowTemplate(id: string) {
  await requireAdmin();
  await prisma.workflowTemplate.delete({ where: { id } });
  redirect("/workflows");
}

// --- Steps ---

export async function createWorkflowStep(templateId: string, formData: FormData) {
  await requireAdmin();
  const label = formData.get("label") as string;
  const pendingStatusValue = (formData.get("pendingStatusValue") as EntityStatus | null) || null;
  const pendingSubstatusValue = (formData.get("pendingSubstatusValue") as string | null) || null;
  const statusValue = (formData.get("statusValue") as EntityStatus | null) || null;
  const substatusValue = (formData.get("substatusValue") as string | null) || null;

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
      statusValue,
      substatusValue,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath(`/workflows/${templateId}`);
}

export async function updateWorkflowStep(id: string, templateId: string, formData: FormData) {
  await requireAdmin();
  const label = formData.get("label") as string;
  const pendingStatusValue = (formData.get("pendingStatusValue") as EntityStatus | null) || null;
  const pendingSubstatusValue = (formData.get("pendingSubstatusValue") as string | null) || null;
  const statusValue = (formData.get("statusValue") as EntityStatus | null) || null;
  const substatusValue = (formData.get("substatusValue") as string | null) || null;

  await prisma.workflowStep.update({
    where: { id },
    data: { label, pendingStatusValue, pendingSubstatusValue, statusValue, substatusValue },
  });
  revalidatePath(`/workflows/${templateId}`);
}

export async function deleteWorkflowStep(id: string, templateId: string) {
  await requireAdmin();
  await prisma.workflowStep.delete({ where: { id } });
  revalidatePath(`/workflows/${templateId}`);
}

export async function reorderWorkflowSteps(templateId: string, orderedIds: string[]) {
  await requireAdmin();
  await Promise.all(
    orderedIds.map((id, index) =>
      prisma.workflowStep.update({ where: { id }, data: { sortOrder: index } })
    )
  );
  revalidatePath(`/workflows/${templateId}`);
}

// --- Checklist Items ---

export async function createChecklistItem(stepId: string, templateId: string, formData: FormData) {
  await requireAdmin();
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

  revalidatePath(`/workflows/${templateId}`);
}

export async function updateChecklistItem(id: string, templateId: string, formData: FormData) {
  await requireAdmin();
  const label = formData.get("label") as string;

  await prisma.workflowChecklistItem.update({ where: { id }, data: { label } });
  revalidatePath(`/workflows/${templateId}`);
}

export async function deleteChecklistItem(id: string, templateId: string) {
  await requireAdmin();
  await prisma.workflowChecklistItem.delete({ where: { id } });
  revalidatePath(`/workflows/${templateId}`);
}

export async function reorderChecklistItems(stepId: string, templateId: string, orderedIds: string[]) {
  await requireAdmin();
  await Promise.all(
    orderedIds.map((id, index) =>
      prisma.workflowChecklistItem.update({ where: { id }, data: { sortOrder: index } })
    )
  );
  revalidatePath(`/workflows/${templateId}`);
}
