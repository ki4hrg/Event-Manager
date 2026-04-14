"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export type OptionCategory = "function_type" | "contact_role" | "schedule_type" | "presenter_role" | "presentation_type" | "service_style" | "equipment_category" | "setup_type" | "vendor_contact_type" | "file_type";

export async function getOptions(category: OptionCategory) {
  return prisma.customOption.findMany({
    where: { category },
    orderBy: { sortOrder: "asc" },
  });
}

export async function getAllOptions() {
  const options = await prisma.customOption.findMany({
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  });

  return {
    function_type: options.filter((o) => o.category === "function_type"),
    contact_role: options.filter((o) => o.category === "contact_role"),
    schedule_type: options.filter((o) => o.category === "schedule_type"),
    presenter_role: options.filter((o) => o.category === "presenter_role"),
    presentation_type: options.filter((o) => o.category === "presentation_type"),
    service_style: options.filter((o) => o.category === "service_style"),
    equipment_category: options.filter((o) => o.category === "equipment_category"),
    setup_type: options.filter((o) => o.category === "setup_type"),
    vendor_contact_type: options.filter((o) => o.category === "vendor_contact_type"),
    file_type: options.filter((o) => o.category === "file_type"),
  };
}

export async function createOption(category: OptionCategory, formData: FormData) {
  await requireAdmin();
  const label = formData.get("label") as string;
  const value = formData.get("value") as string;
  const color = formData.get("color") as string;

  // Get max sortOrder for this category
  const maxOrder = await prisma.customOption.findFirst({
    where: { category },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.customOption.create({
    data: {
      category,
      value: value || label.toUpperCase().replace(/[^A-Z0-9]/g, "_"),
      label,
      color: color || null,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath("/settings");
}

export async function updateOption(id: string, formData: FormData) {
  await requireAdmin();
  const label = formData.get("label") as string;
  const value = formData.get("value") as string;
  const color = formData.get("color") as string;

  await prisma.customOption.update({
    where: { id },
    data: {
      label,
      value,
      color: color || null,
    },
  });

  revalidatePath("/settings");
}

export async function deleteOption(id: string) {
  await requireAdmin();
  const option = await prisma.customOption.findUnique({ where: { id }, select: { isSystem: true } });
  if (option?.isSystem) throw new Error("Cannot delete a system option.");
  await prisma.customOption.delete({ where: { id } });
  revalidatePath("/settings");
}

// Equipment catalog actions
export async function getEquipment() {
  return prisma.equipment.findMany({
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
  });
}

export async function createEquipment(formData: FormData) {
  await requireAdmin();
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

  revalidatePath("/settings");
}

export async function updateEquipment(id: string, formData: FormData) {
  await requireAdmin();
  await prisma.equipment.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
      category: formData.get("category") as string,
    },
  });
  revalidatePath("/settings");
}

export async function deleteEquipment(id: string) {
  await requireAdmin();
  await prisma.equipment.delete({ where: { id } });
  revalidatePath("/settings");
}

export async function reorderOptions(category: OptionCategory, orderedIds: string[]) {
  await requireAdmin();
  // Update sortOrder for each option
  await Promise.all(
    orderedIds.map((id, index) =>
      prisma.customOption.update({
        where: { id },
        data: { sortOrder: index },
      })
    )
  );

  revalidatePath("/settings");
}
