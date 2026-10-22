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
import type { Prisma } from "@prisma/client";
import { mergeHotelLabel, offListHotelLabels, type HotelLabelCategory } from "@/lib/hotelLabels";
import { duplicateLabelError } from "./optionLabels";

export type OptionCategory = "function_type" | "contact_role" | "schedule_type" | "presenter_role" | "presentation_type" | "service_style" | "equipment_category" | "setup_type" | "vendor_contact_type" | "file_type" | "delivery_method" | "media_type" | "substatus" | "print_distribution" | "location_type" | "event_type" | "event_scope" | "event_frequency" | "meal_type" | "booth_type" | "reservation_method" | "per_facility_type" | "per_housing_provider" | "per_av_setup" | "proposal_status" | "hotel_room_type" | "hotel_guest_type" | "hotel_amenity" | "hotel_brand" | "hotel_region" | "hotel_area" | "rfp_concession" | "rfp_service" | "rfp_term";

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

// Lists whose options can be merged into one another (every use moves over).
const MERGEABLE: readonly OptionCategory[] = ["hotel_amenity", "rfp_concession", "rfp_term"] satisfies HotelLabelCategory[];
const isMergeable = (category: OptionCategory): category is HotelLabelCategory => MERGEABLE.includes(category);

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
      await tx.rfpSpaceRequest.updateMany({ where: { kind: "MEETING", functionType: oldLabel, rfp: inTenant }, data: { functionType: newLabel } });
      break;
    case "schedule_type":
      await tx.functionSchedule.updateMany({
        where: { type: oldLabel, function: inTenant },
        data: { type: newLabel },
      });
      break;
    case "setup_type":
      await tx.setupOrder.updateMany({ where: { setupType: oldLabel, ...inTenant }, data: { setupType: newLabel } });
      await tx.rfpSpaceRequest.updateMany({ where: { setup: oldLabel, rfp: inTenant }, data: { setup: newLabel } });
      await tx.function.updateMany({ where: { defaultSetup: oldLabel, ...inTenant }, data: { defaultSetup: newLabel } });
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
            { hotelProposal: inTenant },
            { rfp: inTenant },
            { vendorQuote: inTenant },
            { inboundEmail: { tenantId } },
            { formSubmission: { tenantId } },
            { contact: { tenantId } },
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
        tx.supplyOrder.updateMany({ where: { substatus: oldLabel, ...inTenant }, data: { substatus: newLabel } }),
        tx.formSubmission.updateMany({ where: { substatus: oldLabel, tenantId }, data: { substatus: newLabel } }),
        tx.eventStatusDefault.updateMany({ where: { substatus: oldLabel, ...inTenant }, data: { substatus: newLabel } }),
        tx.workflowTemplate.updateMany({ where: { pendingSubstatusValue: oldLabel, tenantId }, data: { pendingSubstatusValue: newLabel } }),
        tx.workflowTemplate.updateMany({ where: { completionSubstatusValue: oldLabel, tenantId }, data: { completionSubstatusValue: newLabel } }),
        tx.workflowStep.updateMany({ where: { pendingSubstatusValue: oldLabel, template: { tenantId } }, data: { pendingSubstatusValue: newLabel } }),
      ]);
      break;
    case "contact_role":
      // Contact.roles is String[]; Prisma can't array_replace, so drop to raw SQL.
      await tx.$executeRaw`UPDATE "Contact" SET roles = array_replace(roles, ${oldLabel}, ${newLabel}) WHERE "tenantId" = ${tenantId} AND ${oldLabel} = ANY(roles)`;
      break;
    case "event_type":
      await tx.eventSpecification.updateMany({ where: { eventType: oldLabel, ...inTenant }, data: { eventType: newLabel } });
      break;
    case "event_scope":
      await tx.eventSpecification.updateMany({ where: { eventScope: oldLabel, ...inTenant }, data: { eventScope: newLabel } });
      break;
    case "event_frequency":
      await tx.eventSpecification.updateMany({
        where: { eventFrequency: oldLabel, ...inTenant },
        data: { eventFrequency: newLabel },
      });
      break;
    case "reservation_method":
      await tx.rfp.updateMany({ where: { reservationMethod: oldLabel, ...inTenant }, data: { reservationMethod: newLabel } });
      await tx.eventSpecification.updateMany({
        where: { reservationMethod: oldLabel, ...inTenant },
        data: { reservationMethod: newLabel },
      });
      await tx.hotelBlock.updateMany({
        where: { reservationMethod: oldLabel, proposal: inTenant },
        data: { reservationMethod: newLabel },
      });
      break;
    case "meal_type":
      await tx.cateringOrder.updateMany({ where: { mealType: oldLabel, ...inTenant }, data: { mealType: newLabel } });
      await tx.rfpSpaceRequest.updateMany({ where: { kind: "FB", functionType: oldLabel, rfp: inTenant }, data: { functionType: newLabel } });
      break;
    case "booth_type":
      await tx.exhibitBooth.updateMany({ where: { boothType: oldLabel, ...inTenant }, data: { boothType: newLabel } });
      await tx.exhibitBoothGroup.updateMany({ where: { boothType: oldLabel, ...inTenant }, data: { boothType: newLabel } });
      break;
    case "per_facility_type":
      await tx.eventPostEvent.updateMany({
        where: { primaryFacilityType: oldLabel, ...inTenant },
        data: { primaryFacilityType: newLabel },
      });
      break;
    case "per_housing_provider":
      await tx.eventPostEvent.updateMany({
        where: { housingPerformedBy: oldLabel, ...inTenant },
        data: { housingPerformedBy: newLabel },
      });
      break;
    case "per_av_setup":
      await tx.eventPostEvent.updateMany({
        where: { largestFunctionAvSetup: oldLabel, ...inTenant },
        data: { largestFunctionAvSetup: newLabel },
      });
      break;
    case "proposal_status":
      await tx.hotelProposal.updateMany({ where: { status: oldLabel, ...inTenant }, data: { status: newLabel } });
      break;
    case "hotel_room_type": {
      const inTenantBlock = { proposal: inTenant };
      await tx.hotelProposalNight.updateMany({ where: { roomType: oldLabel, proposal: inTenant }, data: { roomType: newLabel } });
      await tx.hotelBlockNight.updateMany({ where: { roomType: oldLabel, block: inTenantBlock }, data: { roomType: newLabel } });
      await tx.hotelPickupGuest.updateMany({ where: { roomType: oldLabel, block: inTenantBlock }, data: { roomType: newLabel } });
      await tx.hotelPickupCount.updateMany({ where: { roomType: oldLabel, block: inTenantBlock }, data: { roomType: newLabel } });
      await tx.rfpHotelBlockNight.updateMany({ where: { roomType: oldLabel, block: { rfp: inTenant } }, data: { roomType: newLabel } });
      break;
    }
    case "hotel_guest_type":
      await tx.hotelProposal.updateMany({ where: { guestType: oldLabel, ...inTenant }, data: { guestType: newLabel } });
      await tx.rfpHotelBlock.updateMany({ where: { guestType: oldLabel, rfp: inTenant }, data: { guestType: newLabel } });
      break;
    case "hotel_amenity":
      await mergeHotelLabel(tx, tenantId, category, oldLabel, newLabel);
      break;
    case "hotel_brand":
      await tx.venue.updateMany({ where: { brand: oldLabel, tenantId }, data: { brand: newLabel } });
      break;
    case "hotel_area":
      await tx.venue.updateMany({ where: { area: oldLabel, tenantId }, data: { area: newLabel } });
      await tx.$executeRaw`UPDATE "Event" SET "areas" = array_replace("areas", ${oldLabel}, ${newLabel}) WHERE "tenantId" = ${tenantId} AND ${oldLabel} = ANY("areas")`;
      await tx.$executeRaw`
        UPDATE "Rfp" r SET "areas" = array_replace(r."areas", ${oldLabel}, ${newLabel})
        FROM "Event" e
        WHERE e."id" = r."eventId" AND e."tenantId" = ${tenantId} AND ${oldLabel} = ANY(r."areas")`;
      break;
    case "rfp_concession":
    case "rfp_term":
      await mergeHotelLabel(tx, tenantId, category, oldLabel, newLabel);
      break;
    case "rfp_service":
      await tx.rfp.updateMany({ where: { service: oldLabel, ...inTenant }, data: { service: newLabel } });
      break;
    case "hotel_region":
      // An area's group is its region label.
      await tx.customOption.updateMany({
        where: { category: "hotel_area", group: oldLabel, tenantId },
        data: { group: newLabel },
      });
      await tx.$executeRaw`UPDATE "Event" SET "regions" = array_replace("regions", ${oldLabel}, ${newLabel}) WHERE "tenantId" = ${tenantId} AND ${oldLabel} = ANY("regions")`;
      await tx.$executeRaw`
        UPDATE "Rfp" r SET "regions" = array_replace(r."regions", ${oldLabel}, ${newLabel})
        FROM "Event" e
        WHERE e."id" = r."eventId" AND e."tenantId" = ${tenantId} AND ${oldLabel} = ANY(r."regions")`;
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
    await mergeHotelLabel(tx, tenantId, category, from.label, into.label);
    await tx.customOption.delete({ where: { id, tenantId } });
  });
  revalidatePath("/settings");
}

// Labels in use that aren't on a mergeable list, for mapping onto it.
export async function getOffListLabels(category: OptionCategory) {
  const { tenantId } = await requirePermission(PermissionResource.SETTINGS, "VIEW");
  if (!isMergeable(category)) return [];
  return offListHotelLabels(tenantId, category);
}

// Moves every use of an off-list label onto a listed option.
export async function mapOffListLabel(category: OptionCategory, label: string, intoId: string) {
  const { tenantId } = await requirePermission(PermissionResource.SETTINGS, "WRITE");
  if (!isMergeable(category)) throw new Error("This list has no off-list labels");
  const into = await prisma.customOption.findFirst({ where: { id: intoId, tenantId, category }, select: { label: true } });
  if (!into) throw new Error("Option not found");
  await prisma.$transaction((tx) => mergeHotelLabel(tx, tenantId, category, label, into.label));
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
