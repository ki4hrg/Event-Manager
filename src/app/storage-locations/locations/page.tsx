import type { Metadata } from "next";
import { PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActiveTenantId } from "@/lib/tenant";
import { hasPermission } from "@/lib/permissions";
import {
  buildLocationIndex,
  durablePlacements,
  flattenLocations,
  subtreeIds,
} from "@/lib/storageLocations";
import {
  getStorageLocations,
  getLocationTypes,
  createStorageLocation,
  updateStorageLocation,
  deleteStorageLocation,
  setStorageLocationArchived,
} from "../actions";
import { StorageLocationTree, type LocationRow } from "./StorageLocationTree";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Locations" };

export default async function LocationsPage() {
  const tenantId = await requireActiveTenantId();
  const [locations, types, itemCounts, canWrite, canDelete] = await Promise.all([
    getStorageLocations(),
    getLocationTypes(),
    prisma.inventoryItem.groupBy({
      by: ["locationId"],
      where: { tenantId, archived: false },
      _count: { _all: true },
    }),
    hasPermission(PermissionResource.STORAGE_LOCATIONS, "WRITE"),
    hasPermission(PermissionResource.STORAGE_LOCATIONS, "DELETE"),
  ]);

  // Flattened server-side so the tree helpers (which import prisma) stay off the
  // client. Archived nodes are included here; the client toggles their display.
  const index = buildLocationIndex(locations);
  const placements = durablePlacements(index);
  const byId = new Map(locations.map((l) => [l.id, l]));
  const countByLocation = new Map(itemCounts.map((c) => [c.locationId, c._count._all]));

  const rows: LocationRow[] = flattenLocations(index, { includeArchived: true }).map((node) => {
    const subtree = Array.from(subtreeIds(placements, node.id));
    return {
      id: node.id,
      name: node.name,
      kind: node.kind,
      type: node.type,
      parentId: node.parentId,
      notes: byId.get(node.id)?.notes ?? null,
      archived: node.archived,
      depth: node.depth,
      path: node.path,
      subtree,
      itemCount: countByLocation.get(node.id) ?? 0,
      // A rollup alone would advertise 20 items on a pallet whose own detail page
      // lists 3, which reads as a bug — so the direct count leads and this only
      // shows when the two differ. The subtree walk is already running here.
      subtreeItemCount: subtree.reduce((sum, id) => sum + (countByLocation.get(id) ?? 0), 0),
    };
  });

  return (
    <StorageLocationTree
      locations={rows}
      types={types}
      canWrite={canWrite}
      canDelete={canDelete}
      createLocation={createStorageLocation}
      updateLocation={updateStorageLocation}
      deleteLocation={deleteStorageLocation}
      setArchived={setStorageLocationArchived}
    />
  );
}
