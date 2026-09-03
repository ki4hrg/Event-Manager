import type { AcquisitionState, PackingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { partyLabel } from "@/lib/partyLabel";
import { formatBreakoutSessionName } from "@/lib/breakoutLabels";
import {
  buildChildrenMap,
  buildLocationIndex,
  flattenLocations,
  resolvePlacements,
  subtreeIds,
} from "@/lib/storageLocations";

/**
 * Single source of truth for "what is packable on this event". Both the
 * interactive packing list (`/events/[id]/packing`, via `getPackingListItems`)
 * and the read-only Packing List report (`getPackingListData`) read through
 * here, so the two can never disagree about which lines exist — container
 * lines (`containerLocationId` set) included, print items included.
 *
 * Plain module on purpose: no `"use server"`, no auth. Callers own their own
 * permission checks. The report action is deliberately auth-free so the
 * unauthenticated /share/[token] route can reuse it.
 */
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
  /** Effective provider: the per-item override when set, else the order's. */
  provider: string | null;
  /** Per-item provider override — null when the line inherits the order's. */
  itemProvider: string | null;
  /** Provider named on the parent order. */
  orderProvider: string | null;
  notes: string | null;
  sourceLocationId: string | null;
  sourceLocationName: string | null;
  sourceLocationPath: string | null;
  /** Set when this row is a container being shipped rather than an item in one. */
  containerLocationId: string | null;
  /** Destination context — only populated when `includeDestinations` is set. */
  roomId: string | null;
  roomName: string | null;
  venueName: string | null;
  roomGroupName: string | null;
  roomGroupSortOrder: number | null;
  orderSpecificLocation: string | null;
  functionNames: string[];
  presentationNames: string[];
};

export type PackingLocationOption = {
  id: string;
  name: string;
  path: string;
  depth: number;
  isContainer: boolean;
};

export type PackingItemsResult = {
  items: PackableItem[];
  locations: PackingLocationOption[];
  /** locationId -> every id at or below it on this event's effective graph. */
  locationSubtrees: Record<string, string[]>;
};

export type PackingItemsOptions = {
  includeSupply?: boolean;
  includePrint?: boolean;
  /**
   * Loads room / venue / function / presentation context for each row via two
   * extra order-level queries. Off for the operational packing list, which
   * polls every 15s and renders none of it.
   */
  includeDestinations?: boolean;
};

type Destination = {
  roomId: string | null;
  roomName: string | null;
  venueName: string | null;
  roomGroupName: string | null;
  roomGroupSortOrder: number | null;
  orderSpecificLocation: string | null;
  functionNames: string[];
  presentationNames: string[];
};

const NO_DESTINATION: Destination = {
  roomId: null,
  roomName: null,
  venueName: null,
  roomGroupName: null,
  roomGroupSortOrder: null,
  orderSpecificLocation: null,
  functionNames: [],
  presentationNames: [],
};

type RoomRef = {
  id: string;
  name: string;
  venue: { name: string } | null;
  group: { name: string; sortOrder: number } | null;
} | null;

const roomSelect = {
  id: true,
  name: true,
  venue: { select: { name: true } },
  group: { select: { name: true, sortOrder: true } },
} as const;

const functionLinkSelect = {
  function: { select: { name: true, breakoutGroup: { select: { name: true } } } },
} as const;

function destinationFrom(
  room: RoomRef,
  specificLocation: string | null,
  functionLinks: { function: { name: string; breakoutGroup: { name: string } | null } }[],
  presentationTitles: string[]
): Destination {
  return {
    roomId: room?.id ?? null,
    roomName: room?.name ?? null,
    venueName: room?.venue?.name ?? null,
    roomGroupName: room?.group?.name ?? null,
    roomGroupSortOrder: room?.group?.sortOrder ?? null,
    orderSpecificLocation: specificLocation,
    functionNames: functionLinks.map((l) =>
      formatBreakoutSessionName(l.function.name, l.function.breakoutGroup?.name)
    ),
    presentationNames: presentationTitles,
  };
}

async function loadDestinations(
  eventId: string,
  includeSupply: boolean,
  includePrint: boolean
): Promise<{ supply: Map<string, Destination>; print: Map<string, Destination> }> {
  const [supplyOrders, printOrders] = await Promise.all([
    includeSupply
      ? prisma.supplyOrder.findMany({
          where: { eventId },
          select: {
            id: true,
            specificLocation: true,
            room: { select: roomSelect },
            functions: { select: functionLinkSelect },
            presentations: { select: { presentation: { select: { title: true } } } },
          },
        })
      : Promise.resolve([]),
    includePrint
      ? prisma.printOrder.findMany({
          where: { eventId },
          select: {
            id: true,
            specificLocation: true,
            room: { select: roomSelect },
            functions: { select: functionLinkSelect },
            presentation: { select: { title: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  return {
    supply: new Map(
      supplyOrders.map((o) => [
        o.id,
        destinationFrom(
          o.room,
          o.specificLocation,
          o.functions,
          o.presentations.map((p) => p.presentation.title)
        ),
      ])
    ),
    print: new Map(
      printOrders.map((o) => [
        o.id,
        destinationFrom(
          o.room,
          o.specificLocation,
          o.functions,
          o.presentation ? [o.presentation.title] : []
        ),
      ])
    ),
  };
}

export async function buildPackingItems(
  eventId: string,
  opts: PackingItemsOptions = {}
): Promise<PackingItemsResult> {
  const includeSupply = opts.includeSupply ?? true;
  const includePrint = opts.includePrint ?? true;
  const withDestinations = opts.includeDestinations ?? false;

  const [supply, print] = await Promise.all([
    includeSupply
      ? prisma.supplyOrderItem.findMany({
          where: { supplyOrder: { eventId } },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
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
    includePrint
      ? prisma.printItem.findMany({
          where: { printOrder: { eventId } },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
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

  const destinations = withDestinations
    ? await loadDestinations(eventId, includeSupply, includePrint)
    : null;

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
    }))
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
        itemProvider,
        orderProvider,
        notes: s.notes ?? null,
        sourceLocationId: s.sourceLocationId,
        sourceLocationName: s.sourceLocationId
          ? (index.byId.get(s.sourceLocationId)?.name ?? null)
          : null,
        sourceLocationPath: s.sourceLocationId ? (pathById.get(s.sourceLocationId) ?? null) : null,
        containerLocationId: s.containerLocationId,
        ...(destinations?.supply.get(s.supplyOrderId) ?? NO_DESTINATION),
      };
    }),
    ...print.map((p): PackableItem => {
      const orderProvider = p.printOrder.vendors[0]?.vendor.name ?? null;
      return {
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
        provider: orderProvider,
        itemProvider: null,
        orderProvider,
        notes: p.notes ?? null,
        sourceLocationId: p.sourceLocationId,
        sourceLocationName: p.sourceLocationId
          ? (index.byId.get(p.sourceLocationId)?.name ?? null)
          : null,
        sourceLocationPath: p.sourceLocationId ? (pathById.get(p.sourceLocationId) ?? null) : null,
        containerLocationId: null,
        ...(destinations?.print.get(p.printOrderId) ?? NO_DESTINATION),
      };
    }),
  ];

  return { items, locations, locationSubtrees };
}
