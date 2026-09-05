// Pure cores for inventory item mutations.
// NOT a "use server" file — see src/app/contacts/core.ts for the security rationale.

import { prisma } from "@/lib/prisma";
import { requirePermissionForUser } from "@/lib/permissions";

export type InventoryItemWriteArgs = {
  /** Optional qualifier only — "blue", "spare". The Equipment link is identity. */
  name: string | null;
  equipmentId: string;
  quantity: number | null;
  notes: string | null;
  archived: boolean;
};

function normalizeInventoryArgs(args: InventoryItemWriteArgs): InventoryItemWriteArgs {
  if (!args.equipmentId) {
    throw new Error("An inventory item needs an equipment selection.");
  }
  return { ...args, name: args.name?.trim() || null };
}

/** Pre-checked so a bad id reads as a sentence rather than a foreign key error. */
async function assertEquipmentExists(equipmentId: string, tenantId: string) {
  const equipment = await prisma.equipment.findFirst({
    where: { id: equipmentId, tenantId },
    select: { id: true },
  });
  if (!equipment) throw new Error("That equipment no longer exists — refresh and try again.");
}

async function assertLocationUsable(locationId: string, tenantId: string) {
  const location = await prisma.storageLocation.findFirst({
    where: { id: locationId, tenantId },
    select: { name: true, archived: true },
  });
  if (!location) throw new Error("Location not found.");
  if (location.archived) {
    throw new Error(`"${location.name}" is archived — restore it before filing items there.`);
  }
  return location;
}

/**
 * The permission check only says the caller may write inventory; it says nothing
 * about these particular ids existing. Resolving them up front turns a silent
 * partial write into an error the caller can act on.
 */
async function assertItemsExist(ids: string[], tenantId: string) {
  if (ids.length === 0) throw new Error("No items selected.");
  const found = await prisma.inventoryItem.findMany({
    where: { id: { in: ids }, tenantId },
    select: { id: true },
  });
  if (found.length !== ids.length) {
    throw new Error("Some of those items no longer exist — refresh and try again.");
  }
}

export async function createInventoryItemCore(
  locationId: string,
  rawArgs: InventoryItemWriteArgs,
  userId: string,
  tenantId: string,
) {
  await requirePermissionForUser(userId, "STORAGE_LOCATIONS", "WRITE", { tenantId });

  const args = normalizeInventoryArgs(rawArgs);
  await Promise.all([
    assertLocationUsable(locationId, tenantId),
    assertEquipmentExists(args.equipmentId, tenantId),
  ]);

  const { _max } = await prisma.inventoryItem.aggregate({
    where: { locationId },
    _max: { sortOrder: true },
  });

  return prisma.inventoryItem.create({
    data: {
      tenantId,
      locationId,
      name: args.name,
      equipmentId: args.equipmentId,
      quantity: args.quantity,
      notes: args.notes,
      archived: args.archived,
      sortOrder: (_max.sortOrder ?? -1) + 1,
    },
  });
}

export async function updateInventoryItemCore(
  id: string,
  rawArgs: InventoryItemWriteArgs,
  userId: string,
  tenantId: string,
) {
  await requirePermissionForUser(userId, "STORAGE_LOCATIONS", "WRITE", { tenantId });

  const args = normalizeInventoryArgs(rawArgs);
  const [existing] = await Promise.all([
    prisma.inventoryItem.findFirst({ where: { id, tenantId }, select: { id: true } }),
    assertEquipmentExists(args.equipmentId, tenantId),
  ]);
  if (!existing) throw new Error("Inventory item not found.");

  return prisma.inventoryItem.update({
    where: { id, tenantId },
    data: {
      name: args.name,
      equipmentId: args.equipmentId,
      quantity: args.quantity,
      notes: args.notes,
      archived: args.archived,
    },
  });
}

export async function setInventoryItemArchivedCore(
  id: string,
  archived: boolean,
  userId: string,
  tenantId: string,
) {
  await requirePermissionForUser(userId, "STORAGE_LOCATIONS", "WRITE", { tenantId });

  const existing = await prisma.inventoryItem.findFirst({
    where: { id, tenantId },
    select: { id: true },
  });
  if (!existing) throw new Error("Inventory item not found.");

  return prisma.inventoryItem.update({ where: { id, tenantId }, data: { archived } });
}

/**
 * An item has exactly one home, so moving it is the whole story — there is no
 * per-event placement to reconcile. Returns the affected location ids so the
 * caller can revalidate both ends of the move.
 */
export async function moveInventoryItemsCore(
  ids: string[],
  targetLocationId: string,
  userId: string,
  tenantId: string,
) {
  await requirePermissionForUser(userId, "STORAGE_LOCATIONS", "WRITE", { tenantId });

  await assertItemsExist(ids, tenantId);
  await assertLocationUsable(targetLocationId, tenantId);

  const items = await prisma.inventoryItem.findMany({
    where: { id: { in: ids }, tenantId },
    select: { locationId: true },
  });
  const sourceLocationIds = Array.from(new Set(items.map((i) => i.locationId)));

  const { count } = await prisma.inventoryItem.updateMany({
    where: { id: { in: ids }, tenantId },
    data: { locationId: targetLocationId },
  });

  return { count, sourceLocationIds };
}

export async function deleteInventoryItemsCore(ids: string[], userId: string, tenantId: string) {
  await requirePermissionForUser(userId, "STORAGE_LOCATIONS", "DELETE", { tenantId });

  await assertItemsExist(ids, tenantId);

  const items = await prisma.inventoryItem.findMany({
    where: { id: { in: ids }, tenantId },
    select: { locationId: true },
  });
  const locationIds = Array.from(new Set(items.map((i) => i.locationId)));

  const { count } = await prisma.inventoryItem.deleteMany({
    where: { id: { in: ids }, tenantId },
  });
  return { count, locationIds };
}
