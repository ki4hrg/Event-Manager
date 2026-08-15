"use server";

import { revalidatePath } from "next/cache";
import type { AcquisitionState, PackingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  markContainerContentsCore,
  previewContainerCascadeCore,
  returnItemsToLocationCore,
  type ContainerCascadePreview,
  type ReturnToLocationResult,
} from "./core";
import {
  buildChildrenMap,
  buildLocationIndex,
  flattenLocations,
  resolvePlacements,
  subtreeIds,
} from "@/lib/storageLocations";
import {
  hasPermission,
  requirePermission,
  PermissionError,
} from "@/lib/permissions";
import { partyLabel } from "@/lib/partyLabel";
import {
  getUserSetting,
  setUserSetting,
  packingProviderFilterKey,
  packingLocationFilterKey,
} from "@/lib/userSettings";

export type PackableItem = {
  kind: "SUPPLY" | "PRINT";
  itemId: string;
  parentOrderId: string;
  parentOrderName: string;
  parentOrderHref: string;
  description: string;
  quantity: number | null;
  acquisitionState: AcquisitionState;
  packingStatus: PackingStatus;
  equipmentCategory: string | null;
  provider: string | null;
  notes: string | null;
  sourceLocationId: string | null;
  sourceLocationName: string | null;
  sourceLocationPath: string | null;
  /** Set when this row is a container being shipped rather than an item in one. */
  containerLocationId: string | null;
};

export type PackingLocationOption = {
  id: string;
  name: string;
  path: string;
  depth: number;
  isContainer: boolean;
};

export type PackingListPayload = {
  items: PackableItem[];
  canSeeSupply: boolean;
  canSeePrint: boolean;
  canWriteSupply: boolean;
  canWritePrint: boolean;
  /** Gates "Return to…", which writes durable inventory rather than order data. */
  canWriteStorage: boolean;
  locations: PackingLocationOption[];
  /** locationId -> every id at or below it on this event's effective graph. */
  locationSubtrees: Record<string, string[]>;
};

