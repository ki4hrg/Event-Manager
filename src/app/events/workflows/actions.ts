"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export type WorkflowEntityType = "function" | "catering_order" | "av_order" | "presentation" | "setup_order";

function revalidateEntity(entityType: WorkflowEntityType, entityId: string, eventId: string) {
  switch (entityType) {
    case "function":
      revalidatePath(`/events/${eventId}/functions/${entityId}`);
      break;
    case "catering_order":
      revalidatePath(`/events/${eventId}/catering-orders/${entityId}`);
      break;
    case "av_order":
      revalidatePath(`/events/${eventId}/av-orders/${entityId}`);
      break;
    case "presentation":
      revalidatePath(`/events/${eventId}/presentations/${entityId}`);
      break;
    case "setup_order":
      revalidatePath(`/events/${eventId}/setup-orders/${entityId}`);
      break;
  }
}

export async function getWorkflowInstances(entityType: WorkflowEntityType, entityId: string) {
  return prisma.workflowInstance.findMany({
    where: { entityType, entityId },
    include: {
      template: {
        include: {
          steps: {
            orderBy: { sortOrder: "asc" },
            include: {
              items: { orderBy: { sortOrder: "asc" } },
            },
          },
        },
      },
      stepCompletions: true,
      itemCompletions: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function assignWorkflow(
  templateId: string,
  entityType: WorkflowEntityType,
  entityId: string,
  eventId: string
) {
  await prisma.workflowInstance.create({
    data: { templateId, entityType, entityId },
  });
  revalidateEntity(entityType, entityId, eventId);
}

export async function removeWorkflow(instanceId: string, entityType: WorkflowEntityType, entityId: string, eventId: string) {
  await prisma.workflowInstance.delete({ where: { id: instanceId } });
  revalidateEntity(entityType, entityId, eventId);
}

export async function toggleStepCompletion(
  instanceId: string,
  stepId: string,
  entityType: WorkflowEntityType,
  entityId: string,
  eventId: string
) {
  const existing = await prisma.workflowStepCompletion.findUnique({
    where: { instanceId_stepId: { instanceId, stepId } },
  });

  if (existing) {
    await prisma.workflowStepCompletion.delete({
      where: { instanceId_stepId: { instanceId, stepId } },
    });
  } else {
    await prisma.workflowStepCompletion.create({
      data: { instanceId, stepId },
    });
  }

  revalidateEntity(entityType, entityId, eventId);
}

export type WorkflowBadgeSummary = { count: number; done: number; total: number };

export async function getWorkflowBadgeSummaries(
  entityType: WorkflowEntityType,
  entityIds: string[]
): Promise<Record<string, WorkflowBadgeSummary>> {
  if (entityIds.length === 0) return {};

  const instances = await prisma.workflowInstance.findMany({
    where: { entityType, entityId: { in: entityIds } },
    include: {
      template: {
        include: {
          steps: {
            orderBy: { sortOrder: "asc" },
            include: { items: { orderBy: { sortOrder: "asc" } } },
          },
        },
      },
      stepCompletions: true,
      itemCompletions: true,
    },
  });

  const result: Record<string, WorkflowBadgeSummary> = {};

  for (const instance of instances) {
    const eid = instance.entityId;
    if (!result[eid]) result[eid] = { count: 0, done: 0, total: 0 };
    result[eid].count += 1;

    const completedStepIds = new Set(instance.stepCompletions.map((c) => c.stepId));
    const completedItemIds = new Set(instance.itemCompletions.map((c) => c.itemId));

    for (const step of instance.template.steps) {
      if (step.items.length === 0) {
        result[eid].total += 1;
        if (completedStepIds.has(step.id)) result[eid].done += 1;
      } else {
        for (const item of step.items) {
          result[eid].total += 1;
          if (completedItemIds.has(item.id)) result[eid].done += 1;
        }
      }
    }
  }

  return result;
}

export async function toggleItemCompletion(
  instanceId: string,
  itemId: string,
  entityType: WorkflowEntityType,
  entityId: string,
  eventId: string
) {
  const existing = await prisma.workflowChecklistCompletion.findUnique({
    where: { instanceId_itemId: { instanceId, itemId } },
  });

  if (existing) {
    await prisma.workflowChecklistCompletion.delete({
      where: { instanceId_itemId: { instanceId, itemId } },
    });
  } else {
    await prisma.workflowChecklistCompletion.create({
      data: { instanceId, itemId },
    });
  }

  revalidateEntity(entityType, entityId, eventId);
}
