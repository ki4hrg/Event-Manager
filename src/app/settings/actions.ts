"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { getActiveTenantId, requireActiveTenantId } from "@/lib/tenant";
import { getOptionsForTenant } from "@/lib/options";
import { revalidatePath } from "next/cache";
import { PermissionResource } from "@prisma/client";
import type { Prisma } from "@prisma/client";

export type OptionCategory = "function_type" | "contact_role" | "schedule_type" | "presenter_role" | "presentation_type" | "service_style" | "equipment_category" | "setup_type" | "vendor_contact_type" | "file_type" | "delivery_method" | "media_type" | "substatus" | "print_distribution" | "location_type";

// The active tenant's options. Auth-free by design (any signed-in user may read
// dropdown labels); with no session there is no tenant, so it returns nothing.
// The unauthenticated share routes know their tenant only through the event —
// they use getOptionsForTenant from @/lib/options instead.
export async function getOptions(category: OptionCategory) {
  const tenantId = await getActiveTenantId();
  if (!tenantId) return [];
  return getOptionsForTenant(tenantId, category);
}

export async function getAllOptions() {
  await requireAuth();
  const tenantId = await requireActiveTenantId();
  const options = await prisma.customOption.findMany({
    where: { tenantId },
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
  const { tenantId } = await requirePermission(PermissionResource.SETTINGS, "WRITE");
  const label = formData.get("label") as string;
  const color = formData.get("color") as string;
  const group = formData.get("group") as string | null;
  const models = formData.getAll("models") as string[];

  const maxOrder = await prisma.customOption.findFirst({
    where: { tenantId, category },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.customOption.create({
    data: {
      tenantId,
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
  const { tenantId } = await requirePermission(PermissionResource.SETTINGS, "WRITE");
  const label = formData.get("label") as string;
  const color = formData.get("color") as string;
  const group = formData.get("group") as string | null;
  const models = formData.getAll("models") as string[];

  const existing = await prisma.customOption.findFirst({
    where: { id, tenantId },
    select: { label: true, category: true },
  });
  if (!existing) throw new Error("Option not found");

  const labelChanged = existing.label !== label;

  await prisma.$transaction(async (tx) => {
    await tx.customOption.update({
      where: { id, tenantId },
      data: {
        label,
        color: color || null,
        group: group || null,
        models,
      },
    });

    if (labelChanged) {
      await propagateLabelRename(tx, tenantId, existing.category as OptionCategory, existing.label, label);
    }
  });

  revalidatePath("/settings");
}

// When a CustomOption label is renamed, rewrite the old label string on every
// row that stores it. References are by label, not FK, so without this the
// dropdown value on existing records goes stale. Every rewrite is scoped to the
// tenant: labels are only unique per tenant, so an unscoped update would rename
// another tenant's rows that happen to share the string.
async function propagateLabelRename(
  tx: Prisma.TransactionClient,
  tenantId: string,
  category: OptionCategory,
  oldLabel: string,
  newLabel: string
) {
  const inTenant = { event: { tenantId } } as const;
  switch (category) {
    case "function_type":
      await tx.function.updateMany({ where: { type: oldLabel, ...inTenant }, data: { type: newLabel } });
      break;
    case "schedule_type":
      await tx.functionSchedule.updateMany({
        where: { type: oldLabel, function: inTenant },
        data: { type: newLabel },
      });
      break;
    case "setup_type":
      await tx.setupOrder.updateMany({ where: { setupType: oldLabel, ...inTenant }, data: { setupType: newLabel } });
      break;
    case "presentation_type":
      await tx.presentation.updateMany({ where: { type: oldLabel, ...inTenant }, data: { type: newLabel } });
      break;
    case "presenter_role":
      await tx.presentationContact.updateMany({
        where: { role: oldLabel, presentation: inTenant },
        data: { role: newLabel },
      });
      break;
    case "service_style":
      await tx.cateringOrder.updateMany({
        where: { serviceStyle: oldLabel, ...inTenant },
        data: { serviceStyle: newLabel },
      });
      break;
    case "equipment_category":
      await tx.equipment.updateMany({ where: { category: oldLabel, tenantId }, data: { category: newLabel } });
      break;
    case "location_type":
      await tx.storageLocation.updateMany({ where: { type: oldLabel, tenantId }, data: { type: newLabel } });
      break;
    case "vendor_contact_type":
      await tx.vendorContact.updateMany({
        where: { contactType: oldLabel, vendor: { tenantId } },
        data: { contactType: newLabel },
      });
      break;
    case "file_type":
      // A file hangs off exactly one parent; any of them places it in a tenant.
      await tx.fileUpload.updateMany({
        where: {
          fileType: oldLabel,
          OR: [
            { event: { tenantId } },
            { venue: { tenantId } },
            { cateringOrder: inTenant },
            { avOrder: inTenant },
            { setupOrder: inTenant },
            { printOrder: inTenant },
            { supplyOrder: inTenant },
            { mediaDeliverable: inTenant },
          ],
        },
        data: { fileType: newLabel },
      });
      break;
    case "delivery_method":
      await tx.mediaDeliverable.updateMany({
        where: { delivery: oldLabel, ...inTenant },
        data: { delivery: newLabel },
      });
      break;
    case "media_type":
      await tx.mediaDeliverable.updateMany({
        where: { mediaType: oldLabel, ...inTenant },
        data: { mediaType: newLabel },
      });
      break;
    case "print_distribution":
      await tx.printItem.updateMany({
        where: { distributionMethod: oldLabel, printOrder: inTenant },
        data: { distributionMethod: newLabel },
      });
      break;
    case "substatus":
      await Promise.all([
        tx.function.updateMany({ where: { substatus: oldLabel, ...inTenant }, data: { substatus: newLabel } }),
        tx.presentation.updateMany({ where: { substatus: oldLabel, ...inTenant }, data: { substatus: newLabel } }),
        tx.aVOrder.updateMany({ where: { substatus: oldLabel, ...inTenant }, data: { substatus: newLabel } }),
        tx.cateringOrder.updateMany({ where: { substatus: oldLabel, ...inTenant }, data: { substatus: newLabel } }),
        tx.setupOrder.updateMany({ where: { substatus: oldLabel, ...inTenant }, data: { substatus: newLabel } }),
        tx.printOrder.updateMany({ where: { substatus: oldLabel, ...inTenant }, data: { substatus: newLabel } }),
        tx.mediaDeliverable.updateMany({ where: { substatus: oldLabel, ...inTenant }, data: { substatus: newLabel } }),
        tx.eventStatusDefault.updateMany({ where: { substatus: oldLabel, ...inTenant }, data: { substatus: newLabel } }),
      ]);
      break;
    case "contact_role":
      // Contact.roles is String[]; Prisma can't array_replace, so drop to raw SQL.
      await tx.$executeRaw`UPDATE "Contact" SET roles = array_replace(roles, ${oldLabel}, ${newLabel}) WHERE "tenantId" = ${tenantId} AND ${oldLabel} = ANY(roles)`;
      break;
    default: {
      const _exhaustive: never = category;
      throw new Error(`Unhandled option category: ${_exhaustive}`);
    }
  }
}

export async function getSubstatusOptions(group?: string) {
  await requireAuth();
  const tenantId = await requireActiveTenantId();
  return prisma.customOption.findMany({
    where: { tenantId, category: "substatus", ...(group ? { group } : {}) },
    orderBy: { sortOrder: "asc" },
  });
}

export async function deleteOption(id: string) {
  const { tenantId } = await requirePermission(PermissionResource.SETTINGS, "DELETE");
  const option = await prisma.customOption.findFirst({
    where: { id, tenantId },
    select: { isSystem: true, category: true, label: true },
  });
  if (!option) throw new Error("Option not found");
  if (option.isSystem) throw new Error("Cannot delete a system option.");

  await prisma.$transaction(async (tx) => {
    if (option.category === "substatus" && option.label) {
      await tx.eventStatusDefault.updateMany({
        where: { substatus: option.label, event: { tenantId } },
        data: { substatus: null },
      });
    }
    await tx.customOption.delete({ where: { id, tenantId } });
  });

  revalidatePath("/settings");
}

export async function reorderOptions(category: OptionCategory, orderedIds: string[]) {
  const { tenantId } = await requirePermission(PermissionResource.SETTINGS, "WRITE");
  // Update sortOrder for each option
  await Promise.all(
    orderedIds.map((id, index) =>
      prisma.customOption.update({
        where: { id, tenantId },
        data: { sortOrder: index },
      })
    )
  );

  revalidatePath("/settings");
}
