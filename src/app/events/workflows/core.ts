// Pure cores for workflow mutations callable from other entity cores during
// e.g. entity creation. NOT a "use server" file — see src/app/contacts/core.ts
// for the security rationale.

import type { EntityStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { WORKFLOW_ENTITY_DELEGATES } from "./entity-delegates";

export type { WorkflowEntityType } from "./entity-types";
import type { WorkflowEntityType } from "./entity-types";

// Best-effort: stamps default workflow instances onto a freshly created entity.
// Permission and ownership are assumed to already be checked by the caller's
// core (which just created the entity in the same flow, so re-checking would
// be redundant).
//
// `eventId` picks the tenant whose templates apply — every workflow-bearing
// entity hangs off an event.
export async function autoAssignDefaultWorkflowsCore(
  entityType: WorkflowEntityType,
  entityId: string,
  eventId: string,
) {
  const templates = await prisma.workflowTemplate.findMany({
    where: {
      defaultForEntityTypes: { has: entityType },
      tenant: { events: { some: { id: eventId } } },
    },
    select: { id: true },
  });
  if (templates.length === 0) return;
  await prisma.workflowInstance.createMany({
    data: templates.map((t) => ({ templateId: t.id, entityType, entityId })),
    skipDuplicates: true,
  });
}

// Whether every workflow on an entity is fully done (every step, and every
// checklist item under it), and which templates are assigned. Gates the
// apply of a form submission behind its approval workflow.
export async function workflowCompletionCore(entityType: WorkflowEntityType, entityId: string) {
  const instances = await prisma.workflowInstance.findMany({
    where: { entityType, entityId },
    select: {
      templateId: true,
      template: { select: { steps: { select: { id: true, items: { select: { id: true } } } } } },
      stepCompletions: { select: { stepId: true } },
      itemCompletions: { select: { itemId: true } },
    },
  });
  const complete = instances.every((inst) => {
    const steps = new Set(inst.stepCompletions.map((c) => c.stepId));
    const items = new Set(inst.itemCompletions.map((c) => c.itemId));
    return inst.template.steps.every((s) =>
      s.items.length === 0 ? steps.has(s.id) : s.items.every((i) => items.has(i.id)),
    );
  });
  return { complete, templateIds: new Set(instances.map((i) => i.templateId)), count: instances.length };
}

// Writes an entity's status columns. Event ownership is in the delegate's
// where, so a foreign entityId throws instead of writing. Permission is the
// caller's job.
export async function updateEntityStatusCore(
  entityType: WorkflowEntityType,
  entityId: string,
  eventId: string,
  status: EntityStatus | null,
  substatus: string | null,
) {
  await WORKFLOW_ENTITY_DELEGATES[entityType].updateStatus(entityId, eventId, status, substatus);
}

function isStepDone(
  step: { id: string; items: { id: string }[] },
  completedStepIds: Set<string>,
  completedItemIds: Set<string>
): boolean {
  if (step.items.length === 0) return completedStepIds.has(step.id);
  return step.items.every((item) => completedItemIds.has(item.id));
}

// Re-derives an entity's status from its assigned workflows' progress.
// Permission and ownership are the caller's job.
export async function recomputeEntityStatusCore(entityType: WorkflowEntityType, entityId: string, eventId: string) {
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
        await updateEntityStatusCore(entityType, entityId, eventId, instance.template.pendingStatusValue, instance.template.pendingSubstatusValue ?? null);
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
    await updateEntityStatusCore(entityType, entityId, eventId, pendingStatus, pendingSubstatus);
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

  await updateEntityStatusCore(entityType, entityId, eventId, completionStatus, completionSubstatus);
}

