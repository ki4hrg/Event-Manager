import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { getEquipment, createEquipmentInline } from "@/app/equipment/actions";
import { getOptions } from "@/app/settings/actions";
import {
  ancestorIds,
  buildLocationIndex,
  durablePlacements,
  flattenLocations,
  toLocationOption,
} from "@/lib/storageLocations";
import {
  getStorageLocations,
  getLocationContents,
  createInventoryItem,
  updateInventoryItem,
  setInventoryItemArchived,
  moveInventoryItems,
  deleteInventoryItems,
} from "../../actions";
import { LocationContents } from "./LocationContents";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locationId: string }>;
}): Promise<Metadata> {
  const { locationId } = await params;
  const location = await prisma.storageLocation.findUnique({
    where: { id: locationId },
    select: { name: true },
  });
  return { title: location?.name ?? "Location" };
}

export default async function LocationDetailPage({
  params,
}: {
  params: Promise<{ locationId: string }>;
}) {
  const { locationId } = await params;

  const [
    location,
    storageLocations,
    items,
    equipmentOptions,
    equipmentCategories,
    canWrite,
    canDelete,
    canManageEquipment,
  ] = await Promise.all([
    prisma.storageLocation.findUnique({ where: { id: locationId } }),
    getStorageLocations(),
    getLocationContents(locationId),
    getEquipment(),
    getOptions("equipment_category"),
    hasPermission(PermissionResource.STORAGE_LOCATIONS, "WRITE"),
    hasPermission(PermissionResource.STORAGE_LOCATIONS, "DELETE"),
    hasPermission(PermissionResource.EQUIPMENT, "WRITE"),
  ]);

  if (!location) notFound();

  const index = buildLocationIndex(storageLocations);
  const placements = durablePlacements(index);

  // Nearest-first from ancestorIds, so reverse for root-first crumbs.
  const ancestors = ancestorIds(placements, locationId)
    .map((id) => index.byId.get(id))
    .filter((node): node is NonNullable<typeof node> => !!node)
    .reverse();

  // No excludeSubtreeOf: items aren't tree nodes, so there is no cycle to avoid,
  // and moving contents down into a child box is an ordinary repack.
  const moveOptions = flattenLocations(index).map(toLocationOption);

  const createItemAction = async (formData: FormData) => {
    "use server";
    await createInventoryItem(locationId, formData);
  };

  const updateItemAction = async (id: string, formData: FormData) => {
    "use server";
    await updateInventoryItem(id, locationId, formData);
  };

  const setArchivedAction = async (id: string, archived: boolean) => {
    "use server";
    await setInventoryItemArchived(id, locationId, archived);
  };

  const moveItemsAction = async (ids: string[], targetLocationId: string) => {
    "use server";
    await moveInventoryItems(ids, targetLocationId);
  };

  const deleteItemsAction = async (ids: string[]) => {
    "use server";
    await deleteInventoryItems(ids);
  };

  const createEquipmentAction = async (name: string, category: string) => {
    "use server";
    return createEquipmentInline(name, category);
  };

  return (
    <LocationContents
      location={{
        id: location.id,
        name: location.name,
        kind: location.kind,
        type: location.type,
        notes: location.notes,
        archived: location.archived,
      }}
      ancestors={ancestors.map((node) => ({ id: node.id, name: node.name }))}
      items={items}
      equipmentOptions={equipmentOptions}
      equipmentCategories={equipmentCategories.map((c) => ({ id: c.id, label: c.label }))}
      moveOptions={moveOptions}
      canWrite={canWrite}
      canDelete={canDelete}
      canManageEquipment={canManageEquipment}
      createEquipment={createEquipmentAction}
      createItem={createItemAction}
      updateItem={updateItemAction}
      setArchived={setArchivedAction}
      moveItems={moveItemsAction}
      deleteItems={deleteItemsAction}
    />
  );
}
