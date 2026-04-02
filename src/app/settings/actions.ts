"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export type OptionCategory = "function_type" | "contact_role" | "av_equipment" | "schedule_type" | "presenter_role";

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
    av_equipment: options.filter((o) => o.category === "av_equipment"),
    schedule_type: options.filter((o) => o.category === "schedule_type"),
    presenter_role: options.filter((o) => o.category === "presenter_role"),
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
  await prisma.customOption.delete({ where: { id } });
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
