"use server";

import { revalidatePath } from "next/cache";
import { LocationKind, PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requirePermission, hasPermissionForUser } from "@/lib/permissions";
import { requireActiveTenantId } from "@/lib/tenant";
import { withUserErrors, type UserError } from "@/lib/userErrors";
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
import { formId, formInt, formName, formNote } from "@/lib/validation";

const LOCATION_TYPE_CATEGORY = "location_type";

// getStorageLocations is auth-only (not STORAGE_LOCATIONS-gated) because order
// item forms across the app need to read the tree to render pickers — gating it
// would force every order-editing role to also carry STORAGE_LOCATIONS.VIEW.
// Same reasoning as getEquipment in src/app/equipment/actions.ts.
export async function getStorageLocations() {
  await requireAuth();
  const tenantId = await requireActiveTenantId();
  return prisma.storageLocation.findMany({
    where: { tenantId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

function parseLocationData(formData: FormData): StorageLocationWriteArgs {
  return {
    name: formName(formData, "name"),
    kind:
      formData.get("kind") === "CONTAINER" ? LocationKind.CONTAINER : LocationKind.PLACE,
    type: formNote(formData, "type"),
    parentId: formId(formData, "parentId"),
    notes: formNote(formData, "notes"),
    archived: formData.get("archived") === "true",
  };
}

export async function createStorageLocation(formData: FormData) {
  const session = await requirePermission(PermissionResource.STORAGE_LOCATIONS, "WRITE");
  await createStorageLocationCore(parseLocationData(formData), session.user.id, session.tenantId);
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
): Promise<string | UserError> {
  const session = await requirePermission(PermissionResource.STORAGE_LOCATIONS, "WRITE");
  return withUserErrors(async () => {
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
      session.tenantId,
    );
    revalidatePath("/storage-locations");
    return created.id;
  });
}

export async function updateStorageLocation(id: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.STORAGE_LOCATIONS, "WRITE");
  await updateStorageLocationCore(id, parseLocationData(formData), session.user.id, session.tenantId);
  revalidatePath("/storage-locations");
}

export async function setStorageLocationArchived(id: string, archived: boolean) {
  const session = await requirePermission(PermissionResource.STORAGE_LOCATIONS, "WRITE");
  await setStorageLocationArchivedCore(id, archived, session.user.id, session.tenantId);
  revalidatePath("/storage-locations");
}

export async function deleteStorageLocation(id: string) {
  const session = await requirePermission(PermissionResource.STORAGE_LOCATIONS, "DELETE");
  await deleteStorageLocationCore(id, session.user.id, session.tenantId);
  revalidatePath("/storage-locations");
}

export async function reorderStorageLocations(orderedIds: string[]) {
  const { tenantId } = await requirePermission(PermissionResource.STORAGE_LOCATIONS, "WRITE");
  await Promise.all(
    orderedIds.map((id, index) =>
      prisma.storageLocation.update({ where: { id, tenantId }, data: { sortOrder: index } }),
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
  const tenantId = await requireActiveTenantId();
  return prisma.inventoryItem.findMany({
    where: { locationId, tenantId },
    include: { equipment: { select: { id: true, name: true, category: true } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

function parseInventoryData(formData: FormData): InventoryItemWriteArgs {
  // Blank is no count; anything else must be a whole number (refused with a
  // message through the actions' withUserErrors, never silently cleared).
  const quantity = formInt(formData, "quantity", { min: 0 });

  return {
    // Form field is `detail`, column is `name` — see the input in ItemFields for
    // why they differ.
    name: formNote(formData, "detail"),
    // The core refuses a missing one with its own message.
    equipmentId: formId(formData, "equipmentId") ?? "",
    quantity,
    notes: formNote(formData, "notes"),
    archived: formData.get("archived") === "true",
  };
}

export async function createInventoryItem(locationId: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.STORAGE_LOCATIONS, "WRITE");
  return withUserErrors(async () => {
    await createInventoryItemCore(locationId, parseInventoryData(formData), session.user.id, session.tenantId);
    revalidatePath("/storage-locations");
    revalidatePath(locationPath(locationId));
  });
}

export async function updateInventoryItem(
  id: string,
  locationId: string,
  formData: FormData,
) {
  const session = await requirePermission(PermissionResource.STORAGE_LOCATIONS, "WRITE");
  return withUserErrors(async () => {
    await updateInventoryItemCore(id, parseInventoryData(formData), session.user.id, session.tenantId);
    revalidatePath("/storage-locations");
    revalidatePath(locationPath(locationId));
  });
}

export async function setInventoryItemArchived(
  id: string,
  locationId: string,
  archived: boolean,
) {
  const session = await requirePermission(PermissionResource.STORAGE_LOCATIONS, "WRITE");
  await setInventoryItemArchivedCore(id, archived, session.user.id, session.tenantId);
  revalidatePath("/storage-locations");
  revalidatePath(locationPath(locationId));
}

export async function moveInventoryItems(ids: string[], targetLocationId: string) {
  const session = await requirePermission(PermissionResource.STORAGE_LOCATIONS, "WRITE");
  return withUserErrors(async () => {
    const { sourceLocationIds } = await moveInventoryItemsCore(
      ids,
      targetLocationId,
      session.user.id,
      session.tenantId,
    );
    revalidatePath("/storage-locations");
    revalidatePath(locationPath(targetLocationId));
    for (const id of sourceLocationIds) revalidatePath(locationPath(id));
  });
}

export async function deleteInventoryItems(ids: string[]) {
  const session = await requirePermission(PermissionResource.STORAGE_LOCATIONS, "DELETE");
  return withUserErrors(async () => {
    const { locationIds } = await deleteInventoryItemsCore(ids, session.user.id, session.tenantId);
    revalidatePath("/storage-locations");
    for (const id of locationIds) revalidatePath(locationPath(id));
  });
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
  const tenantId = await requireActiveTenantId();

  const events = await prisma.event.findMany({
    where: { tenantId },
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

// Location types are CustomOption rows with category="location_type", edited
// through the shared option actions (src/app/(admin)/settings/actions.ts), which gate
// them on STORAGE_LOCATIONS per the registry. Read here for the pickers.
export async function getLocationTypes() {
  await requireAuth();
  const tenantId = await requireActiveTenantId();
  return prisma.customOption.findMany({
    where: { tenantId, category: LOCATION_TYPE_CATEGORY },
    orderBy: { sortOrder: "asc" },
  });
}
