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
  OPTION_SECTIONS,
  clearDeletedLabel,
  groupChoices,
  isMergeable,
  optionCategory,
  optionLabelUses,
  propagateLabelRename,
  type OptionCategory,
} from "@/lib/optionCategories";
import { duplicateLabelError, inUseError } from "./optionLabels";

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

export async function getSubstatusOptions(group?: string) {
  await requireAuth();
  const tenantId = await requireActiveTenantId();
  return prisma.customOption.findMany({
    where: { tenantId, category: "substatus", ...(group ? { group } : {}) },
    orderBy: { sortOrder: "asc" },
  });
}

// ── Option lists ─────────────────────────────────────────────────────────────
// Every action takes the category, checks it against the registry
// (src/lib/optionCategories.ts) and gates on that list's resource, so the
// equipment and storage screens share these under their own permission.

const revalidateList = (category: OptionCategory) => revalidatePath(OPTION_SECTIONS[optionCategory(category).section].href);

// One spelling per list: a label matching another option but for case or
// spacing is refused (labelKey).
async function assertUniqueLabel(tenantId: string, category: OptionCategory, label: string, exceptId?: string) {
  const options = await prisma.customOption.findMany({ where: { tenantId, category }, select: { id: true, label: true } });
  const error = duplicateLabelError(label, options, isMergeable(category), exceptId);
  if (error) throw new Error(error);
}

// The posted group, checked against the list's group source; undefined when
// the list has no groups or the form rendered no group control.
async function readGroup(tenantId: string, category: OptionCategory, formData: FormData): Promise<string | null | undefined> {
  if (!formData.has("group")) return undefined;
  const choices = await groupChoices(prisma, tenantId, category);
  if (!choices) return undefined;
  const group = (formData.get("group") as string) || null;
  if (group && !choices.some((c) => c.value === group)) throw new Error("Unknown group");
  return group;
}

export async function createOption(category: OptionCategory, formData: FormData) {
  const def = optionCategory(category);
  const { tenantId } = await requirePermission(def.resource, "WRITE");
  const label = ((formData.get("label") as string) ?? "").trim();
  if (!label) throw new Error("Label is required");
  await assertUniqueLabel(tenantId, category, label);
  const group = await readGroup(tenantId, category, formData);
  if (def.groups?.kind === "fixed" && def.groups.split && !group) throw new Error("Pick a group");

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
      color: def.color ? (formData.get("color") as string) || null : null,
      group: group ?? null,
      models: def.models ? (formData.getAll("models") as string[]) : [],
      sortOrder: (maxOrder?.sortOrder ?? -1) + 1,
    },
  });

  revalidateList(category);
}

export async function updateOption(category: OptionCategory, id: string, formData: FormData) {
  const def = optionCategory(category);
  const { tenantId } = await requirePermission(def.resource, "WRITE");
  const label = ((formData.get("label") as string) ?? "").trim();
  if (!label) throw new Error("Label is required");

  const existing = await prisma.customOption.findFirst({
    where: { id, tenantId, category },
    select: { label: true },
  });
  if (!existing) throw new Error("Option not found");
  await assertUniqueLabel(tenantId, category, label, id);
  // Only forms that render a group control post it; an edit from a list
  // without one keeps the stored group (substatus status, APEX keys).
  const group = await readGroup(tenantId, category, formData);

  await prisma.$transaction(async (tx) => {
    await tx.customOption.update({
      where: { id, tenantId },
      data: {
        label,
        ...(def.color ? { color: (formData.get("color") as string) || null } : {}),
        ...(group !== undefined ? { group } : {}),
        ...(def.models ? { models: formData.getAll("models") as string[] } : {}),
      },
    });
    await propagateLabelRename(tx, tenantId, category, existing.label, label);
  });

  revalidateList(category);
}

// An option still in use can't be deleted: its records would drop out of
// every filtered view. Mergeable lists merge it away instead.
export async function deleteOption(category: OptionCategory, id: string) {
  const def = optionCategory(category);
  const { tenantId } = await requirePermission(def.resource, "DELETE");
  const option = await prisma.customOption.findFirst({
    where: { id, tenantId, category },
    select: { isSystem: true, label: true },
  });
  if (!option) throw new Error("Option not found");
  if (option.isSystem) throw new Error("Cannot delete a system option.");
  const uses = (await optionLabelUses(prisma, tenantId, category)).get(option.label) ?? 0;
  if (uses > 0) throw new Error(inUseError(option.label, uses));

  await prisma.$transaction(async (tx) => {
    await clearDeletedLabel(tx, tenantId, category, option.label);
    await tx.customOption.delete({ where: { id, tenantId } });
  });

  revalidateList(category);
}

// Folds one option into another: every use of its label moves to the other's,
// then it's deleted.
export async function mergeOption(category: OptionCategory, id: string, intoId: string) {
  const def = optionCategory(category);
  const { tenantId } = await requirePermission(def.resource, "DELETE");
  if (!isMergeable(category)) throw new Error("These options can't be merged");
  const [from, into] = await Promise.all([
    prisma.customOption.findFirst({ where: { id, tenantId, category }, select: { label: true, isSystem: true } }),
    prisma.customOption.findFirst({ where: { id: intoId, tenantId, category }, select: { label: true } }),
  ]);
  if (!from || !into || id === intoId) throw new Error("Option not found");
  if (from.isSystem) throw new Error("Cannot merge away a system option.");
  await prisma.$transaction(async (tx) => {
    await propagateLabelRename(tx, tenantId, category, from.label, into.label);
    await tx.customOption.delete({ where: { id, tenantId } });
  });
  revalidateList(category);
}

// Moves every use of an off-list label onto a listed option.
export async function mapOffListLabel(category: OptionCategory, label: string, intoId: string) {
  const def = optionCategory(category);
  const { tenantId } = await requirePermission(def.resource, "WRITE");
  if (!isMergeable(category)) throw new Error("This list has no off-list labels");
  const into = await prisma.customOption.findFirst({ where: { id: intoId, tenantId, category }, select: { label: true } });
  if (!into) throw new Error("Option not found");
  await prisma.$transaction((tx) => propagateLabelRename(tx, tenantId, category, label, into.label));
  revalidateList(category);
}

// Reorders one list. Ids from another list or tenant are ignored.
export async function reorderOptions(category: OptionCategory, orderedIds: string[]) {
  const def = optionCategory(category);
  const { tenantId } = await requirePermission(def.resource, "WRITE");
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.customOption.updateMany({
        where: { id, tenantId, category },
        data: { sortOrder: index },
      }),
    ),
  );
  revalidateList(category);
}
