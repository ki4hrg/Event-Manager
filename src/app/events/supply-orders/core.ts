// Pure cores for supply-order + supply-item + link mutations.
// NOT a "use server" file — see src/app/contacts/core.ts for the security rationale.

import type { AcquisitionState, EntityStatus, PackingStatus } from "@prisma/client";
import { assertPackingSubstatus, packingItemsWrite, packingSubstatusFor } from "@/lib/packingSubstatus";
import { prisma } from "@/lib/prisma";
import { requirePermissionForUser, PermissionError, requireEventTenantId } from "@/lib/permissions";
import { resolveCreateStatus } from "@/lib/statusDefaults";
import { assertEventRefs } from "@/lib/eventRefs";
import { autoAssignDefaultWorkflowsCore, refreshWorkflowStatus } from "@/app/events/workflows/core";

async function assertSupplyOrderInEvent(supplyOrderId: string, eventId: string) {
  const found = await prisma.supplyOrder.findUnique({
    where: { id: supplyOrderId, eventId },
    select: { id: true },
  });
  if (!found) throw new PermissionError("NOT_FOUND");
}

// Runs after every write under the order, so it also keeps a status that
// follows an automatic workflow check current (refreshWorkflowStatus).
async function bumpSupplyOrder(supplyOrderId: string, eventId: string, userId: string) {
  await prisma.supplyOrder.updateMany({ where: { id: supplyOrderId, eventId }, data: { updatedById: userId } });
  await refreshWorkflowStatus("supply_order", [supplyOrderId], eventId);
}

// ---------------------------------------------------------------------------
// SupplyOrder

export type CreateSupplyOrderArgs = {
  name: string;
  roomId: string | null;
  specificLocation: string | null;
  notes: string | null;
  // Provider is a single-party concept: vendor OR contact, not both.
  // When both are null we look up the event's default SUPPLY_ORDER vendor.
  providerVendorId: string | null;
  providerContactId: string | null;
  // Optional initial M:M links.
  functionId: string | null;
  presentationId: string | null;
};

export async function createSupplyOrderCore(
  eventId: string,
  args: CreateSupplyOrderArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "SUPPLY_ORDERS", "WRITE", eventId);
  await assertEventRefs(eventId, { roomIds: [args.roomId], vendorIds: [args.providerVendorId], contactIds: [args.providerContactId], functionIds: [args.functionId], presentationIds: [args.presentationId] });

  let providerVendorId = args.providerVendorId;
  let providerContactId = args.providerContactId;
  if (!providerVendorId && !providerContactId) {
    const fallback = await prisma.eventVendor.findFirst({
      where: { eventId, defaultFor: { has: "SUPPLY_ORDER" } },
      select: { vendorId: true },
    });
    providerVendorId = fallback?.vendorId ?? null;
  }
  if (providerVendorId) providerContactId = null;

  const defaults = await resolveCreateStatus(eventId, "SUPPLY_ORDER");
  const supplyOrder = await prisma.supplyOrder.create({
    data: {
      name: args.name,
      eventId,
      roomId: args.roomId,
      specificLocation: args.specificLocation,
      notes: args.notes,
      providerVendorId,
      providerContactId,
      status: defaults.status,
      substatus: defaults.substatus,
      updatedById: userId,
    },
  });

  if (args.functionId) {
    await prisma.supplyOrderFunction.create({
      data: { supplyOrderId: supplyOrder.id, functionId: args.functionId },
    });
  }
  if (args.presentationId) {
    await prisma.supplyOrderPresentation.create({
      data: { supplyOrderId: supplyOrder.id, presentationId: args.presentationId },
    });
  }

  const applied = await autoAssignDefaultWorkflowsCore("supply_order", supplyOrder.id, supplyOrder.eventId);
  return { ...supplyOrder, ...applied };
}

export type UpdateSupplyOrderArgs = {
  name: string;
  roomId: string | null;
  specificLocation: string | null;
  notes: string | null;
  providerVendorId: string | null;
  providerContactId: string | null;
};

