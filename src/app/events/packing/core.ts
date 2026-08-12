import type { PackingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasPermissionForUser, requirePermissionForUser } from "@/lib/permissions";
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
