"use server";

import { revalidatePath } from "next/cache";
import { LocationKind, PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requirePermission, hasPermissionForUser } from "@/lib/permissions";
import {
  addInventoryToSupplyOrderCore,
  type AddInventoryResult,
} from "@/app/events/supply-orders/core";
import {
  createStorageLocationCore,
  updateStorageLocationCore,
  setStorageLocationArchivedCore,
  deleteStorageLocationCore,
  type StorageLocationWriteArgs,
} from "./core";
import {
  createInventoryItemCore,
  updateInventoryItemCore,
  setInventoryItemArchivedCore,
  moveInventoryItemsCore,
  deleteInventoryItemsCore,
  type InventoryItemWriteArgs,
} from "./inventory-core";

const LOCATION_TYPE_CATEGORY = "location_type";

// getStorageLocations is auth-only (not STORAGE_LOCATIONS-gated) because order
// item forms across the app need to read the tree to render pickers — gating it
// would force every order-editing role to also carry STORAGE_LOCATIONS.VIEW.
// Same reasoning as getEquipment in src/app/equipment/actions.ts.
export async function getStorageLocations() {
  await requireAuth();
  return prisma.storageLocation.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

function parseLocationData(formData: FormData): StorageLocationWriteArgs {
  return {
    name: ((formData.get("name") as string) || "").trim(),
    kind:
      formData.get("kind") === "CONTAINER" ? LocationKind.CONTAINER : LocationKind.PLACE,
    type: (formData.get("type") as string) || null,
    parentId: (formData.get("parentId") as string) || null,
    notes: (formData.get("notes") as string) || null,
    archived: formData.get("archived") === "true",
  };
}

export async function createStorageLocation(formData: FormData) {
  const session = await requirePermission(PermissionResource.STORAGE_LOCATIONS, "WRITE");
  await createStorageLocationCore(parseLocationData(formData), session.user.id);
  revalidatePath("/storage-locations");
}

/**
 * Used by the inline "＋ New container" affordance on order item forms, which
 * needs the new id back rather than a redirect.
 */
export async function createContainerInline(
  name: string,
  parentId: string | null,
  type: string | null,
): Promise<string> {
  const session = await requirePermission(PermissionResource.STORAGE_LOCATIONS, "WRITE");
  const created = await createStorageLocationCore(
    {
      name,
      kind: LocationKind.CONTAINER,
      type: type || null,
      parentId,
      notes: null,
      archived: false,
    },
    session.user.id,
  );
  revalidatePath("/storage-locations");
  return created.id;
}

export async function updateStorageLocation(id: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.STORAGE_LOCATIONS, "WRITE");
  await updateStorageLocationCore(id, parseLocationData(formData), session.user.id);
  revalidatePath("/storage-locations");
}

export async function setStorageLocationArchived(id: string, archived: boolean) {
  const session = await requirePermission(PermissionResource.STORAGE_LOCATIONS, "WRITE");
  await setStorageLocationArchivedCore(id, archived, session.user.id);
  revalidatePath("/storage-locations");
}

export async function deleteStorageLocation(id: string) {
  const session = await requirePermission(PermissionResource.STORAGE_LOCATIONS, "DELETE");
  await deleteStorageLocationCore(id, session.user.id);
  revalidatePath("/storage-locations");
}