export async function updateSupplyOrderCore(
  id: string,
  eventId: string,
  args: UpdateSupplyOrderArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "SUPPLY_ORDERS", "WRITE", eventId);
  await assertEventRefs(eventId, { roomIds: [args.roomId], vendorIds: [args.providerVendorId], contactIds: [args.providerContactId] });
  let providerVendorId = args.providerVendorId;
  let providerContactId = args.providerContactId;
  if (providerVendorId) providerContactId = null;
  if (providerContactId) providerVendorId = null;

  const order = await prisma.supplyOrder.update({
    where: { id, eventId },
    data: {
      name: args.name,
      roomId: args.roomId,
      specificLocation: args.specificLocation,
      notes: args.notes,
      providerVendorId,
      providerContactId,
      updatedById: userId,
    },
  });
  await refreshWorkflowStatus("supply_order", [id], eventId);
  return order;
}

export async function deleteSupplyOrderCore(id: string, eventId: string, userId: string) {
  await requirePermissionForUser(userId, "SUPPLY_ORDERS", "DELETE", eventId);
  await prisma.supplyOrder.delete({ where: { id, eventId } });
}

export async function deleteSupplyOrdersCore(ids: string[], eventId: string, userId: string) {
  await requirePermissionForUser(userId, "SUPPLY_ORDERS", "DELETE", eventId);
  const r = await prisma.supplyOrder.deleteMany({ where: { id: { in: ids }, eventId } });
  return { count: r.count };
}

export async function bulkSetSupplyOrderItemsPackingStatusCore(
  supplyOrderId: string,
  eventId: string,
  packingStatus: PackingStatus,
  userId: string,
  packingSubstatus?: string | null,
) {
  await requirePermissionForUser(userId, "SUPPLY_ORDERS", "WRITE", eventId);
  await assertSupplyOrderInEvent(supplyOrderId, eventId);
  await assertPackingSubstatus(eventId, packingStatus, packingSubstatus);
  const write = packingItemsWrite(packingStatus, packingSubstatus);
  await prisma.$transaction(async (tx) => {
    await tx.supplyOrderItem.updateMany({
      where: { supplyOrderId, ...write.where },
      data: write.data,
    });
    await tx.supplyOrder.update({
      where: { id: supplyOrderId },
      data: { updatedById: userId },
    });
  });
}

export async function bulkSetSupplyOrderItemsAcquisitionStateCore(
  supplyOrderId: string,
  eventId: string,
  acquisitionState: AcquisitionState,
  userId: string,
) {
  await requirePermissionForUser(userId, "SUPPLY_ORDERS", "WRITE", eventId);
  await assertSupplyOrderInEvent(supplyOrderId, eventId);
  await prisma.$transaction(async (tx) => {
    await tx.supplyOrderItem.updateMany({
      where: { supplyOrderId },
      data: { acquisitionState },
    });
    await tx.supplyOrder.update({
      where: { id: supplyOrderId },
      data: { updatedById: userId },
    });
  });
}

export type BulkSupplyOrderUpdates = {
  status?: EntityStatus;
  substatus?: string | null;
  functionId?: string;
  presentationId?: string;
};

export async function bulkUpdateSupplyOrdersCore(
  ids: string[],
  eventId: string,
  updates: BulkSupplyOrderUpdates,
  userId: string,
) {
  await requirePermissionForUser(userId, "SUPPLY_ORDERS", "WRITE", eventId);
  await assertEventRefs(eventId, { functionIds: [updates.functionId], presentationIds: [updates.presentationId] });
  // Junction rows below are created per id: keep only this event's orders.
  ids = (await prisma.supplyOrder.findMany({ where: { id: { in: ids }, eventId }, select: { id: true } })).map((o) => o.id);
  const { status, substatus, functionId, presentationId } = updates;

  if (status !== undefined || substatus !== undefined) {
    await prisma.supplyOrder.updateMany({
      where: { id: { in: ids }, eventId },
      data: {
        ...(status !== undefined ? { status } : {}),
        ...(substatus !== undefined ? { substatus } : {}),
        updatedById: userId,
      },
    });
  }

  if (functionId) {
    const existing = await prisma.supplyOrderFunction.findMany({
      where: { supplyOrderId: { in: ids }, functionId },
      select: { supplyOrderId: true },
    });
    const existingIds = new Set(existing.map((e) => e.supplyOrderId));
    const toCreate = ids.filter((id) => !existingIds.has(id));
    if (toCreate.length > 0) {
      await prisma.supplyOrderFunction.createMany({
        data: toCreate.map((id) => ({ supplyOrderId: id, functionId })),
      });
      await prisma.supplyOrder.updateMany({
        where: { id: { in: ids }, eventId },
        data: { updatedById: userId },
      });
    }
  }

  if (presentationId) {
    const existing = await prisma.supplyOrderPresentation.findMany({
      where: { supplyOrderId: { in: ids }, presentationId },
      select: { supplyOrderId: true },
    });
    const existingIds = new Set(existing.map((e) => e.supplyOrderId));
    const toCreate = ids.filter((id) => !existingIds.has(id));
    if (toCreate.length > 0) {
      await prisma.supplyOrderPresentation.createMany({
        data: toCreate.map((id) => ({ supplyOrderId: id, presentationId })),
      });
      await prisma.supplyOrder.updateMany({
        where: { id: { in: ids }, eventId },
        data: { updatedById: userId },
      });
    }
  }
  // Only a vendor or link change can move a checked step; a status-only edit stands.
  if (functionId) await refreshWorkflowStatus("supply_order", ids, eventId);
}

