import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getActiveTenantId, requireActiveTenantId } from "@/lib/tenant";
import { hasPermission } from "@/lib/permissions";
import { getEquipment, createEquipmentInline } from "@/app/equipment/actions";
import { getOptions } from "@/app/(admin)/settings/actions";
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
  getSupplyOrderTargets,
  addInventoryToSupplyOrder,
} from "../../actions";
import { LocationContents } from "./LocationContents";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locationId: string }>;
}): Promise<Metadata> {
  const { locationId } = await params;
  const location = await prisma.storageLocation.findFirst({
    where: { id: locationId, tenantId: (await getActiveTenantId()) ?? "" },
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
  const tenantId = await requireActiveTenantId();

  const [
    location,
    storageLocations,
    items,
    equipmentOptions,
    equipmentCategories,
    canWrite,
    canDelete,
    canManageEquipment,
    supplyOrderTargets,
    children,
  ] = await Promise.all([
    prisma.storageLocation.findFirst({ where: { id: locationId, tenantId } }),
    getStorageLocations(),
    getLocationContents(locationId),
    getEquipment(),
    getOptions("equipment_category"),
    hasPermission(PermissionResource.STORAGE_LOCATIONS, "WRITE"),
    hasPermission(PermissionResource.STORAGE_LOCATIONS, "DELETE"),
    hasPermission(PermissionResource.EQUIPMENT, "WRITE"),
    getSupplyOrderTargets(),
    // Direct children only. The tree page is where the whole hierarchy lives;
    // here the question is "what else is in this one", and a deep rollup would
    // reprint the tree inside every location.
    prisma.storageLocation.findMany({
      where: { tenantId, parentId: locationId, archived: false },
      select: {
        id: true,
        name: true,
        kind: true,
        type: true,
        _count: { select: { inventoryItems: true, children: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
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
    return createInventoryItem(locationId, formData);
  };

  const updateItemAction = async (id: string, formData: FormData) => {
    "use server";
    return updateInventoryItem(id, locationId, formData);
  };

  const setArchivedAction = async (id: string, archived: boolean) => {
    "use server";
    await setInventoryItemArchived(id, locationId, archived);
  };

  const moveItemsAction = async (ids: string[], targetLocationId: string) => {
    "use server";
    return moveInventoryItems(ids, targetLocationId);
  };

  const deleteItemsAction = async (ids: string[]) => {
    "use server";
    return deleteInventoryItems(ids);
  };

  const createEquipmentAction = async (name: string, category: string) => {
    "use server";
    return createEquipmentInline(name, category);
  };

  const addToSupplyOrderAction = async (
    inventoryItemIds: string[],
    supplyOrderId: string,
  ) => {
    "use server";
    return addInventoryToSupplyOrder(inventoryItemIds, supplyOrderId, locationId);
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
      nested={children.map((child) => ({
        id: child.id,
        name: child.name,
        kind: child.kind,
        type: child.type,
        itemCount: child._count.inventoryItems,
        childCount: child._count.children,
      }))}
      equipmentOptions={equipmentOptions}
      equipmentCategories={equipmentCategories.map((c) => ({ id: c.id, label: c.label }))}
      moveOptions={moveOptions}
      canWrite={canWrite}
      canDelete={canDelete}
      canManageEquipment={canManageEquipment}
      createEquipment={createEquipmentAction}
      supplyOrderTargets={supplyOrderTargets}
      addToSupplyOrder={addToSupplyOrderAction}
      createItem={createItemAction}
      updateItem={updateItemAction}
      setArchived={setArchivedAction}
      moveItems={moveItemsAction}
      deleteItems={deleteItemsAction}
    />
  );
}
