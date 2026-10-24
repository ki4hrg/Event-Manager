"use server";

import { notFound } from "next/navigation";
import { requirePermission, type PermissionAction } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { EntityStatus } from "@prisma/client";
import { ENTITY_TYPE_RESOURCE } from "./entity-types";
import { WORKFLOW_ENTITY_DELEGATES } from "./entity-delegates";
import {
  autoAssignDefaultWorkflowsCore,
  recomputeEntityStatusCore,
  updateEntityStatusCore,
  type WorkflowEntityType as CoreWorkflowEntityType,
} from "./core";

export type WorkflowEntityType = CoreWorkflowEntityType;

// Confirms the entity actually belongs to the claimed event before mutation.
// Without this, a caller with ASSIGNED scope on event A could pass entityId from
// event B and the resource-level gate would still grant access.
async function assertEntityInEvent(
  entityType: WorkflowEntityType,
  entityId: string,
  eventId: string,
) {
  const found = await WORKFLOW_ENTITY_DELEGATES[entityType].find(entityId, eventId);
  if (!found) notFound();
}

// Confirms the workflow instance actually belongs to the claimed entity.
// Prevents a caller from passing an instanceId from a different entity/event
// while satisfying the resource gate on the supplied entity.
async function assertInstanceMatches(
  instanceId: string,
  entityType: WorkflowEntityType,
  entityId: string,
) {
  const inst = await prisma.workflowInstance.findUnique({
    where: { id: instanceId },
    select: { entityType: true, entityId: true },
  });
  if (!inst || inst.entityType !== entityType || inst.entityId !== entityId) notFound();
}

// Confirms a step / checklist item belongs to the instance's own template, so
// a completion can't be recorded against (or cascade from) a foreign step.
async function assertInInstanceTemplate(instanceId: string, ref: { stepId: string } | { itemId: string }) {
  const onInstance = { template: { instances: { some: { id: instanceId } } } };
  const found =
    "stepId" in ref
      ? await prisma.workflowStep.findFirst({ where: { id: ref.stepId, ...onInstance }, select: { id: true } })
      : await prisma.workflowChecklistItem.findFirst({ where: { id: ref.itemId, step: onInstance }, select: { id: true } });
  if (!found) notFound();
}

async function filterEntityIdsInEvent(
  entityType: WorkflowEntityType,
  entityIds: string[],
  eventId: string,
): Promise<string[]> {
  const rows = await WORKFLOW_ENTITY_DELEGATES[entityType].findMany(entityIds, eventId);
  return rows.map((r) => r.id);
}

async function gateWorkflowAction(
  entityType: WorkflowEntityType,
  eventId: string,
  action: PermissionAction,
) {
  return requirePermission(ENTITY_TYPE_RESOURCE[entityType], action, eventId);
}

function revalidateEntity(entityType: WorkflowEntityType, entityId: string, eventId: string) {
  revalidatePath(WORKFLOW_ENTITY_DELEGATES[entityType].path(eventId, entityId));
}

export async function getWorkflowInstances(entityType: WorkflowEntityType, entityId: string, eventId: string) {
  await gateWorkflowAction(entityType, eventId, "VIEW");
  await assertEntityInEvent(entityType, entityId, eventId);
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
  await gateWorkflowAction(entityType, eventId, "WRITE");
  await assertEntityInEvent(entityType, entityId, eventId);
  // The template must be the event's tenant's own; a foreign id would attach
  // (and then render) another organization's workflow.
  const template = await prisma.workflowTemplate.findFirst({
    where: { id: templateId, tenant: { events: { some: { id: eventId } } } },
    select: { id: true },
  });
  if (!template) notFound();
  await prisma.workflowInstance.create({
    data: { templateId, entityType, entityId },
  });
  await recomputeEntityStatusCore(entityType, entityId, eventId);
  revalidateEntity(entityType, entityId, eventId);
}