// ---------------------------------------------------------------------------
// Links

export async function linkSupplyOrderToFunctionCore(
  supplyOrderId: string,
  functionId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "SUPPLY_ORDERS", "WRITE", eventId);
  await assertSupplyOrderInEvent(supplyOrderId, eventId);
  await assertEventRefs(eventId, { functionIds: [functionId] });
  const link = await prisma.supplyOrderFunction.create({ data: { supplyOrderId, functionId } });
  await bumpSupplyOrder(supplyOrderId, eventId, userId);
  return link;
}

export async function unlinkSupplyOrderFromFunctionCore(
  supplyOrderId: string,
  functionId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "SUPPLY_ORDERS", "WRITE", eventId);
  const r = await prisma.supplyOrderFunction.deleteMany({
    where: { supplyOrderId, functionId, supplyOrder: { eventId } },
  });
  await bumpSupplyOrder(supplyOrderId, eventId, userId);
  return { count: r.count };
}

export async function linkSupplyOrderToPresentationCore(
  supplyOrderId: string,
  presentationId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "SUPPLY_ORDERS", "WRITE", eventId);
  await assertSupplyOrderInEvent(supplyOrderId, eventId);
  await assertEventRefs(eventId, { presentationIds: [presentationId] });
  const link = await prisma.supplyOrderPresentation.create({
    data: { supplyOrderId, presentationId },
  });
  await bumpSupplyOrder(supplyOrderId, eventId, userId);
  return link;
}

export async function unlinkSupplyOrderFromPresentationCore(
  supplyOrderId: string,
  presentationId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "SUPPLY_ORDERS", "WRITE", eventId);
  const r = await prisma.supplyOrderPresentation.deleteMany({
    where: { supplyOrderId, presentationId, supplyOrder: { eventId } },
  });
  await bumpSupplyOrder(supplyOrderId, eventId, userId);
  return { count: r.count };
}

// ---------------------------------------------------------------------------
// SupplyOrderItem

export type SupplyItemWriteArgs = {
  description: string | null;
  equipmentId: string | null;
  quantity: number | null;
  acquisitionState: AcquisitionState;
  providerVendorId: string | null;
  providerContactId: string | null;
  packingStatus: PackingStatus;
  // Omitted on an update: kept while the status stays put.
  packingSubstatus?: string | null;
  notes: string | null;
  // Where this item comes from. On a container line this means something else:
  // where that container sits for this event, overriding its durable home.
  sourceLocationId: string | null;
  // Set when this line *is* a container being shipped rather than an item
  // inside one.
  containerLocationId: string | null;
  // Provenance: which durable inventory row this line was pulled from. Written
  // by the location-side "Add to supply order" bridge and by a post-event
  // repack. Never decrements the inventory row — see the InventoryItem comment
  // in schema.prisma.
  inventoryItemId: string | null;
};

