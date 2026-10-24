// Mapping a requested item to the equipment catalog when a submission is
// applied: one review choice per requested item, defaulting to the catalog
// row of the same name. Server-only module.

import { prisma } from "@/lib/prisma";
import type { ReviewChoice } from "./types";

export const NOT_IN_CATALOG = "__blank__";

export type CatalogEntry = { id: string; name: string; category: string };

export function tenantCatalog(tenantId: string): Promise<CatalogEntry[]> {
  return prisma.equipment.findMany({
    where: { tenantId },
    select: { id: true, name: true, category: true },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  });
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function catalogChoice(catalog: CatalogEntry[], key: string, section: string, requested: string): ReviewChoice {
  return {
    key,
    section,
    label: `Catalog item for “${requested}”`,
    options: [{ value: NOT_IN_CATALOG, label: "Not in the catalog" }, ...catalog.map((e) => ({ value: e.id, label: `${e.category} · ${e.name}` }))],
    defaultValue: catalog.find((e) => sameName(e.name, requested))?.id ?? NOT_IN_CATALOG,
  };
}

// The catalog id the reviewer picked for a choice, or null.
export function pickedEquipment(choices: Record<string, string>, key: string): string | null {
  const v = choices[key];
  return v && v !== NOT_IN_CATALOG ? v : null;
}

// "Requested as …" when the catalog row's name isn't the submitter's wording.
export function requestedAs(catalog: CatalogEntry[], equipmentId: string | null, requested: string): string | null {
  const entry = equipmentId ? catalog.find((e) => e.id === equipmentId) : null;
  return entry && !sameName(entry.name, requested) ? `Requested as “${requested}”` : null;
}
