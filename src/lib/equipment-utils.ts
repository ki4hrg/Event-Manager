import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PermissionError } from "@/lib/permissions";
import { UserFacingError } from "@/lib/userErrors";

// The catalog name for an equipment row on one of the event's orders. The
// catalog is per tenant: another tenant's id is a not-found. With no catalog
// pick the typed name is the row's name, so it can't be blank.
export async function resolveEquipmentName(
  equipmentId: string | null,
  fallback: string,
  eventId: string,
): Promise<string> {
  if (!equipmentId) {
    if (!fallback.trim()) throw new UserFacingError("Name the item or pick equipment");
    return fallback.trim();
  }
  const eq = await prisma.equipment.findFirst({
    where: { id: equipmentId, tenant: { events: { some: { id: eventId } } } },
    select: { name: true },
  });
  if (!eq) throw new PermissionError("NOT_FOUND", "Equipment not found");
  return eq.name;
}

// The catalog row a typed name stands for (a setup table or chair type): the
// event's tenant's equipment of that name, the preferred category first. Free
// text the catalog doesn't hold is null and stays text.
export async function catalogIdForName(name: string | null, preferCategory: string, eventId: string): Promise<string | null> {
  if (!name?.trim()) return null;
  const matches = await prisma.equipment.findMany({
    where: { name: name.trim(), tenant: { events: { some: { id: eventId } } } },
    select: { id: true, category: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  return (matches.find((m) => m.category === preferCategory) ?? matches[0])?.id ?? null;
}

// A catalog rename reaches the names stored beside its id: setup table and
// chair types, and order equipment rows still showing the old name (a row
// someone retitled keeps its own wording).
export async function carryEquipmentRename(tx: Prisma.TransactionClient, id: string, from: string, to: string) {
  if (from === to) return;
  await Promise.all([
    tx.setupTable.updateMany({ where: { tableEquipmentId: id }, data: { tableType: to } }),
    tx.setupTable.updateMany({ where: { chairEquipmentId: id }, data: { chairType: to } }),
    tx.equipmentItem.updateMany({ where: { equipmentId: id, item: from }, data: { item: to } }),
  ]);
}