export async function removeWorkflow(
  instanceId: string,
  entityType: WorkflowEntityType,
  entityId: string,
  eventId: string
) {
  await gateWorkflowAction(entityType, eventId, "WRITE");
  await assertEntityInEvent(entityType, entityId, eventId);
  await assertInstanceMatches(instanceId, entityType, entityId);
  await prisma.workflowInstance.delete({ where: { id: instanceId } });
  // Recompute status since a workflow was removed
  await recomputeEntityStatusCore(entityType, entityId, eventId);
  revalidateEntity(entityType, entityId, eventId);
}

export async function toggleStepCompletion(
  instanceId: string,
  stepId: string,
  entityType: WorkflowEntityType,
  entityId: string,
  eventId: string
) {
  await gateWorkflowAction(entityType, eventId, "WRITE");
  await assertEntityInEvent(entityType, entityId, eventId);
  await assertInstanceMatches(instanceId, entityType, entityId);
  await assertInInstanceTemplate(instanceId, { stepId });
  const existing = await prisma.workflowStepCompletion.findUnique({
    where: { instanceId_stepId: { instanceId, stepId } },
  });

  if (existing) {
    // Unchecking: cascade delete this step + all subsequent steps in the template
    const instance = await prisma.workflowInstance.findUniqueOrThrow({
      where: { id: instanceId },
      include: {
        template: {
          include: {
            steps: {
              orderBy: { sortOrder: "asc" },
              include: { items: true },
            },
          },
        },
      },
    });

    const stepIndex = instance.template.steps.findIndex((s) => s.id === stepId);
    const affectedSteps = instance.template.steps.slice(stepIndex);
    const affectedStepIds = affectedSteps.map((s) => s.id);
    const affectedItemIds = affectedSteps.flatMap((s) => s.items.map((i) => i.id));

    const anyHaveStatus = affectedSteps.some((s) => s.pendingStatusValue !== null);

    await prisma.workflowStepCompletion.deleteMany({
      where: { instanceId, stepId: { in: affectedStepIds } },
    });
    if (affectedItemIds.length > 0) {
      await prisma.workflowChecklistCompletion.deleteMany({
        where: { instanceId, itemId: { in: affectedItemIds } },
      });
    }

    if (anyHaveStatus) {
      await recomputeEntityStatusCore(entityType, entityId, eventId);
    }
  } else {
    await prisma.workflowStepCompletion.create({ data: { instanceId, stepId } });
    await recomputeEntityStatusCore(entityType, entityId, eventId);
  }

  revalidateEntity(entityType, entityId, eventId);
}

export type WorkflowBadgeSummary = { count: number; done: number; total: number };

