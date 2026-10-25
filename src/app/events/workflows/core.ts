// Pure cores for workflow mutations callable from other entity cores during
// e.g. entity creation. NOT a "use server" file — see src/app/contacts/core.ts
// for the security rationale.

import type { EntityStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { countAtSteps, instanceProgress, isInstanceComplete } from "@/lib/workflowProgress";
import { isWorkflowCheckKey } from "@/lib/workflowChecks";
import { loadWorkflowChecks, withWorkflowChecks } from "@/lib/workflowCheckData";
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
  const rows = await prisma.workflowInstance.findMany({
    where: { entityType, entityId },
    select: {
      templateId: true,
      entityType: true,
      entityId: true,
      template: { select: { steps: { orderBy: { sortOrder: "asc" }, select: { id: true, completionMode: true, computedKey: true, items: { select: { id: true, required: true } } } } } },
      stepCompletions: { select: { stepId: true } },
      itemCompletions: { select: { itemId: true } },
    },
  });
  const instances = await withWorkflowChecks(rows);
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
  const rows = await prisma.workflowInstance.findMany({
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
  const checks = (await loadWorkflowChecks(entityType, [entityId])).get(entityId) ?? [];
  const instances = rows.map((r) => ({ ...r, checks }));

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


// For the event overview: how many of the given records sit at each step of
// each of the tenant's default templates for the type. Templates no record
// carries are left out. Permission and event ownership of `entityIds` are the
// caller's job.
export async function defaultWorkflowStepCounts(entityType: WorkflowEntityType, entityIds: string[], eventId: string) {
  if (entityIds.length === 0) return [];
  const templates = await prisma.workflowTemplate.findMany({
    where: { defaultForEntityTypes: { has: entityType }, tenant: { events: { some: { id: eventId } } } },
    select: { id: true, name: true, steps: { orderBy: { sortOrder: "asc" }, select: { id: true, label: true } } },
    orderBy: { name: "asc" },
  });
  const drawn = templates.filter((t) => t.steps.length > 0);
  if (drawn.length === 0) return [];
  const rows = await prisma.workflowInstance.findMany({
    where: { entityType, entityId: { in: entityIds }, templateId: { in: drawn.map((t) => t.id) } },
    select: {
      templateId: true,
      entityId: true,
      template: { select: { steps: { orderBy: { sortOrder: "asc" }, select: { id: true, completionMode: true, computedKey: true, items: { select: { id: true, required: true } } } } } },
      stepCompletions: { select: { stepId: true } },
      itemCompletions: { select: { itemId: true } },
    },
  });
  const checks = await loadWorkflowChecks(entityType, Array.from(new Set(rows.map((r) => r.entityId))));
  const instances = rows.map((r) => ({ ...r, checks: checks.get(r.entityId) ?? [] }));
  return drawn
    .map((t) => {
      const mine = instances.filter((i) => i.templateId === t.id);
      return { templateId: t.id, name: t.name, records: mine.length, steps: countAtSteps(t, mine) };
    })
    .filter((t) => t.records > 0);
}

// Keeps the status of records with automatic workflow steps current after a
// write that can flip a check (src/lib/workflowChecks.ts lists them): re-derives
// each record's status and writes it where it changed. Records whose workflows
// have no checked step are left alone, so a hand-set status survives unrelated
// edits; so are cancelled ones. Uses the global client: call it after the
// writing transaction commits, never inside it. Narrows `ids` to the event's
// own records; permission is the caller's job.
export async function refreshWorkflowStatus(entityType: WorkflowEntityType, ids: string[], eventId: string) {
  if (ids.length === 0) return;
  const records = await WORKFLOW_ENTITY_DELEGATES[entityType].findMany(Array.from(new Set(ids)), eventId);
  const live = records.filter((r) => r.status !== "CANCELLED");
  if (live.length === 0) return;
  const checked = await prisma.workflowInstance.findMany({
    where: {
      entityType,
      entityId: { in: live.map((r) => r.id) },
      template: { steps: { some: { completionMode: { not: "MANUAL" }, computedKey: { not: null } } } },
    },
    select: { entityId: true, template: { select: { steps: { select: { computedKey: true } } } } },
  });
  const affected = new Set(
    checked.filter((i) => i.template.steps.some((s) => isWorkflowCheckKey(s.computedKey))).map((i) => i.entityId),
  );
  for (const r of live) {
    if (!affected.has(r.id)) continue;
    const { status, substatus } = await resolveWorkflowStatus(entityType, r.id);
    if (status !== r.status || substatus !== r.substatus) {
      await updateEntityStatusCore(entityType, r.id, eventId, status, substatus);
    }
  }
}

// The orders linked to any of the functions, by type. Read before a write
// that drops the links (a function delete), refresh with refreshWorkflowStatusForOrders after.
export async function functionLinkedOrders(functionIds: string[], eventId: string) {
  const linked = { some: { functionId: { in: functionIds } } };
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
  if (functionIds.length === 0) return { av_order: [], setup_order: [], print_order: [], supply_order: [], catering_order: [] };
  const [av, setup, print, supply, catering] = await Promise.all([
    prisma.aVOrder.findMany({ where: { eventId, functionLinks: linked }, select: { id: true } }),
    prisma.setupOrder.findMany({ where: { eventId, functionLinks: linked }, select: { id: true } }),
    prisma.printOrder.findMany({ where: { eventId, functions: linked }, select: { id: true } }),
    prisma.supplyOrder.findMany({ where: { eventId, functions: linked }, select: { id: true } }),
    prisma.cateringOrder.findMany({ where: { eventId, functionId: { in: functionIds } }, select: { id: true } }),
  ]);
  return { av_order: ids(av), setup_order: ids(setup), print_order: ids(print), supply_order: ids(supply), catering_order: ids(catering) };
}

export async function refreshWorkflowStatusForOrders(orders: Partial<Record<WorkflowEntityType, string[]>>, eventId: string) {
  for (const [type, ids] of Object.entries(orders) as [WorkflowEntityType, string[]][]) {
    await refreshWorkflowStatus(type, ids, eventId);
  }
}

// A function's schedule, room or headcount feeds its own checks and its linked
// orders' SCHEDULED: refresh both.
export async function refreshWorkflowStatusForFunctions(functionIds: string[], eventId: string) {
  if (functionIds.length === 0) return;
  await refreshWorkflowStatus("function", functionIds, eventId);
  await refreshWorkflowStatusForOrders(await functionLinkedOrders(functionIds, eventId), eventId);
}

// RFP issue / close, its lines, quotes and awards feed RFP_ISSUED, QUOTES_IN
// and AWARDED on the orders its lines were copied from. Pass the order ids a
// write just moved lines off, too (`also`), since they no longer show up here.
export async function refreshWorkflowStatusForRfp(
  rfpId: string,
  eventId: string,
  also: { avOrderIds?: (string | null)[]; cateringOrderIds?: (string | null)[]; printOrderIds?: (string | null)[] } = {},
) {
  const lines = await prisma.rfpLineItem.findMany({
    where: { rfpId, rfp: { eventId } },
    select: { avOrderId: true, cateringOrderId: true, printOrderId: true },
  });
  const ids = (picked: (string | null)[], extra: (string | null)[] = []) =>
    Array.from(new Set([...picked, ...extra].filter((x): x is string => !!x)));
  await refreshWorkflowStatus("av_order", ids(lines.map((l) => l.avOrderId), also.avOrderIds), eventId);
  await refreshWorkflowStatus("catering_order", ids(lines.map((l) => l.cateringOrderId), also.cateringOrderIds), eventId);
  await refreshWorkflowStatus("print_order", ids(lines.map((l) => l.printOrderId), also.printOrderIds), eventId);
}
