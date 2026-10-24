"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { getActiveTenantId, requireActiveTenantId } from "@/lib/tenant";
import { getOptionsForTenant } from "@/lib/options";
import { orgProfileFromForm, orgProfileSelect } from "@/lib/orgProfile";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PermissionResource } from "@prisma/client";
import {
  clearDeletedLabel,
  isMergeable,
  offListLabels,
  propagateLabelRename,
  type OptionCategory,
} from "@/lib/optionCategories";
import { duplicateLabelError } from "./optionLabels";

// The active tenant's options. Auth-free by design (any signed-in user may read
// dropdown labels); with no session there is no tenant, so it returns nothing.
// The unauthenticated share routes know their tenant only through the event —
// they use getOptionsForTenant from @/lib/options instead.
export async function getOptions(category: OptionCategory) {
  const tenantId = await getActiveTenantId();
  if (!tenantId) return [];
  return getOptionsForTenant(tenantId, category);
}

// The active tenant's organization profile. Name and slug stay super-admin
// territory (/tenants); members with Settings write edit the contact details.
export async function getOrganizationProfile() {
  const { tenantId } = await requirePermission(PermissionResource.SETTINGS, "VIEW");
  return prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, updatedAt: true, ...orgProfileSelect },
  });
}

export async function updateOrganizationProfile(formData: FormData) {
  const { tenantId } = await requirePermission(PermissionResource.SETTINGS, "WRITE");
  await prisma.tenant.update({ where: { id: tenantId }, data: orgProfileFromForm(formData) });
  revalidatePath("/settings/organization");
  redirect("/settings/organization?success=Organization+updated");
}

// One spelling per list: a label matching another option but for case or
// spacing is refused (labelKey).
async function assertUniqueLabel(tenantId: string, category: OptionCategory, label: string, exceptId?: string) {
  const options = await prisma.customOption.findMany({ where: { tenantId, category }, select: { id: true, label: true } });
  const error = duplicateLabelError(label, options, isMergeable(category), exceptId);
  if (error) throw new Error(error);
}

export async function createOption(category: OptionCategory, formData: FormData) {
  const { tenantId } = await requirePermission(PermissionResource.SETTINGS, "WRITE");
  const label = (formData.get("label") as string).trim();
  await assertUniqueLabel(tenantId, category, label);
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
  const label = (formData.get("label") as string).trim();
  const color = formData.get("color") as string;
  const group = formData.get("group") as string | null;
  const models = formData.getAll("models") as string[];

  const existing = await prisma.customOption.findFirst({
    where: { id, tenantId },
    select: { label: true, category: true },
  });
  if (!existing) throw new Error("Option not found");
  await assertUniqueLabel(tenantId, existing.category as OptionCategory, label, id);

  const labelChanged = existing.label !== label;

  await prisma.$transaction(async (tx) => {
    await tx.customOption.update({
      where: { id, tenantId },
      data: {
        label,
        color: color || null,
        // Only forms that render a group control post it; an edit from a list
        // without one must keep the stored group (substatus status, APEX keys).
        ...(formData.has("group") ? { group: group || null } : {}),
        models,
      },
    });

    if (labelChanged) {
      await propagateLabelRename(tx, tenantId, existing.category as OptionCategory, existing.label, label);
    }
  });

  revalidatePath("/settings");
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
    await clearDeletedLabel(tx, tenantId, option.category as OptionCategory, option.label);
    await tx.customOption.delete({ where: { id, tenantId } });
  });

  revalidatePath("/settings");
}

// Folds one option into another: every use of its label moves to the other's,
// then it's deleted.
export async function mergeOption(id: string, intoId: string) {
  const { tenantId } = await requirePermission(PermissionResource.SETTINGS, "DELETE");
  const [from, into] = await Promise.all([
    prisma.customOption.findFirst({ where: { id, tenantId }, select: { category: true, label: true, isSystem: true } }),
    prisma.customOption.findFirst({ where: { id: intoId, tenantId }, select: { category: true, label: true } }),
  ]);
  if (!from || !into || id === intoId) throw new Error("Option not found");
  const category = from.category as OptionCategory;
  if (into.category !== category || !isMergeable(category)) throw new Error("These options can't be merged");
  if (from.isSystem) throw new Error("Cannot merge away a system option.");
  await prisma.$transaction(async (tx) => {
    await propagateLabelRename(tx, tenantId, category, from.label, into.label);
    await tx.customOption.delete({ where: { id, tenantId } });
  });
  revalidatePath("/settings");
}

// Labels in use that aren't on a mergeable list, for mapping onto it.
export async function getOffListLabels(category: OptionCategory) {
  const { tenantId } = await requirePermission(PermissionResource.SETTINGS, "VIEW");
  if (!isMergeable(category)) return [];
  return offListLabels(prisma, tenantId, category);
}

// Moves every use of an off-list label onto a listed option.
export async function mapOffListLabel(category: OptionCategory, label: string, intoId: string) {
  const { tenantId } = await requirePermission(PermissionResource.SETTINGS, "WRITE");
  if (!isMergeable(category)) throw new Error("This list has no off-list labels");
  const into = await prisma.customOption.findFirst({ where: { id: intoId, tenantId, category }, select: { label: true } });
  if (!into) throw new Error("Option not found");
  await prisma.$transaction((tx) => propagateLabelRename(tx, tenantId, category, label, into.label));
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
