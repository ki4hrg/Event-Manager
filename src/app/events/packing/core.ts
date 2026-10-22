import type { PackingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  hasPermissionForUser,
  requireEventTenantId,
  requirePermissionForUser,
} from "@/lib/permissions";
import {
  buildLocationIndex,
  resolvePlacements,
  subtreeIds,
} from "@/lib/storageLocations";

export type ContainerCascadePreview = {
  containerName: string;
  supplyCount: number;
  printCount: number;
  /** Items in the subtree the caller may not write. */
  blockedSupplyCount: number;
  blockedPrintCount: number;
};

/**
 * Ids at or below a container on the effective graph for one event. The durable
 * tree supplies the default nesting; each container line's sourceLocationId
 * overrides it for this event.
 */
async function containerSubtree(containerLocationId: string, eventId: string) {
  const [rows, containerLines] = await Promise.all([
    prisma.storageLocation.findMany({
      where: { tenant: { events: { some: { id: eventId } } } },
      select: {
        id: true,
        name: true,
        kind: true,
        type: true,
        parentId: true,
        sortOrder: true,
        archived: true,
      },
    }),
    prisma.supplyOrderItem.findMany({
      where: { containerLocationId: { not: null }, supplyOrder: { eventId } },
      select: { containerLocationId: true, sourceLocationId: true },
    }),
  ]);

  const index = buildLocationIndex(rows);
  const placements = resolvePlacements(index, containerLines);
  return {
    ids: Array.from(subtreeIds(placements, containerLocationId)),
    name: index.byId.get(containerLocationId)?.name ?? "this container",
  };
}

/**
 * What "also mark contents" would touch, split by what the caller can actually
 * write. A box's contents routinely span orders and order types, so a caller
 * with only one of the two permissions sees a partial number — which the UI
 * states outright rather than applying silently.
 */
export async function previewContainerCascadeCore(
  containerLocationId: string,
  eventId: string,
  userId: string,
): Promise<ContainerCascadePreview> {
  await requirePermissionForUser(userId, "EVENTS", "VIEW", eventId);
  const { ids, name } = await containerSubtree(containerLocationId, eventId);

  const [canWriteSupply, canWritePrint, supplyTotal, printTotal] = await Promise.all([
    hasPermissionForUser(userId, "SUPPLY_ORDERS", "WRITE", eventId),
    hasPermissionForUser(userId, "PRINT_ORDERS", "WRITE", eventId),
    prisma.supplyOrderItem.count({
      where: { sourceLocationId: { in: ids }, supplyOrder: { eventId } },
    }),
    prisma.printItem.count({
      where: { sourceLocationId: { in: ids }, printOrder: { eventId } },
    }),
  ]);

  return {
    containerName: name,
    supplyCount: canWriteSupply ? supplyTotal : 0,
    printCount: canWritePrint ? printTotal : 0,
    blockedSupplyCount: canWriteSupply ? 0 : supplyTotal,
    blockedPrintCount: canWritePrint ? 0 : printTotal,
  };
}

/**
 * Set packing status on everything sourced from a container's subtree for one
 * event. Nested container lines are themselves supply items sourced from their
 * parent container, so they come along without special handling.
 *
 * This is an explicit verb, not stored parent state — the container line's own
 * packingStatus stays its own, which is why the divergence that killed
 * SupplyOrder.packingStatus can't recur here.
 */
export async function markContainerContentsCore(
  containerLocationId: string,
  eventId: string,
  packingStatus: PackingStatus,
  userId: string,
): Promise<{ supplyUpdated: number; printUpdated: number }> {
  await requirePermissionForUser(userId, "EVENTS", "VIEW", eventId);

  const [canWriteSupply, canWritePrint] = await Promise.all([
    hasPermissionForUser(userId, "SUPPLY_ORDERS", "WRITE", eventId),
    hasPermissionForUser(userId, "PRINT_ORDERS", "WRITE", eventId),
  ]);
  if (!canWriteSupply && !canWritePrint) {
    await requirePermissionForUser(userId, "SUPPLY_ORDERS", "WRITE", eventId);
  }

  const { ids } = await containerSubtree(containerLocationId, eventId);

  // Only the writes the caller is actually allowed to make; the UI states the
  // skipped count rather than applying a partial change silently.
  const writes = [];
  if (canWriteSupply) {
    writes.push(
      prisma.supplyOrderItem.updateMany({
        where: { sourceLocationId: { in: ids }, supplyOrder: { eventId } },
        data: { packingStatus },
      }),
    );
  }
  if (canWritePrint) {
    writes.push(
      prisma.printItem.updateMany({
        where: { sourceLocationId: { in: ids }, printOrder: { eventId } },
        data: { packingStatus },
      }),
    );
  }

  const results = await prisma.$transaction(writes);
  let cursor = 0;
  const supplyUpdated = canWriteSupply ? (results[cursor++]?.count ?? 0) : 0;
  const printUpdated = canWritePrint ? (results[cursor]?.count ?? 0) : 0;

  return { supplyUpdated, printUpdated };
}

