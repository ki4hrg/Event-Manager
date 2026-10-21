// Pure cores for workflow mutations callable from other entity cores during
// e.g. entity creation. NOT a "use server" file — see src/app/contacts/core.ts
// for the security rationale.

import { prisma } from "@/lib/prisma";

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
