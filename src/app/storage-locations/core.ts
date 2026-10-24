import { LocationKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermissionForUser } from "@/lib/permissions";
import { assertNoCycle, buildLocationIndex } from "@/lib/storageLocations";
import { UserFacingError } from "@/lib/userErrors";

export type StorageLocationWriteArgs = {
  name: string;
  kind: LocationKind;
  type: string | null;
  parentId: string | null;
  notes: string | null;
  archived: boolean;
};

async function loadIndex(tenantId: string) {
  const rows = await prisma.storageLocation.findMany({
    where: { tenantId },
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

// A parent must be one of the tenant's own locations; the tenant-scoped index
// is the lookup, so a foreign id simply isn't there.
function assertParentInIndex(index: ReturnType<typeof buildLocationIndex>, parentId: string | null) {
  if (parentId && !index.byId.has(parentId)) throw new Error("Parent location not found.");
}

/**
 * @@unique([parentId, name]) can't cover roots — Postgres treats NULLs as
 * distinct, so two top-level locations could share a name without the
 * constraint firing. Enforced here instead.
 */
async function assertNameFree(
  tenantId: string,
  name: string,
  parentId: string | null,
  exceptId?: string,
) {
  const clash = await prisma.storageLocation.findFirst({
    where: { tenantId, name, parentId, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) {
    throw new UserFacingError(
      parentId
        ? `A location named "${name}" already exists here.`
        : `A top-level location named "${name}" already exists.`,
    );
  }
}

export async function createStorageLocationCore(
  args: StorageLocationWriteArgs,
  userId: string,
  tenantId: string,
) {
  await requirePermissionForUser(userId, "STORAGE_LOCATIONS", "WRITE", { tenantId });

  const name = args.name.trim();
  if (!name) throw new UserFacingError("A location needs a name.");
  if (args.parentId) assertParentInIndex(await loadIndex(tenantId), args.parentId);
  await assertNameFree(tenantId, name, args.parentId);

  const { _max } = await prisma.storageLocation.aggregate({
    where: { tenantId, parentId: args.parentId },
    _max: { sortOrder: true },
  });

  return prisma.storageLocation.create({
    data: {
      tenantId,
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
  tenantId: string,
) {
  await requirePermissionForUser(userId, "STORAGE_LOCATIONS", "WRITE", { tenantId });

  const name = args.name.trim();
  if (!name) throw new UserFacingError("A location needs a name.");

  const index = await loadIndex(tenantId);
  if (!index.byId.has(id)) throw new Error("Location not found.");
  assertParentInIndex(index, args.parentId);
  assertNoCycle(index, id, args.parentId);
  await assertNameFree(tenantId, name, args.parentId, id);

  return prisma.storageLocation.update({
    where: { id, tenantId },
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
  tenantId: string,
) {
  await requirePermissionForUser(userId, "STORAGE_LOCATIONS", "WRITE", { tenantId });

  const index = await loadIndex(tenantId);
  const node = index.byId.get(id);
  if (!node) throw new Error("Location not found.");
  assertParentInIndex(index, parentId);
  assertNoCycle(index, id, parentId);
  await assertNameFree(tenantId, node.name, parentId, id);

  return prisma.storageLocation.update({ where: { id, tenantId }, data: { parentId } });
}

export async function setStorageLocationArchivedCore(
  id: string,
  archived: boolean,
  userId: string,
  tenantId: string,
) {
  await requirePermissionForUser(userId, "STORAGE_LOCATIONS", "WRITE", { tenantId });
  return prisma.storageLocation.update({ where: { id, tenantId }, data: { archived } });
}

export async function deleteStorageLocationCore(id: string, userId: string, tenantId: string) {
  await requirePermissionForUser(userId, "STORAGE_LOCATIONS", "DELETE", { tenantId });

  // InventoryItem.location is Restrict, so this would fail at the database
  // anyway — the pre-check exists to turn a foreign key error into a sentence
  // that says which location and how many items.
  const location = await prisma.storageLocation.findFirst({
    where: { id, tenantId },
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
  await prisma.storageLocation.delete({ where: { id, tenantId } });
}
