// Pure cores for workflow mutations callable from other entity cores during
// e.g. entity creation. NOT a "use server" file — see src/app/contacts/core.ts
// for the security rationale.

import { prisma } from "@/lib/prisma";

export type WorkflowEntityType =
  | "function"
  | "catering_order"
  | "av_order"
  | "print_order"
  | "presentation"
  | "setup_order"
  | "supply_order"
  | "media_deliverable";

// Best-effort: stamps default workflow instances onto a freshly created entity.
// Permission and ownership are assumed to already be checked by the caller's
// core (which just created the entity in the same flow, so re-checking would
// be redundant).
export async function autoAssignDefaultWorkflowsCore(
  entityType: WorkflowEntityType,
  entityId: string,
) {
  const templates = await prisma.workflowTemplate.findMany({
    where: { defaultForEntityTypes: { has: entityType } },
    select: { id: true },
  });
  if (templates.length === 0) return;
  await prisma.workflowInstance.createMany({
    data: templates.map((t) => ({ templateId: t.id, entityType, entityId })),
    skipDuplicates: true,
  });
}