export async function getWorkflowBadgeSummaries(
  entityType: WorkflowEntityType,
  entityIds: string[],
  eventId: string
): Promise<Record<string, WorkflowBadgeSummary>> {
  await gateWorkflowAction(entityType, eventId, "VIEW");
  if (entityIds.length === 0) return {};

  // Restrict to ids that actually belong to this event; a caller could pass
  // ids from another event and the resource gate alone would still permit it.
  const ownedIds = await filterEntityIdsInEvent(entityType, entityIds, eventId);
  if (ownedIds.length === 0) return {};

  const instances = await prisma.workflowInstance.findMany({
    where: { entityType, entityId: { in: ownedIds } },
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
  await gateWorkflowAction(entityType, eventId, "WRITE");
  await assertEntityInEvent(entityType, entityId, eventId);
  await assertInstanceMatches(instanceId, entityType, entityId);
  await assertInInstanceTemplate(instanceId, { itemId });
  const existing = await prisma.workflowChecklistCompletion.findUnique({
    where: { instanceId_itemId: { instanceId, itemId } },
  });

  if (existing) {
    // Unchecking an item: step becomes incomplete → cascade subsequent steps
    const item = await prisma.workflowChecklistItem.findUniqueOrThrow({
      where: { id: itemId },
      include: { step: true },
    });

    const instance = await prisma.workflowInstance.findUniqueOrThrow({
      where: { id: instanceId },
      include: {
        template: {
          include: {
            steps: {
              orderBy: { sortOrder: "asc" },
              include: { items: true },
            },
          },
        },
      },
    });

    const stepIndex = instance.template.steps.findIndex((s) => s.id === item.stepId);
    // Cascade subsequent steps only (not the current step's other items)
    const subsequentSteps = instance.template.steps.slice(stepIndex + 1);
    const subsequentStepIds = subsequentSteps.map((s) => s.id);
    const subsequentItemIds = subsequentSteps.flatMap((s) => s.items.map((i) => i.id));

    const anyHaveStatus = [item.step, ...subsequentSteps].some(
      (s) => s.pendingStatusValue !== null
    );

    await prisma.workflowChecklistCompletion.delete({
      where: { instanceId_itemId: { instanceId, itemId } },
    });
    if (subsequentStepIds.length > 0) {
      await prisma.workflowStepCompletion.deleteMany({
        where: { instanceId, stepId: { in: subsequentStepIds } },
      });
    }
    if (subsequentItemIds.length > 0) {
      await prisma.workflowChecklistCompletion.deleteMany({
        where: { instanceId, itemId: { in: subsequentItemIds } },
      });
    }

    if (anyHaveStatus) {
      await recomputeEntityStatusCore(entityType, entityId, eventId);
    }
  } else {
    // Checking an item: if all items of parent step are now done, apply step's statusValue
    const item = await prisma.workflowChecklistItem.findUniqueOrThrow({
      where: { id: itemId },
      include: {
        step: {
          include: { items: true },
        },
      },
    });

    await prisma.workflowChecklistCompletion.create({ data: { instanceId, itemId } });

    const allItemIds = item.step.items.map((i) => i.id);
    const completedItems = await prisma.workflowChecklistCompletion.findMany({
      where: { instanceId, itemId: { in: allItemIds } },
    });

    if (completedItems.length === allItemIds.length) {
      await recomputeEntityStatusCore(entityType, entityId, eventId);
    }
  }

  revalidateEntity(entityType, entityId, eventId);
}

export async function setEntityStatus(
  entityType: WorkflowEntityType,
  entityId: string,
  eventId: string,
  formData: FormData
) {
  await gateWorkflowAction(entityType, eventId, "WRITE");
  await assertEntityInEvent(entityType, entityId, eventId);
  const status = (formData.get("status") as EntityStatus | null) || null;
  const substatus = (formData.get("substatus") as string | null) || null;
  await updateEntityStatusCore(entityType, entityId, eventId, status, substatus);
  revalidateEntity(entityType, entityId, eventId);
}

export async function cancelEntity(
  entityType: WorkflowEntityType,
  entityId: string,
  substatus: string,
  eventId: string
) {
  await gateWorkflowAction(entityType, eventId, "WRITE");
  await assertEntityInEvent(entityType, entityId, eventId);
  await updateEntityStatusCore(entityType, entityId, eventId, "CANCELLED", substatus);
  revalidateEntity(entityType, entityId, eventId);
}

export async function restoreEntity(
  entityType: WorkflowEntityType,
  entityId: string,
  eventId: string
) {
  await gateWorkflowAction(entityType, eventId, "WRITE");
  await assertEntityInEvent(entityType, entityId, eventId);
  await recomputeEntityStatusCore(entityType, entityId, eventId);
  revalidateEntity(entityType, entityId, eventId);
}

export async function autoAssignDefaultWorkflows(
  entityType: WorkflowEntityType,
  entityId: string,
  eventId: string
) {
  await gateWorkflowAction(entityType, eventId, "WRITE");
  await assertEntityInEvent(entityType, entityId, eventId);
  await autoAssignDefaultWorkflowsCore(entityType, entityId, eventId);
}
