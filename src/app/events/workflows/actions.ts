"use server";

import { notFound } from "next/navigation";
import { requirePermission, type PermissionAction } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { EntityStatus, PermissionResource } from "@prisma/client";
import { autoAssignDefaultWorkflowsCore, type WorkflowEntityType as CoreWorkflowEntityType } from "./core";

export type WorkflowEntityType = CoreWorkflowEntityType;

function entityResource(entityType: WorkflowEntityType): PermissionResource {
  switch (entityType) {
    case "function": return "FUNCTIONS";
    case "catering_order": return "CATERING_ORDERS";
    case "av_order": return "AV_ORDERS";
    case "print_order": return "PRINT_ORDERS";
    case "presentation": return "PRESENTATIONS";
    case "setup_order": return "SETUP_ORDERS";
    case "supply_order": return "SUPPLY_ORDERS";
    case "media_deliverable": return "MEDIA_DELIVERABLES";
  }
}

// Confirms the entity actually belongs to the claimed event before mutation.
// Without this, a caller with ASSIGNED scope on event A could pass entityId from
// event B and the resource-level gate would still grant access.
async function assertEntityInEvent(
  entityType: WorkflowEntityType,
  entityId: string,
  eventId: string,
) {
  const select = { eventId: true };
  const found = await (() => {
    switch (entityType) {
      case "function": return prisma.function.findUnique({ where: { id: entityId }, select });
      case "catering_order": return prisma.cateringOrder.findUnique({ where: { id: entityId }, select });
      case "av_order": return prisma.aVOrder.findUnique({ where: { id: entityId }, select });
      case "print_order": return prisma.printOrder.findUnique({ where: { id: entityId }, select });
      case "presentation": return prisma.presentation.findUnique({ where: { id: entityId }, select });
      case "setup_order": return prisma.setupOrder.findUnique({ where: { id: entityId }, select });
      case "supply_order": return prisma.supplyOrder.findUnique({ where: { id: entityId }, select });
      case "media_deliverable": return prisma.mediaDeliverable.findUnique({ where: { id: entityId }, select });
    }
  })();
  if (!found || found.eventId !== eventId) notFound();
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

async function filterEntityIdsInEvent(
  entityType: WorkflowEntityType,
  entityIds: string[],
  eventId: string,
): Promise<string[]> {
  const where = { id: { in: entityIds }, eventId };
  const select = { id: true };
  const rows = await (() => {
    switch (entityType) {
      case "function": return prisma.function.findMany({ where, select });
      case "catering_order": return prisma.cateringOrder.findMany({ where, select });
      case "av_order": return prisma.aVOrder.findMany({ where, select });
      case "print_order": return prisma.printOrder.findMany({ where, select });
      case "presentation": return prisma.presentation.findMany({ where, select });
      case "setup_order": return prisma.setupOrder.findMany({ where, select });
      case "supply_order": return prisma.supplyOrder.findMany({ where, select });
      case "media_deliverable": return prisma.mediaDeliverable.findMany({ where, select });
    }
  })();
  return rows.map((r) => r.id);
}

async function gateWorkflowAction(
  entityType: WorkflowEntityType,
  eventId: string,
  action: PermissionAction,
) {
  return requirePermission(entityResource(entityType), action, eventId);
}

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
    case "print_order":
      revalidatePath(`/events/${eventId}/print-orders/${entityId}`);
      break;
    case "presentation":
      revalidatePath(`/events/${eventId}/presentations/${entityId}`);
      break;
    case "setup_order":
      revalidatePath(`/events/${eventId}/setup-orders/${entityId}`);
      break;
    case "supply_order":
      revalidatePath(`/events/${eventId}/supply-orders/${entityId}`);
      break;
    case "media_deliverable":
      revalidatePath(`/events/${eventId}/media-deliverables/${entityId}`);
      break;
  }
}

async function updateEntityStatus(
  entityType: WorkflowEntityType,
  entityId: string,
  status: EntityStatus | null,
  substatus: string | null
) {
  const data = { status, substatus };
  switch (entityType) {
    case "function":
      await prisma.function.update({ where: { id: entityId }, data });
      break;
    case "catering_order":
      await prisma.cateringOrder.update({ where: { id: entityId }, data });
      break;
    case "av_order":
      await prisma.aVOrder.update({ where: { id: entityId }, data });
      break;
    case "print_order":
      await prisma.printOrder.update({ where: { id: entityId }, data });
      break;
    case "presentation":
      await prisma.presentation.update({ where: { id: entityId }, data });
      break;
    case "setup_order":
      await prisma.setupOrder.update({ where: { id: entityId }, data });
      break;
    case "supply_order":
      await prisma.supplyOrder.update({ where: { id: entityId }, data });
      break;
    case "media_deliverable":
      await prisma.mediaDeliverable.update({ where: { id: entityId }, data });
      break;
  }
}