export async function reorderStorageLocations(orderedIds: string[]) {
  await requirePermission(PermissionResource.STORAGE_LOCATIONS, "WRITE");
  await Promise.all(
    orderedIds.map((id, index) =>
      prisma.storageLocation.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );
  revalidatePath("/storage-locations");
}

// ---------------------------------------------------------------------------
// Inventory items — what durably lives at a location.

function locationPath(locationId: string) {
  return `/storage-locations/locations/${locationId}`;
}

// Auth-only for the same reason as getStorageLocations above: the supply order
// side reads inventory to prefill lines, and gating it would force every
// order-editing role to also carry STORAGE_LOCATIONS.VIEW.
export async function getLocationContents(locationId: string) {
  await requireAuth();
  return prisma.inventoryItem.findMany({
    where: { locationId },
    include: { equipment: { select: { id: true, name: true, category: true } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

function parseInventoryData(formData: FormData): InventoryItemWriteArgs {
  const rawQuantity = formData.get("quantity") as string;
  // Nullable int: don't blanket-apply `|| null`, it would turn "0" into null.
  // A non-numeric entry reads as "no count" rather than sending NaN to Prisma,
  // which would surface as an opaque error instead of a countless item.
  const quantity = rawQuantity ? parseInt(rawQuantity) : null;

  return {
    name: ((formData.get("name") as string) || "").trim() || null,
    equipmentId: (formData.get("equipmentId") as string) || "",
    quantity: quantity !== null && Number.isNaN(quantity) ? null : quantity,
    notes: (formData.get("notes") as string) || null,
    archived: formData.get("archived") === "true",
  };
}

export async function createInventoryItem(locationId: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.STORAGE_LOCATIONS, "WRITE");
  await createInventoryItemCore(locationId, parseInventoryData(formData), session.user.id);
  revalidatePath("/storage-locations");
  revalidatePath(locationPath(locationId));
}

export async function updateInventoryItem(
  id: string,
  locationId: string,
  formData: FormData,
) {
  const session = await requirePermission(PermissionResource.STORAGE_LOCATIONS, "WRITE");
  await updateInventoryItemCore(id, parseInventoryData(formData), session.user.id);
  revalidatePath("/storage-locations");
  revalidatePath(locationPath(locationId));
}

export async function setInventoryItemArchived(
  id: string,
  locationId: string,
  archived: boolean,
) {
  const session = await requirePermission(PermissionResource.STORAGE_LOCATIONS, "WRITE");
  await setInventoryItemArchivedCore(id, archived, session.user.id);
  revalidatePath("/storage-locations");
  revalidatePath(locationPath(locationId));
}

export async function moveInventoryItems(ids: string[], targetLocationId: string) {
  const session = await requirePermission(PermissionResource.STORAGE_LOCATIONS, "WRITE");
  const { sourceLocationIds } = await moveInventoryItemsCore(
    ids,
    targetLocationId,
    session.user.id,
  );
  revalidatePath("/storage-locations");
  revalidatePath(locationPath(targetLocationId));
  for (const id of sourceLocationIds) revalidatePath(locationPath(id));
}

export async function deleteInventoryItems(ids: string[]) {
  const session = await requirePermission(PermissionResource.STORAGE_LOCATIONS, "DELETE");
  const { locationIds } = await deleteInventoryItemsCore(ids, session.user.id);
  revalidatePath("/storage-locations");
  for (const id of locationIds) revalidatePath(locationPath(id));
}

export type SupplyOrderTarget = {
  eventId: string;
  eventName: string;
  orders: { id: string; name: string }[];
};

/**
 * Events the caller can actually add supply items to, with their orders.
 *
 * This page is global but supply orders are event-scoped, and STORAGE_LOCATIONS
 * VIEW implies nothing about SUPPLY_ORDERS WRITE on any given event — so the
 * list is filtered per event rather than shown whole. loadPermissionsForUser is
 * cache()d, so the per-event checks cost one query regardless of event count.
 * An empty result hides the affordance entirely.
 */
export async function getSupplyOrderTargets(): Promise<SupplyOrderTarget[]> {
  const session = await requireAuth();

  const events = await prisma.event.findMany({
    select: {
      id: true,
      name: true,
      supplyOrders: { select: { id: true, name: true }, orderBy: { name: "asc" } },
    },
    orderBy: { startDate: "desc" },
  });

  const allowed = await Promise.all(
    events.map((event) =>
      hasPermissionForUser(session.user.id, "SUPPLY_ORDERS", "WRITE", event.id),
    ),
  );

  return events
    .filter((event, i) => allowed[i] && event.supplyOrders.length > 0)
    .map((event) => ({ eventId: event.id, eventName: event.name, orders: event.supplyOrders }));
}

export async function addInventoryToSupplyOrder(
  inventoryItemIds: string[],
  supplyOrderId: string,
  locationId: string,
): Promise<AddInventoryResult> {
  const session = await requireAuth();
  const result = await addInventoryToSupplyOrderCore(
    inventoryItemIds,
    supplyOrderId,
    session.user.id,
  );
  revalidatePath(locationPath(locationId));
  revalidatePath("/events");
  return result;
}

// Location types are CustomOption rows with category="location_type". Managed
// here rather than through the generic settings actions so this screen needs
// only STORAGE_LOCATIONS, not SETTINGS — same split as equipment categories.
export async function getLocationTypes() {
  await requireAuth();
  return prisma.customOption.findMany({
    where: { category: LOCATION_TYPE_CATEGORY },
    orderBy: { sortOrder: "asc" },
  });
}

export async function createLocationType(formData: FormData) {
  await requirePermission(PermissionResource.STORAGE_LOCATIONS, "WRITE");
  const label = formData.get("label") as string;
  const color = formData.get("color") as string;

  const maxOrder = await prisma.customOption.findFirst({
    where: { category: LOCATION_TYPE_CATEGORY },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.customOption.create({
    data: {
      category: LOCATION_TYPE_CATEGORY,
      label,
      color: color || null,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath("/storage-locations");
}

export async function updateLocationType(id: string, formData: FormData) {
  await requirePermission(PermissionResource.STORAGE_LOCATIONS, "WRITE");
  const label = formData.get("label") as string;
  const color = formData.get("color") as string;

  const existing = await prisma.customOption.findUnique({
    where: { id },
    select: { label: true, category: true },
  });
  if (!existing) throw new Error("Location type not found");
  if (existing.category !== LOCATION_TYPE_CATEGORY) throw new Error("Not a location type");

  const labelChanged = existing.label !== label;

  await prisma.$transaction(async (tx) => {
    await tx.customOption.update({ where: { id }, data: { label, color: color || null } });
    if (labelChanged) {
      // StorageLocation.type is stored by label, not FK — rewrite to keep rows in sync.
      await tx.storageLocation.updateMany({
        where: { type: existing.label },
        data: { type: label },
      });
    }
  });

  revalidatePath("/storage-locations");
}

export async function deleteLocationType(id: string) {
  await requirePermission(PermissionResource.STORAGE_LOCATIONS, "DELETE");
  const option = await prisma.customOption.findUnique({
    where: { id },
    select: { isSystem: true, category: true },
  });
  if (option?.isSystem) throw new Error("Cannot delete a system option.");
  if (option?.category !== LOCATION_TYPE_CATEGORY) throw new Error("Not a location type");

  await prisma.customOption.delete({ where: { id } });
  revalidatePath("/storage-locations");
}

export async function reorderLocationTypes(orderedIds: string[]) {
  await requirePermission(PermissionResource.STORAGE_LOCATIONS, "WRITE");
  await Promise.all(
    orderedIds.map((id, index) =>
      prisma.customOption.update({ where: { id }, data: { sortOrder: index } }),
    ),
  );
  revalidatePath("/storage-locations");
}
