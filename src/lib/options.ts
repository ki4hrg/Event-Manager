import { prisma } from "@/lib/prisma";
import type { OptionCategory } from "@/lib/optionCategories";

// Dropdown options are per tenant. The Server Action `getOptions` in
// src/app/settings/actions.ts reads the active tenant's; these helpers are for
// callers that have no session — the unauthenticated share routes and the
// auth-free report actions — which know the tenant only through an event.
// Deliberately NOT a "use server" module: a tenant-explicit action would let a
// client read any tenant's labels by passing its id.

export async function getOptionsForTenant(tenantId: string, category: OptionCategory) {
  return prisma.customOption.findMany({
    where: { tenantId, category },
    orderBy: { sortOrder: "asc" },
  });
}

export async function getOptionsForEvent(eventId: string, category: OptionCategory) {
  return prisma.customOption.findMany({
    where: optionsWhereForEvent(eventId, category),
    orderBy: { sortOrder: "asc" },
  });
}

// Relation filter selecting the options of whichever tenant owns `eventId`,
// for queries that only hold an event id.
export function optionsWhereForEvent(eventId: string, category: OptionCategory) {
  return { category, tenant: { events: { some: { id: eventId } } } } as const;
}
