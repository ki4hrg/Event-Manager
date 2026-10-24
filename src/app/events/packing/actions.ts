"use server";

import { revalidatePath } from "next/cache";
import type { PackingStatus } from "@prisma/client";
import {
  markContainerContentsCore,
  previewContainerCascadeCore,
  returnItemsToLocationCore,
  type ContainerCascadePreview,
  type ReturnToLocationResult,
} from "./core";
import {
  buildPackingItems,
  type PackableItem,
  type PackingLocationOption,
} from "@/lib/packingItems";
import {
  hasPermission,
  requirePermission,
  PermissionError,
} from "@/lib/permissions";
import { withUserErrors, type UserError } from "@/lib/userErrors";
import {
  getUserSetting,
  setUserSetting,
  packingProviderFilterKey,
  packingLocationFilterKey,
} from "@/lib/userSettings";

// Item shape and the query behind it live in @/lib/packingItems so the Packing
// List report (auth-free, share-route reusable) reads the exact same lines.
export type { PackableItem, PackingLocationOption } from "@/lib/packingItems";

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

  const { items, locations, locationSubtrees } = await buildPackingItems(eventId, {
    includeSupply: canSeeSupply,
    includePrint: canSeePrint,
  });

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
): Promise<ReturnToLocationResult | UserError> {
  const session = await requirePermission("EVENTS", "VIEW", eventId);
  return withUserErrors(async () => {
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
  });
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
