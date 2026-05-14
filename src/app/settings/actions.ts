"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

export type OptionCategory = "function_type" | "contact_role" | "schedule_type" | "presenter_role" | "presentation_type" | "service_style" | "equipment_category" | "setup_type" | "vendor_contact_type" | "file_type" | "delivery_method" | "substatus" | "print_distribution";

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
  const color = formData.get("color") as string;
  const group = formData.get("group") as string | null;
  const models = formData.getAll("models") as string[];

  const maxOrder = await prisma.customOption.findFirst({
    where: { category },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.customOption.create({
    data: {
      category,
      label,
      color: color || null,
      group: group || null,
      models,
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath("/settings");
}

export async function updateOption(id: string, formData: FormData) {
  await requireAdmin();
  const label = formData.get("label") as string;
  const color = formData.get("color") as string;
  const group = formData.get("group") as string | null;
  const models = formData.getAll("models") as string[];

  const existing = await prisma.customOption.findUnique({
    where: { id },
    select: { label: true, category: true },
  });
  if (!existing) throw new Error("Option not found");

  const labelChanged = existing.label !== label;

  await prisma.$transaction(async (tx) => {
    await tx.customOption.update({
      where: { id },
      data: {
        label,
        color: color || null,
        group: group || null,
        models,
      },
    });

    if (labelChanged) {
      await propagateLabelRename(tx, existing.category as OptionCategory, existing.label, label);
    }
  });

  revalidatePath("/settings");
}

// When a CustomOption label is renamed, rewrite the old label string on every
// row that stores it. References are by label, not FK, so without this the
// dropdown value on existing records goes stale.
async function propagateLabelRename(
  tx: Prisma.TransactionClient,
  category: OptionCategory,
  oldLabel: string,
  newLabel: string
) {
  switch (category) {
    case "function_type":
      await tx.function.updateMany({ where: { type: oldLabel }, data: { type: newLabel } });
      break;
    case "schedule_type":
      await tx.functionSchedule.updateMany({ where: { type: oldLabel }, data: { type: newLabel } });
      break;
    case "setup_type":
      await tx.setupOrder.updateMany({ where: { setupType: oldLabel }, data: { setupType: newLabel } });
      break;
    case "presentation_type":
      await tx.presentation.updateMany({ where: { type: oldLabel }, data: { type: newLabel } });
      break;
    case "presenter_role":
      await tx.presentationContact.updateMany({ where: { role: oldLabel }, data: { role: newLabel } });
      break;
    case "service_style":
      await tx.cateringOrder.updateMany({ where: { serviceStyle: oldLabel }, data: { serviceStyle: newLabel } });
      break;
    case "equipment_category":
      await tx.equipment.updateMany({ where: { category: oldLabel }, data: { category: newLabel } });
      break;
    case "vendor_contact_type":
      await tx.vendorContact.updateMany({ where: { contactType: oldLabel }, data: { contactType: newLabel } });
      break;
    case "file_type":
      await tx.fileUpload.updateMany({ where: { fileType: oldLabel }, data: { fileType: newLabel } });
      break;
    case "delivery_method":
      await tx.mediaItem.updateMany({ where: { delivery: oldLabel }, data: { delivery: newLabel } });
      break;
    case "print_distribution":
      await tx.printItem.updateMany({ where: { distributionMethod: oldLabel }, data: { distributionMethod: newLabel } });
      break;
    case "substatus":
      await Promise.all([
        tx.function.updateMany({ where: { substatus: oldLabel }, data: { substatus: newLabel } }),
        tx.presentation.updateMany({ where: { substatus: oldLabel }, data: { substatus: newLabel } }),
        tx.aVOrder.updateMany({ where: { substatus: oldLabel }, data: { substatus: newLabel } }),
        tx.cateringOrder.updateMany({ where: { substatus: oldLabel }, data: { substatus: newLabel } }),
        tx.setupOrder.updateMany({ where: { substatus: oldLabel }, data: { substatus: newLabel } }),
        tx.printOrder.updateMany({ where: { substatus: oldLabel }, data: { substatus: newLabel } }),
      ]);
      break;
    case "contact_role":
      // Contact.roles is String[]; Prisma can't array_replace, so drop to raw SQL.
      await tx.$executeRaw`UPDATE "Contact" SET roles = array_replace(roles, ${oldLabel}, ${newLabel}) WHERE ${oldLabel} = ANY(roles)`;
      break;
  }
}

export async function getSubstatusOptions(group?: string) {
  return prisma.customOption.findMany({
    where: { category: "substatus", ...(group ? { group } : {}) },
    orderBy: { sortOrder: "asc" },
  });
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
