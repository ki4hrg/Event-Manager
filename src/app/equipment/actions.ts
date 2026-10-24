"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { requireActiveTenantId } from "@/lib/tenant";
import { carryEquipmentRename } from "@/lib/equipment-utils";
import { revalidatePath } from "next/cache";
import { PermissionResource } from "@prisma/client";

// getEquipment is auth-only (not EQUIPMENT-gated) because order forms across the
// app need to read the equipment list to render pickers — gating it on EQUIPMENT
// would force every order-editing role to also carry EQUIPMENT.VIEW.
export async function getEquipment() {
  await requireAuth();
  const tenantId = await requireActiveTenantId();
  return prisma.equipment.findMany({
    where: { tenantId },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  });
}

export async function createEquipment(formData: FormData) {
  const { tenantId } = await requirePermission(PermissionResource.EQUIPMENT, "WRITE");
  const name = formData.get("name") as string;
  const category = formData.get("category") as string;

  const { _max } = await prisma.equipment.aggregate({
    where: { tenantId, category },
    _max: { sortOrder: true },
  });

  await prisma.equipment.create({
    data: {
      tenantId,
      name,
      category,
      sortOrder: (_max.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath("/equipment");
}

/**
 * Used by the inline "＋ New equipment" affordance when inventorying a location,
 * which needs the new id back rather than a redirect. Gated on EQUIPMENT WRITE
 * like every other write here, which is admin-only in the seed — so a packer
 * holding STORAGE_LOCATIONS WRITE can file catalogued gear but not extend the
 * catalog itself.
 */
export async function createEquipmentInline(
  name: string,
  category: string,
): Promise<string> {
  const { tenantId } = await requirePermission(PermissionResource.EQUIPMENT, "WRITE");

  const trimmed = name.trim();
  if (!trimmed) throw new Error("Equipment needs a name.");
  if (!category) throw new Error("Equipment needs a category.");

  const existing = await prisma.equipment.findFirst({
    where: { tenantId, name: trimmed, category },
    select: { id: true },
  });
  // @@unique([tenantId, category, name]) — reuse rather than erroring, since the
  // point is to get an id back and the caller doesn't care whether it just got
  // created.
  if (existing) return existing.id;

  const { _max } = await prisma.equipment.aggregate({
    where: { tenantId, category },
    _max: { sortOrder: true },
  });
  const created = await prisma.equipment.create({
    data: { tenantId, name: trimmed, category, sortOrder: (_max.sortOrder ?? -1) + 1 },
  });

  revalidatePath("/equipment");
  return created.id;
}

export async function updateEquipment(id: string, formData: FormData) {
  const { tenantId } = await requirePermission(PermissionResource.EQUIPMENT, "WRITE");
  const current = await prisma.equipment.findFirst({ where: { id, tenantId }, select: { name: true } });
  if (!current) throw new Error("Equipment not found.");
  const name = formData.get("name") as string;
  await prisma.$transaction(async (tx) => {
    await tx.equipment.update({ where: { id, tenantId }, data: { name, category: formData.get("category") as string } });
    await carryEquipmentRename(tx, id, current.name, name);
  });
  revalidatePath("/equipment");
}

export async function deleteEquipment(id: string) {
  const { tenantId } = await requirePermission(PermissionResource.EQUIPMENT, "DELETE");

  // Every other reference to Equipment is SetNull, so deleting one has always
  // been safe. InventoryItem is the exception — its equipment link is required,
  // so the FK is Restrict and this delete would fail at the database. The
  // pre-check turns that into a sentence naming where the stock sits, the same
  // shape as deleteStorageLocationCore's contents check.
  const equipment = await prisma.equipment.findFirst({
    where: { id, tenantId },
    select: { name: true, _count: { select: { inventoryItems: true } } },
  });
  if (!equipment) throw new Error("Equipment not found.");
  const inventoried = equipment._count.inventoryItems;
  if (inventoried > 0) {
    throw new Error(
      `"${equipment.name}" is stocked in ${inventoried} location${inventoried === 1 ? "" : "s"}. Remove those inventory items first.`,
    );
  }

  await prisma.equipment.delete({ where: { id, tenantId } });
  revalidatePath("/equipment");
}

// Equipment categories are CustomOption rows with category="equipment_category",
// edited through the shared option actions (src/app/(admin)/settings/actions.ts), which
// gate them on EQUIPMENT per the registry. Read here for the item pickers.
export async function getEquipmentCategories() {
  await requireAuth();
  const tenantId = await requireActiveTenantId();
  return prisma.customOption.findMany({
    where: { tenantId, category: "equipment_category" },
    orderBy: { sortOrder: "asc" },
  });
}
