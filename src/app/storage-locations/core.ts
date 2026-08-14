import { LocationKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermissionForUser } from "@/lib/permissions";
import { assertNoCycle, buildLocationIndex } from "@/lib/storageLocations";

export type StorageLocationWriteArgs = {
  name: string;
  kind: LocationKind;
  type: string | null;
  parentId: string | null;
  notes: string | null;
  archived: boolean;
};

async function loadIndex() {
  const rows = await prisma.storageLocation.findMany({
    select: {
      id: true,
      name: true,
      kind: true,
      type: true,
      parentId: true,
      sortOrder: true,
      archived: true,
    },
  });
  return buildLocationIndex(rows);
}

/**
 * @@unique([parentId, name]) can't cover roots — Postgres treats NULLs as
 * distinct, so two top-level locations could share a name without the
 * constraint firing. Enforced here instead.
 */
async function assertNameFree(name: string, parentId: string | null, exceptId?: string) {
  const clash = await prisma.storageLocation.findFirst({
    where: { name, parentId, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) {
    throw new Error(
      parentId
        ? `A location named "${name}" already exists here.`
        : `A top-level location named "${name}" already exists.`,
    );
  }
}

export async function createStorageLocationCore(
  args: StorageLocationWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "STORAGE_LOCATIONS", "WRITE");

  const name = args.name.trim();
  if (!name) throw new Error("A location needs a name.");
  await assertNameFree(name, args.parentId);

  const { _max } = await prisma.storageLocation.aggregate({
    where: { parentId: args.parentId },
    _max: { sortOrder: true },
  });

  return prisma.storageLocation.create({
    data: {
      name,
      kind: args.kind,
      type: args.type,
      parentId: args.parentId,
      notes: args.notes,
      archived: args.archived,
      sortOrder: (_max.sortOrder ?? -1) + 1,
    },
  });
}

export async function updateStorageLocationCore(
  id: string,
  args: StorageLocationWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "STORAGE_LOCATIONS", "WRITE");

  const name = args.name.trim();
  if (!name) throw new Error("A location needs a name.");

  const index = await loadIndex();
  if (!index.byId.has(id)) throw new Error("Location not found.");
  assertNoCycle(index, id, args.parentId);
  await assertNameFree(name, args.parentId, id);

  return prisma.storageLocation.update({
    where: { id },
    data: {
      name,
      kind: args.kind,
      type: args.type,
      parentId: args.parentId,
      notes: args.notes,
      archived: args.archived,
    },
  });
}

/** Reparent only — the common field edit during load-out. */
export async function moveStorageLocationCore(
  id: string,
  parentId: string | null,
  userId: string,
) {
  await requirePermissionForUser(userId, "STORAGE_LOCATIONS", "WRITE");

  const index = await loadIndex();
  const node = index.byId.get(id);
  if (!node) throw new Error("Location not found.");
  assertNoCycle(index, id, parentId);
  await assertNameFree(node.name, parentId, id);

  return prisma.storageLocation.update({ where: { id }, data: { parentId } });
}

export async function setStorageLocationArchivedCore(
  id: string,
  archived: boolean,
  userId: string,
) {
  await requirePermissionForUser(userId, "STORAGE_LOCATIONS", "WRITE");
  return prisma.storageLocation.update({ where: { id }, data: { archived } });
}

export async function deleteStorageLocationCore(id: string, userId: string) {
  await requirePermissionForUser(userId, "STORAGE_LOCATIONS", "DELETE");

  // InventoryItem.location is Restrict, so this would fail at the database
  // anyway — the pre-check exists to turn a foreign key error into a sentence
  // that says which location and how many items.
  const location = await prisma.storageLocation.findUnique({
    where: { id },
    select: { name: true, _count: { select: { inventoryItems: true } } },
  });
  if (!location) throw new Error("Location not found.");
  const held = location._count.inventoryItems;
  if (held > 0) {
    throw new Error(
      `"${location.name}" still holds ${held} item${held === 1 ? "" : "s"}. Move or delete them first.`,
    );
  }

  // Children are promoted to roots by onDelete: SetNull, matching how deleting
  // a RoomGroup leaves its rooms ungrouped rather than destroying them.
  await prisma.storageLocation.delete({ where: { id } });
}