function normalizeItemArgs(args: SupplyItemWriteArgs): SupplyItemWriteArgs {
  // A container line is identified by its container, so it needs neither a
  // description nor an equipment selection.
  if (!args.containerLocationId && !args.description && !args.equipmentId) {
    throw new Error("Supply item needs a description or an equipment selection.");
  }
  // Provider is a single-party concept.
  let providerVendorId = args.providerVendorId;
  let providerContactId = args.providerContactId;
  if (providerVendorId) providerContactId = null;
  if (providerContactId) providerVendorId = null;
  // A container can't be its own placement.
  const sourceLocationId =
    args.containerLocationId && args.sourceLocationId === args.containerLocationId
      ? null
      : args.sourceLocationId;
  return { ...args, providerVendorId, providerContactId, sourceLocationId };
}

const supplyItemRefs = (args: SupplyItemWriteArgs) => ({
  equipmentIds: [args.equipmentId],
  vendorIds: [args.providerVendorId],
  contactIds: [args.providerContactId],
  storageLocationIds: [args.sourceLocationId, args.containerLocationId],
  inventoryItemIds: [args.inventoryItemId],
});

/**
 * Container lines claim a container for one event. The claim can't be a schema
 * unique constraint: nodes are durable and reused across events, so uniqueness
 * is per (container, event) and the event lives on the parent order.
 */
async function assertContainerUsable(
  containerLocationId: string,
  eventId: string,
  exceptItemId?: string,
) {
  const location = await prisma.storageLocation.findFirst({
    where: { id: containerLocationId, tenant: { events: { some: { id: eventId } } } },
    select: { name: true, kind: true },
  });
  if (!location) throw new Error("Container not found.");
  if (location.kind !== "CONTAINER") {
    throw new Error(`"${location.name}" is a place, not a container.`);
  }

  const claimed = await prisma.supplyOrderItem.findFirst({
    where: {
      containerLocationId,
      supplyOrder: { eventId },
      ...(exceptItemId ? { id: { not: exceptItemId } } : {}),
    },
    select: { supplyOrder: { select: { name: true } } },
  });
  if (claimed) {
    throw new Error(
      `"${location.name}" is already on the "${claimed.supplyOrder.name}" order for this event.`,
    );
  }
}

export async function createSupplyOrderItemCore(
  supplyOrderId: string,
  eventId: string,
  rawArgs: SupplyItemWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "SUPPLY_ORDERS", "WRITE", eventId);
  await assertSupplyOrderInEvent(supplyOrderId, eventId);
  const args = normalizeItemArgs(rawArgs);
  await assertEventRefs(eventId, supplyItemRefs(args));
  if (args.containerLocationId) {
    await assertContainerUsable(args.containerLocationId, eventId);
  }
  const packingSubstatus = await packingSubstatusFor(eventId, args.packingStatus, args.packingSubstatus, null);
  const { _max } = await prisma.supplyOrderItem.aggregate({
    where: { supplyOrderId },
    _max: { sortOrder: true },
  });
  const item = await prisma.supplyOrderItem.create({
    data: { supplyOrderId, ...args, packingSubstatus, sortOrder: (_max.sortOrder ?? -1) + 1 },
  });
  await bumpSupplyOrder(supplyOrderId, eventId, userId);
  return item;
}

export type AddInventoryResult = {
  orderName: string;
  added: number;
  /** Ids that no longer resolve to an inventory item. */
  skipped: number;
};

/**
 * Pull durable inventory onto a supply order — the movement-to-event half of the
 * inventory loop, and the reverse of the packing list's "Return to…".
 *
 * Provenance only: the inventory row is untouched, and nothing is decremented.
 * The same item can be pulled onto two events at once, which is truthful — the
 * catalogue records where a thing lives, not whether it is currently spoken for.
 *
 * Resolving eventId from the order rather than accepting it is the ownership
 * check: a caller can't name an order they can reach and an event they can't.
 */