export async function getPackingListItems(eventId: string): Promise<PackingListPayload> {
  await requirePermission("EVENTS", "VIEW", eventId);

  const [canSeeSupply, canSeePrint, canWriteSupply, canWritePrint, canWriteStorage] =
    await Promise.all([
      hasPermission("SUPPLY_ORDERS", "VIEW", eventId),
      hasPermission("PRINT_ORDERS", "VIEW", eventId),
      hasPermission("SUPPLY_ORDERS", "WRITE", eventId),
      hasPermission("PRINT_ORDERS", "WRITE", eventId),
      hasPermission("STORAGE_LOCATIONS", "WRITE"),
    ]);

  if (!canSeeSupply && !canSeePrint) {
    throw new PermissionError("FORBIDDEN");
  }

  const [supply, print] = await Promise.all([
    canSeeSupply
      ? prisma.supplyOrderItem.findMany({
          where: { supplyOrder: { eventId } },
          include: {
            supplyOrder: {
              select: {
                id: true,
                name: true,
                providerVendor: { select: { name: true } },
                providerContact: { select: { firstName: true, lastName: true } },
              },
            },
            equipment: { select: { name: true, category: true } },
            containerLocation: { select: { id: true, name: true } },
            providerVendor: { select: { name: true } },
            providerContact: { select: { firstName: true, lastName: true } },
          },
        })
      : Promise.resolve([]),
    canSeePrint
      ? prisma.printItem.findMany({
          where: { printOrder: { eventId } },
          include: {
            printOrder: {
              select: {
                id: true,
                name: true,
                vendors: {
                  include: { vendor: { select: { name: true } } },
                  orderBy: { vendor: { name: "asc" } },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  // The location tree plus this event's container placements, so a filter on a
  // pallet can include everything nested under it.
  const locationRows = await prisma.storageLocation.findMany({
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
  const index = buildLocationIndex(locationRows);
  const placements = resolvePlacements(
    index,
    supply.map((s) => ({
      containerLocationId: s.containerLocationId,
      sourceLocationId: s.sourceLocationId,
    })),
  );
  const flattened = flattenLocations(index, { placements, includeArchived: true });
  const locations: PackingLocationOption[] = flattened.map((node) => ({
    id: node.id,
    name: node.name,
    path: node.path,
    depth: node.depth,
    isContainer: node.kind === "CONTAINER",
  }));
  const childrenMap = buildChildrenMap(placements);
  const locationSubtrees: Record<string, string[]> = {};
  for (const node of flattened) {
    locationSubtrees[node.id] = Array.from(subtreeIds(placements, node.id, childrenMap));
  }
  const pathById = new Map(flattened.map((node) => [node.id, node.path]));

  const items: PackableItem[] = [
    ...supply.map((s): PackableItem => {
      const itemProvider = partyLabel(s.providerVendor, s.providerContact);
      const orderProvider = partyLabel(s.supplyOrder.providerVendor, s.supplyOrder.providerContact);
      return {
        kind: "SUPPLY",
        itemId: s.id,
        parentOrderId: s.supplyOrderId,
        parentOrderName: s.supplyOrder.name,
        parentOrderHref: `/events/${eventId}/supply-orders/${s.supplyOrderId}`,
        description:
          s.description ?? s.containerLocation?.name ?? s.equipment?.name ?? "(unnamed item)",
        quantity: s.quantity ?? null,
        acquisitionState: s.acquisitionState,
        packingStatus: s.packingStatus,
        equipmentCategory: s.equipment?.category ?? null,
        provider: itemProvider ?? orderProvider,
        notes: s.notes ?? null,
        sourceLocationId: s.sourceLocationId,
        sourceLocationName: s.sourceLocationId
          ? (index.byId.get(s.sourceLocationId)?.name ?? null)
          : null,
        sourceLocationPath: s.sourceLocationId ? (pathById.get(s.sourceLocationId) ?? null) : null,
        containerLocationId: s.containerLocationId,
      };
    }),
    ...print.map((p): PackableItem => ({
      kind: "PRINT",
      itemId: p.id,
      parentOrderId: p.printOrderId,
      parentOrderName: p.printOrder.name,
      parentOrderHref: `/events/${eventId}/print-orders/${p.printOrderId}`,
      description: p.description,
      quantity: p.quantity ?? null,
      acquisitionState: p.acquisitionState,
      packingStatus: p.packingStatus,
      equipmentCategory: null,
      provider: p.printOrder.vendors[0]?.vendor.name ?? null,
      notes: p.notes ?? null,
      sourceLocationId: p.sourceLocationId,
      sourceLocationName: p.sourceLocationId
        ? (index.byId.get(p.sourceLocationId)?.name ?? null)
        : null,
      sourceLocationPath: p.sourceLocationId ? (pathById.get(p.sourceLocationId) ?? null) : null,
      containerLocationId: null,
    })),
  ];

  return {
    items,
    canSeeSupply,
    canSeePrint,
    canWriteSupply,
    canWritePrint,
    canWriteStorage,
    locations,
    locationSubtrees,
  };
}

export async function previewContainerCascade(
  containerLocationId: string,
  eventId: string,
): Promise<ContainerCascadePreview> {
  const session = await requirePermission("EVENTS", "VIEW", eventId);
  return previewContainerCascadeCore(containerLocationId, eventId, session.user.id);
}

export async function markContainerContents(
  containerLocationId: string,
  eventId: string,
  packingStatus: PackingStatus,
): Promise<{ supplyUpdated: number; printUpdated: number }> {
  const session = await requirePermission("EVENTS", "VIEW", eventId);
  const result = await markContainerContentsCore(
    containerLocationId,
    eventId,
    packingStatus,
    session.user.id,
  );
  revalidatePath(`/events/${eventId}/packing`);
  revalidatePath(`/events/${eventId}/supply-orders`);
  revalidatePath(`/events/${eventId}/print-orders`);
  return result;
}

export async function returnItemsToLocation(
  supplyItemIds: string[],
  targetLocationId: string,
  eventId: string,
): Promise<ReturnToLocationResult> {
  const session = await requirePermission("EVENTS", "VIEW", eventId);
  const result = await returnItemsToLocationCore(
    supplyItemIds,
    targetLocationId,
    eventId,
    session.user.id,
  );
  revalidatePath(`/events/${eventId}/packing`);
  revalidatePath("/storage-locations");
  revalidatePath(`/storage-locations/locations/${targetLocationId}`);
  return result;
}

export async function getSavedProviderFilter(eventId: string): Promise<string | null> {
  const session = await requirePermission("EVENTS", "VIEW", eventId);
  return getUserSetting(session.user.id, packingProviderFilterKey(eventId));
}

export async function savePackingProviderFilter(
  eventId: string,
  value: string,
): Promise<void> {
  const session = await requirePermission("EVENTS", "VIEW", eventId);
  await setUserSetting(session.user.id, packingProviderFilterKey(eventId), value);
}

export async function getSavedLocationFilter(eventId: string): Promise<string | null> {
  const session = await requirePermission("EVENTS", "VIEW", eventId);
  return getUserSetting(session.user.id, packingLocationFilterKey(eventId));
}

export async function savePackingLocationFilter(
  eventId: string,
  value: string,
): Promise<void> {
  const session = await requirePermission("EVENTS", "VIEW", eventId);
  await setUserSetting(session.user.id, packingLocationFilterKey(eventId), value);
}