function isStepDone(
  step: { id: string; items: { id: string }[] },
  completedStepIds: Set<string>,
  completedItemIds: Set<string>
): boolean {
  if (step.items.length === 0) return completedStepIds.has(step.id);
  return step.items.every((item) => completedItemIds.has(item.id));
}

async function recomputeEntityStatus(entityType: WorkflowEntityType, entityId: string) {
  const instances = await prisma.workflowInstance.findMany({
    where: { entityType, entityId },
    include: {
      template: {
        include: {
          steps: {
            orderBy: { sortOrder: "asc" },
            include: { items: true },
          },
        },
      },
      stepCompletions: true,
      itemCompletions: true,
    },
  });

  type InstanceSets = { completedStepIds: Set<string>; completedItemIds: Set<string> };
  const instanceSets = new Map<string, InstanceSets>(
    instances.map((inst) => [
      inst.id,
      {
        completedStepIds: new Set(inst.stepCompletions.map((c) => c.stepId)),
        completedItemIds: new Set(inst.itemCompletions.map((c) => c.itemId)),
      },
    ])
  );

  // Phase 0: workflow just assigned (no completions at all) → apply template-level pending status.
  const hasAnyCompletion = instances.some((inst) => {
    const { completedStepIds, completedItemIds } = instanceSets.get(inst.id)!;
    return completedStepIds.size > 0 || completedItemIds.size > 0;
  });
  if (!hasAnyCompletion) {
    for (const instance of instances) {
      if (instance.template.pendingStatusValue) {
        await updateEntityStatus(entityType, entityId, instance.template.pendingStatusValue, instance.template.pendingSubstatusValue ?? null);
        return;
      }
    }
  }

  // Phase 1: find the first uncompleted step with pendingStatusValue across all instances.
  // Among instances, prefer the most-advanced one (highest sortOrder of first uncompleted step).
  let pendingStatus: EntityStatus | null = null;
  let pendingSubstatus: string | null = null;
  let highestPendingOrder: number | null = null;

  for (const instance of instances) {
    const { completedStepIds, completedItemIds } = instanceSets.get(instance.id)!;

    for (const step of instance.template.steps) {
      if (!isStepDone(step, completedStepIds, completedItemIds)) {
        if (step.pendingStatusValue) {
          if (highestPendingOrder === null || step.sortOrder > highestPendingOrder) {
            highestPendingOrder = step.sortOrder;
            pendingStatus = step.pendingStatusValue;
            pendingSubstatus = step.pendingSubstatusValue ?? null;
          }
        }
        break; // Steps are sequential — stop at first uncompleted per instance
      }
    }
  }

  if (highestPendingOrder !== null) {
    await updateEntityStatus(entityType, entityId, pendingStatus, pendingSubstatus);
    return;
  }

  // Phase 2: all steps done (or no pendingStatusValue on uncompleted step).
  // Apply the completion status from any fully-completed instance's template.
  let completionStatus: EntityStatus | null = null;
  let completionSubstatus: string | null = null;

  for (const instance of instances) {
    const { completedStepIds, completedItemIds } = instanceSets.get(instance.id)!;
    const allDone = instance.template.steps.every((s) =>
      isStepDone(s, completedStepIds, completedItemIds)
    );
    if (allDone && instance.template.completionStatusValue) {
      completionStatus = instance.template.completionStatusValue;
      completionSubstatus = instance.template.completionSubstatusValue ?? null;
      break;
    }
  }

  await updateEntityStatus(entityType, entityId, completionStatus, completionSubstatus);
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
  await prisma.workflowInstance.create({
    data: { templateId, entityType, entityId },
  });
  await recomputeEntityStatus(entityType, entityId);
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
  await recomputeEntityStatus(entityType, entityId);
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
      await recomputeEntityStatus(entityType, entityId);
    }
  } else {
    await prisma.workflowStepCompletion.create({ data: { instanceId, stepId } });
    await recomputeEntityStatus(entityType, entityId);
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
      await recomputeEntityStatus(entityType, entityId);
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
      await recomputeEntityStatus(entityType, entityId);
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
  await updateEntityStatus(entityType, entityId, status, substatus);
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
  await updateEntityStatus(entityType, entityId, "CANCELLED", substatus);
  revalidateEntity(entityType, entityId, eventId);
}

export async function restoreEntity(
  entityType: WorkflowEntityType,
  entityId: string,
  eventId: string
) {
  await gateWorkflowAction(entityType, eventId, "WRITE");
  await assertEntityInEvent(entityType, entityId, eventId);
  await recomputeEntityStatus(entityType, entityId);
  revalidateEntity(entityType, entityId, eventId);
}

export async function autoAssignDefaultWorkflows(
  entityType: WorkflowEntityType,
  entityId: string,
  eventId: string
) {
  await gateWorkflowAction(entityType, eventId, "WRITE");
  await assertEntityInEvent(entityType, entityId, eventId);
  await autoAssignDefaultWorkflowsCore(entityType, entityId);
}
