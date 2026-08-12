import type { Metadata } from "next";
import { PermissionResource } from "@prisma/client";
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
  const [locations, types, canWrite, canDelete] = await Promise.all([
    getStorageLocations(),
    getLocationTypes(),
    hasPermission(PermissionResource.STORAGE_LOCATIONS, "WRITE"),
    hasPermission(PermissionResource.STORAGE_LOCATIONS, "DELETE"),
  ]);

  // Flattened server-side so the tree helpers (which import prisma) stay off the
  // client. Archived nodes are included here; the client toggles their display.
  const index = buildLocationIndex(locations);
  const placements = durablePlacements(index);
  const byId = new Map(locations.map((l) => [l.id, l]));

  const rows: LocationRow[] = flattenLocations(index, { includeArchived: true }).map((node) => ({
    id: node.id,
    name: node.name,
    kind: node.kind,
    type: node.type,
    parentId: node.parentId,
    notes: byId.get(node.id)?.notes ?? null,
    archived: node.archived,
    depth: node.depth,
    path: node.path,
    subtree: Array.from(subtreeIds(placements, node.id)),
  }));

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