export async function addInventoryToSupplyOrderCore(
  inventoryItemIds: string[],
  supplyOrderId: string,
  userId: string,
): Promise<AddInventoryResult> {
  const order = await prisma.supplyOrder.findUnique({
    where: { id: supplyOrderId },
    select: { id: true, name: true, eventId: true },
  });
  if (!order) throw new PermissionError("NOT_FOUND");

  await requirePermissionForUser(userId, "SUPPLY_ORDERS", "WRITE", order.eventId);
  const tenantId = await requireEventTenantId(order.eventId);
  await requirePermissionForUser(userId, "STORAGE_LOCATIONS", "VIEW", { tenantId });

  const items = await prisma.inventoryItem.findMany({
    where: { id: { in: inventoryItemIds }, tenantId },
    select: {
      id: true,
      name: true,
      quantity: true,
      equipmentId: true,
      locationId: true,
      equipment: { select: { name: true } },
    },
  });
  const skipped = inventoryItemIds.length - items.length;

  const { _max } = await prisma.supplyOrderItem.aggregate({
    where: { supplyOrderId },
    _max: { sortOrder: true },
  });
  let sortOrder = (_max.sortOrder ?? -1) + 1;

  await prisma.$transaction([
    prisma.supplyOrderItem.createMany({
      data: items.map((item) => ({
        supplyOrderId,
        // Equipment carries the identity; the qualifier only earns a place in
        // the description when there is one.
        description: item.name ? `${item.equipment.name} — ${item.name}` : item.equipment.name,
        equipmentId: item.equipmentId,
        quantity: item.quantity,
        // It is in a box on a shelf, so it is on hand by definition, and it
        // still has to be loaded.
        acquisitionState: "ON_HAND" as const,
        packingStatus: "NEEDED" as const,
        sourceLocationId: item.locationId,
        inventoryItemId: item.id,
        sortOrder: sortOrder++,
      })),
    }),
    prisma.supplyOrder.update({
      where: { id: supplyOrderId },
      data: { updatedById: userId },
    }),
  ]);
  await refreshWorkflowStatus("supply_order", [supplyOrderId], order.eventId);

  return { orderName: order.name, added: items.length, skipped };
}

export async function updateSupplyOrderItemCore(
  id: string,
  supplyOrderId: string,
  eventId: string,
  rawArgs: SupplyItemWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "SUPPLY_ORDERS", "WRITE", eventId);
  const args = normalizeItemArgs(rawArgs);
  await assertEventRefs(eventId, supplyItemRefs(args));
  if (args.containerLocationId) {
    await assertContainerUsable(args.containerLocationId, eventId, id);
  }
  const stored = await prisma.supplyOrderItem.findFirst({
    where: { id, supplyOrder: { eventId } },
    select: { packingStatus: true, packingSubstatus: true },
  });
  if (!stored) throw new PermissionError("NOT_FOUND");
  const packingSubstatus = await packingSubstatusFor(eventId, args.packingStatus, args.packingSubstatus, stored);
  const item = await prisma.supplyOrderItem.update({
    where: { id, supplyOrder: { eventId } },
    data: { ...args, packingSubstatus },
  });
  await bumpSupplyOrder(supplyOrderId, eventId, userId);
  return item;
}

export async function deleteSupplyOrderItemCore(
  id: string,
  supplyOrderId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "SUPPLY_ORDERS", "WRITE", eventId);
  await prisma.supplyOrderItem.delete({ where: { id, supplyOrder: { eventId } } });
  await bumpSupplyOrder(supplyOrderId, eventId, userId);
}

export async function updateSupplyOrderItemPackingStatusCore(
  id: string,
  supplyOrderId: string,
  eventId: string,
  packingStatus: PackingStatus,
  userId: string,
  packingSubstatus?: string | null,
) {
  await requirePermissionForUser(userId, "SUPPLY_ORDERS", "WRITE", eventId);
  const stored = await prisma.supplyOrderItem.findFirst({
    where: { id, supplyOrder: { eventId } },
    select: { packingStatus: true, packingSubstatus: true },
  });
  if (!stored) throw new PermissionError("NOT_FOUND");
  await prisma.supplyOrderItem.update({
    where: { id, supplyOrder: { eventId } },
    data: { packingStatus, packingSubstatus: await packingSubstatusFor(eventId, packingStatus, packingSubstatus, stored) },
  });
  await bumpSupplyOrder(supplyOrderId, eventId, userId);
}

export async function updateSupplyOrderItemAcquisitionStateCore(
  id: string,
  supplyOrderId: string,
  eventId: string,
  acquisitionState: AcquisitionState,
  userId: string,
) {
  await requirePermissionForUser(userId, "SUPPLY_ORDERS", "WRITE", eventId);
  await prisma.supplyOrderItem.update({
    where: { id, supplyOrder: { eventId } },
    data: { acquisitionState },
  });
  await bumpSupplyOrder(supplyOrderId, eventId, userId);
}
