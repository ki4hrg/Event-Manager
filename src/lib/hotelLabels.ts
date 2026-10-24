// Amenity and concession labels are a controlled vocabulary: every stored
// label is one of the tenant's hotel_amenity / rfp_concession options, so
// "Free breakfast" and "Breakfast included" can't both exist. Writers resolve
// input through requireListLabels; Settings merges and maps labels through
// mergeHotelLabel. Plain module: cores, the settings actions and MCP share it.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { labelKey } from "@/lib/hotels";
// Circular with the registry, which builds its merge targets from this
// module; each side reads the other only inside function bodies.
import { LIST_HOMES, OPTION_CATEGORIES } from "@/lib/optionCategories";

export type HotelLabelCategory = "hotel_amenity" | "rfp_concession" | "rfp_term";

// Each input label as the list spells it (matched by labelKey). An unknown
// label throws, unless it's in `keep` — a label the record already holds,
// so a legacy row can be saved unchanged until it's mapped in Settings.
export async function requireListLabels(
  tenantId: string,
  category: HotelLabelCategory,
  labels: string[],
  keep: string[] = [],
): Promise<string[]> {
  if (labels.length === 0) return [];
  const options = await prisma.customOption.findMany({ where: { tenantId, category }, select: { label: true } });
  const byKey = new Map(options.map((o) => [labelKey(o.label), o.label]));
  const kept = new Set(keep);
  return labels.map((raw) => {
    const label = raw.trim();
    const listed = byKey.get(labelKey(label));
    if (listed) return listed;
    if (kept.has(label)) return label;
    throw new Error(`"${label}" isn't in the ${OPTION_CATEGORIES[category].mergeable.noun} list (${LIST_HOMES[category]})`);
  });
}

const replaceInArray = (column: string) => `
  CASE WHEN $2 = ANY("${column}") THEN array_remove("${column}", $1) ELSE array_replace("${column}", $1, $2) END`;

// Moves every use of label `from` to `to` in one tenant (a rename when `to`
// is new, a merge when it's already in use). Rows that would end up with
// `to` twice keep the one they had.
export async function mergeHotelLabel(tx: Prisma.TransactionClient, tenantId: string, category: HotelLabelCategory, from: string, to: string) {
  if (from === to) return;
  const inTenant = { event: { tenantId } } as const;
  switch (category) {
    case "hotel_amenity": {
      await tx.$executeRawUnsafe(
        `UPDATE "Venue" SET "amenities" = ${replaceInArray("amenities")} WHERE "tenantId" = $3 AND $1 = ANY("amenities")`,
        from,
        to,
        tenantId,
      );
      await tx.$executeRawUnsafe(
        `UPDATE "Rfp" r SET "amenities" = ${replaceInArray("amenities")} FROM "Event" e WHERE e."id" = r."eventId" AND e."tenantId" = $3 AND $1 = ANY(r."amenities")`,
        from,
        to,
        tenantId,
      );
      await tx.hotelProposalAmenity.deleteMany({
        where: { label: from, proposal: { ...inTenant, amenities: { some: { label: to } } } },
      });
      await tx.hotelProposalAmenity.updateMany({ where: { label: from, proposal: inTenant }, data: { label: to } });
      break;
    }
    case "rfp_concession": {
      // Offered-unasked rows.
      await tx.hotelProposalConcession.deleteMany({
        where: { label: from, proposal: { ...inTenant, concessions: { some: { label: to } } } },
      });
      await tx.hotelProposalConcession.updateMany({ where: { label: from, proposal: inTenant }, data: { label: to } });
      // Requested rows: an RFP asking for both keeps `to`, taking over the
      // hotels' answers to `from` where they hadn't answered `to`.
      const rows = await tx.rfpConcession.findMany({ where: { label: from, rfp: { ...inTenant, kind: "HOTEL" } }, select: { id: true, rfpId: true } });
      for (const row of rows) {
        const sibling = await tx.rfpConcession.findFirst({ where: { rfpId: row.rfpId, label: to }, select: { id: true } });
        if (!sibling) {
          await tx.rfpConcession.update({ where: { id: row.id }, data: { label: to } });
          continue;
        }
        await tx.hotelProposalConcession.deleteMany({
          where: { concessionId: row.id, proposal: { concessions: { some: { concessionId: sibling.id } } } },
        });
        await tx.hotelProposalConcession.updateMany({ where: { concessionId: row.id }, data: { concessionId: sibling.id } });
        await tx.rfpConcession.delete({ where: { id: row.id } });
      }
      break;
    }
    case "rfp_term": {
      // A vendor RFP's terms; one asking for both keeps `to`.
      await tx.rfpConcession.deleteMany({
        where: { label: from, rfp: { ...inTenant, kind: { not: "HOTEL" }, concessions: { some: { label: to } } } },
      });
      await tx.rfpConcession.updateMany({ where: { label: from, rfp: { ...inTenant, kind: { not: "HOTEL" } } }, data: { label: to } });
      break;
    }
    default: {
      const _exhaustive: never = category;
      throw new Error(`Unhandled label category: ${_exhaustive}`);
    }
  }
}

// How many records hold each label of the list, on or off it (labels typed
// before the lists were strict show up here too).
export async function hotelLabelUses(db: Prisma.TransactionClient, tenantId: string, category: HotelLabelCategory): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const add = (label: string | null) => {
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  };
  const inTenant = { event: { tenantId } } as const;
  switch (category) {
    case "hotel_amenity": {
      const [venues, rfps, rows] = await Promise.all([
        db.venue.findMany({ where: { tenantId }, select: { amenities: true } }),
        db.rfp.findMany({ where: inTenant, select: { amenities: true } }),
        db.hotelProposalAmenity.findMany({ where: { proposal: inTenant }, select: { label: true } }),
      ]);
      venues.forEach((v) => v.amenities.forEach(add));
      rfps.forEach((r) => r.amenities.forEach(add));
      rows.forEach((r) => add(r.label));
      break;
    }
    case "rfp_term": {
      const rows = await db.rfpConcession.findMany({ where: { rfp: { ...inTenant, kind: { not: "HOTEL" } } }, select: { label: true } });
      rows.forEach((r) => add(r.label));
      break;
    }
    case "rfp_concession": {
      const [requested, offered] = await Promise.all([
        db.rfpConcession.findMany({ where: { rfp: { ...inTenant, kind: "HOTEL" } }, select: { label: true } }),
        db.hotelProposalConcession.findMany({ where: { label: { not: null }, proposal: inTenant }, select: { label: true } }),
      ]);
      requested.forEach((r) => add(r.label));
      offered.forEach((r) => add(r.label));
      break;
    }
    default: {
      const _exhaustive: never = category;
      throw new Error(`Unhandled label category: ${_exhaustive}`);
    }
  }
  return counts;
}