export type ReturnToLocationResult = {
  locationName: string;
  /** Items that had no durable record and got one. */
  created: number;
  /** Items already linked to inventory, re-filed at the new location. */
  rehomed: number;
  /** Ids that aren't loose supply items on this event. */
  skipped: number;
  /**
   * Descriptions of items skipped specifically for having no equipment link.
   * Named rather than counted because the fix is per-item: catalogue the thing,
   * then file it. Capped so a bulk mistake doesn't produce a wall of text.
   */
  needCatalogued: string[];
};

const NEED_CATALOGUED_SHOWN = 5;

/**
 * File loose items back into a container after an event — the post-event half of
 * the inventory loop.
 *
 * An inventory item has exactly one home, so re-filing an already-linked item is
 * a move, not a copy; that is why this can't double up rows when the same repack
 * gets recorded twice. Print items are deliberately unsupported: print collateral
 * is given away rather than kept, so there is nothing durable to record.
 *
 * The order item's own sourceLocationId is left untouched. It records where the
 * item came from *for that event*; rewriting it to where the item ended up would
 * falsify a past order. inventoryItemId is the forward link.
 */
export async function returnItemsToLocationCore(
  supplyItemIds: string[],
  targetLocationId: string,
  eventId: string,
  userId: string,
): Promise<ReturnToLocationResult> {
  await requirePermissionForUser(userId, "EVENTS", "VIEW", eventId);
  await requirePermissionForUser(userId, "SUPPLY_ORDERS", "WRITE", eventId);
  const tenantId = await requireEventTenantId(eventId);
  await requirePermissionForUser(userId, "STORAGE_LOCATIONS", "WRITE", { tenantId });

  const location = await prisma.storageLocation.findFirst({
    where: { id: targetLocationId, tenantId },
    select: { name: true, archived: true },
  });
  if (!location) throw new Error("Location not found.");
  if (location.archived) {
    throw new Error(`"${location.name}" is archived — restore it before filing items there.`);
  }

  // The permission check says the caller may write supply items on this event;
  // it says nothing about these particular ids belonging to it. Scoping the read
  // by eventId is the ownership half — anything that doesn't come back is
  // reported as skipped rather than trusted from the client's list.
  const items = await prisma.supplyOrderItem.findMany({
    where: { id: { in: supplyItemIds }, supplyOrder: { eventId } },
    select: {
      id: true,
      description: true,
      quantity: true,
      equipmentId: true,
      inventoryItemId: true,
      containerLocationId: true,
      equipment: { select: { name: true } },
    },
  });

  // A container line *is* the box, not something inside it — filing it into a
  // location would make the box its own contents.
  const loose = items.filter((item) => !item.containerLocationId);

  // Inventory is catalogued gear, so a line with only free text has nothing to
  // file. Naming these lets someone catalogue them and retry, rather than
  // wondering which of the selection didn't land.
  //
  // Deleting equipment mid-repack would still fail the create with a foreign key
  // error, and no read-time check can prevent that — SupplyOrderItem.equipment is
  // SetNull, so the id and the relation go null together and neither reveals a
  // delete that lands after this query. The FK is what protects integrity here;
  // the failure mode is one opaque error and a retry. deleteEquipment already
  // refuses to delete equipment that is stocked anywhere, which leaves only
  // never-inventoried equipment in the window.
  const uncatalogued = loose.filter((item) => !item.equipmentId && !item.inventoryItemId);
  const filable = loose.filter((item) => item.equipmentId || item.inventoryItemId);
  const skipped = supplyItemIds.length - filable.length;

  const toRehome = filable.filter((item) => item.inventoryItemId);
  const toCreate = filable.filter((item) => !item.inventoryItemId);

  await prisma.$transaction(async (tx) => {
    if (toRehome.length > 0) {
      await tx.inventoryItem.updateMany({
        where: { id: { in: toRehome.map((item) => item.inventoryItemId!) }, tenantId },
        data: { locationId: targetLocationId },
      });
    }

    const { _max } = await tx.inventoryItem.aggregate({
      where: { locationId: targetLocationId },
      _max: { sortOrder: true },
    });
    let sortOrder = (_max.sortOrder ?? -1) + 1;

    for (const item of toCreate) {
      const created = await tx.inventoryItem.create({
        data: {
          tenantId,
          locationId: targetLocationId,
          // Equipment carries the identity, so the order line's free-text
          // description survives only as the qualifier — and only when it says
          // something the equipment name doesn't already.
          name:
            item.description && item.description !== item.equipment?.name
              ? item.description
              : null,
          equipmentId: item.equipmentId!,
          quantity: item.quantity,
          sortOrder: sortOrder++,
        },
      });
      await tx.supplyOrderItem.update({
        where: { id: item.id },
        data: { inventoryItemId: created.id },
      });
    }
  });

  return {
    locationName: location.name,
    created: toCreate.length,
    rehomed: toRehome.length,
    skipped,
    needCatalogued: uncatalogued
      .slice(0, NEED_CATALOGUED_SHOWN)
      .map((item) => item.description ?? "Untitled item"),
  };
}
