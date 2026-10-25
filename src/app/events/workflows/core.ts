// Pure cores for workflow mutations callable from other entity cores during
// e.g. entity creation. NOT a "use server" file — see src/app/contacts/core.ts
// for the security rationale.

import type { EntityStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { instanceProgress, isInstanceComplete } from "@/lib/workflowProgress";
import { WORKFLOW_ENTITY_DELEGATES } from "./entity-delegates";

export type { WorkflowEntityType } from "./entity-types";
import type { WorkflowEntityType } from "./entity-types";

// Best-effort: stamps default workflow instances onto a freshly created entity,
// then applies the status its workflows call for — including any assigned
// before this call (a form link's template). Permission and ownership are
// assumed to already be checked by the caller's core (which just created the
// entity in the same flow, so re-checking would be redundant).
//
// `eventId` picks the tenant whose templates apply — every workflow-bearing
// entity hangs off an event. Uses the global client: call it after the
// creating transaction commits, never inside it. Returns the status it wrote
// (null when none), so a core can return its row as stored.
export async function autoAssignDefaultWorkflowsCore(
  entityType: WorkflowEntityType,
  entityId: string,
  eventId: string,
): Promise<ResolvedStatus | null> {
  const templates = await prisma.workflowTemplate.findMany({
    where: {
      defaultForEntityTypes: { has: entityType },
      tenant: { events: { some: { id: eventId } } },
    },
    select: { id: true },
  });
  if (templates.length > 0) {
    await prisma.workflowInstance.createMany({
      data: templates.map((t) => ({ templateId: t.id, entityType, entityId })),
      skipDuplicates: true,
    });
  }
  return applyAssignedWorkflowStatus(entityType, entityId, eventId);
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
  const complete = instances.every(isInstanceComplete);
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

type ResolvedStatus = { status: EntityStatus | null; substatus: string | null };

// The status an entity's assigned workflows call for, from their progress.
// `status: null` means no workflow sets one.
async function resolveWorkflowStatus(entityType: WorkflowEntityType, entityId: string): Promise<ResolvedStatus> {
  const instances = await prisma.workflowInstance.findMany({
    where: { entityType, entityId },
    // Assignment order, so "first template with a pending status" is stable —
    // a form link's own template is attached before the tenant defaults.
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
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

  const progress = new Map(instances.map((inst) => [inst.id, instanceProgress(inst)]));

  // Phase 0: workflow just assigned (no completions at all) → apply template-level pending status.
  const hasAnyCompletion = instances.some((inst) => inst.stepCompletions.length > 0 || inst.itemCompletions.length > 0);
  if (!hasAnyCompletion) {
    for (const instance of instances) {
      if (instance.template.pendingStatusValue) {
        return { status: instance.template.pendingStatusValue, substatus: instance.template.pendingSubstatusValue ?? null };
      }
    }
  }

  // Phase 1: each instance's current step (the first not done) with a pendingStatusValue.
  // Among instances, prefer the most-advanced one (highest sortOrder of current step).
  let pendingStatus: EntityStatus | null = null;
  let pendingSubstatus: string | null = null;
  let highestPendingOrder: number | null = null;

  for (const instance of instances) {
    const { current } = progress.get(instance.id)!;
    const step = current === null ? null : instance.template.steps[current];
    if (step?.pendingStatusValue) {
      if (highestPendingOrder === null || step.sortOrder > highestPendingOrder) {
        highestPendingOrder = step.sortOrder;
        pendingStatus = step.pendingStatusValue;
        pendingSubstatus = step.pendingSubstatusValue ?? null;
      }
    }
  }

  if (highestPendingOrder !== null) {
    return { status: pendingStatus, substatus: pendingSubstatus };
  }

  // Phase 2: all steps done (or no pendingStatusValue on uncompleted step).
  // Apply the completion status from any fully-completed instance's template.
  let completionStatus: EntityStatus | null = null;
  let completionSubstatus: string | null = null;

  for (const instance of instances) {
    if (progress.get(instance.id)!.current === null && instance.template.completionStatusValue) {
      completionStatus = instance.template.completionStatusValue;
      completionSubstatus = instance.template.completionSubstatusValue ?? null;
      break;
    }
  }

  return { status: completionStatus, substatus: completionSubstatus };
}

// Re-derives an entity's status from its assigned workflows' progress, and
// clears it when none sets one. Permission and ownership are the caller's job.
export async function recomputeEntityStatusCore(entityType: WorkflowEntityType, entityId: string, eventId: string) {
  const { status, substatus } = await resolveWorkflowStatus(entityType, entityId);
  await updateEntityStatusCore(entityType, entityId, eventId, status, substatus);
}

// On create: the assigned workflows' status wins over the create-time status
// (resolveCreateStatus / EventStatusDefault), which stays only when no
// workflow sets one — so unlike recompute, never clears it.
async function applyAssignedWorkflowStatus(entityType: WorkflowEntityType, entityId: string, eventId: string) {
  const { status, substatus } = await resolveWorkflowStatus(entityType, entityId);
  if (status === null) return null;
  await updateEntityStatusCore(entityType, entityId, eventId, status, substatus);
  return { status, substatus };
}

