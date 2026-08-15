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
async function assertEquipmentExists(equipmentId: string) {
  const equipment = await prisma.equipment.findUnique({
    where: { id: equipmentId },
    select: { id: true },
  });
  if (!equipment) throw new Error("That equipment no longer exists — refresh and try again.");
}

async function assertLocationUsable(locationId: string) {
  const location = await prisma.storageLocation.findUnique({
    where: { id: locationId },
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
async function assertItemsExist(ids: string[]) {
  if (ids.length === 0) throw new Error("No items selected.");
  const found = await prisma.inventoryItem.findMany({
    where: { id: { in: ids } },
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
) {
  await requirePermissionForUser(userId, "STORAGE_LOCATIONS", "WRITE");

  const args = normalizeInventoryArgs(rawArgs);
  await Promise.all([assertLocationUsable(locationId), assertEquipmentExists(args.equipmentId)]);

  const { _max } = await prisma.inventoryItem.aggregate({
    where: { locationId },
    _max: { sortOrder: true },
  });

  return prisma.inventoryItem.create({
    data: {
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
) {
  await requirePermissionForUser(userId, "STORAGE_LOCATIONS", "WRITE");

  const args = normalizeInventoryArgs(rawArgs);
  const [existing] = await Promise.all([
    prisma.inventoryItem.findUnique({ where: { id }, select: { id: true } }),
    assertEquipmentExists(args.equipmentId),
  ]);
  if (!existing) throw new Error("Inventory item not found.");

  return prisma.inventoryItem.update({
    where: { id },
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
) {
  await requirePermissionForUser(userId, "STORAGE_LOCATIONS", "WRITE");

  const existing = await prisma.inventoryItem.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw new Error("Inventory item not found.");

  return prisma.inventoryItem.update({ where: { id }, data: { archived } });
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
) {
  await requirePermissionForUser(userId, "STORAGE_LOCATIONS", "WRITE");

  await assertItemsExist(ids);
  await assertLocationUsable(targetLocationId);

  const items = await prisma.inventoryItem.findMany({
    where: { id: { in: ids } },
    select: { locationId: true },
  });
  const sourceLocationIds = Array.from(new Set(items.map((i) => i.locationId)));

  const { count } = await prisma.inventoryItem.updateMany({
    where: { id: { in: ids } },
    data: { locationId: targetLocationId },
  });

  return { count, sourceLocationIds };
}

export async function deleteInventoryItemsCore(ids: string[], userId: string) {
  await requirePermissionForUser(userId, "STORAGE_LOCATIONS", "DELETE");

  await assertItemsExist(ids);

  const items = await prisma.inventoryItem.findMany({
    where: { id: { in: ids } },
    select: { locationId: true },
  });
  const locationIds = Array.from(new Set(items.map((i) => i.locationId)));

  const { count } = await prisma.inventoryItem.deleteMany({ where: { id: { in: ids } } });
  return { count, locationIds };
}
