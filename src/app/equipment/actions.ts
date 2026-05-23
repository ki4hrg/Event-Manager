"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { PermissionResource } from "@prisma/client";

// getEquipment is auth-only (not EQUIPMENT-gated) because order forms across the
// app need to read the equipment list to render pickers — gating it on EQUIPMENT
// would force every order-editing role to also carry EQUIPMENT.VIEW.
export async function getEquipment() {
  await requireAuth();
  return prisma.equipment.findMany({
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  });
}

export async function createEquipment(formData: FormData) {
  await requirePermission(PermissionResource.EQUIPMENT, "WRITE");
  const name = formData.get("name") as string;
  const category = formData.get("category") as string;

  const { _max } = await prisma.equipment.aggregate({ where: { category }, _max: { sortOrder: true } });

  await prisma.equipment.create({
    data: {
      name,
      category,
      sortOrder: (_max.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath("/equipment");
}

export async function updateEquipment(id: string, formData: FormData) {
  await requirePermission(PermissionResource.EQUIPMENT, "WRITE");
  await prisma.equipment.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
      category: formData.get("category") as string,
    },
  });
  revalidatePath("/equipment");
}

export async function deleteEquipment(id: string) {
  await requirePermission(PermissionResource.EQUIPMENT, "DELETE");
  await prisma.equipment.delete({ where: { id } });
  revalidatePath("/equipment");
}

// Equipment categories are CustomOption rows with category="equipment_category".
// They're managed here (not via the generic settings CustomOption actions) so the
// equipment screen requires only EQUIPMENT permission, not SETTINGS.
export async function getEquipmentCategories() {
  await requireAuth();
  return prisma.customOption.findMany({
    where: { category: "equipment_category" },
    orderBy: { sortOrder: "asc" },
  });
}

export async function createEquipmentCategory(formData: FormData) {
  await requirePermission(PermissionResource.EQUIPMENT, "WRITE");
  const label = formData.get("label") as string;
  const color = formData.get("color") as string;
  const models = formData.getAll("models") as string[];

  const maxOrder = await prisma.customOption.findFirst({
    where: { category: "equipment_category" },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.customOption.create({
    data: {
      category: "equipment_category",
      label,
      color: color || null,
      models,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath("/equipment");
}

export async function updateEquipmentCategory(id: string, formData: FormData) {
  await requirePermission(PermissionResource.EQUIPMENT, "WRITE");
  const label = formData.get("label") as string;
  const color = formData.get("color") as string;
  const models = formData.getAll("models") as string[];

  const existing = await prisma.customOption.findUnique({
    where: { id },
    select: { label: true, category: true },
  });
  if (!existing) throw new Error("Equipment category not found");
  if (existing.category !== "equipment_category") {
    throw new Error("Not an equipment category");
  }

  const labelChanged = existing.label !== label;

  await prisma.$transaction(async (tx) => {
    await tx.customOption.update({
      where: { id },
      data: { label, color: color || null, models },
    });

    if (labelChanged) {
      // Equipment.category is stored by label, not FK — rewrite to keep rows in sync.
      await tx.equipment.updateMany({
        where: { category: existing.label },
        data: { category: label },
      });
    }
  });

  revalidatePath("/equipment");
}

export async function deleteEquipmentCategory(id: string) {
  await requirePermission(PermissionResource.EQUIPMENT, "DELETE");
  const option = await prisma.customOption.findUnique({
    where: { id },
    select: { isSystem: true, category: true },
  });
  if (option?.isSystem) throw new Error("Cannot delete a system option.");
  if (option?.category !== "equipment_category") throw new Error("Not an equipment category");

  await prisma.customOption.delete({ where: { id } });

  revalidatePath("/equipment");
}

export async function reorderEquipmentCategories(orderedIds: string[]) {
  await requirePermission(PermissionResource.EQUIPMENT, "WRITE");
  await Promise.all(
    orderedIds.map((id, index) =>
      prisma.customOption.update({
        where: { id },
        data: { sortOrder: index },
      })
    )
  );

  revalidatePath("/equipment");
}
