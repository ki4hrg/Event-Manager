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
