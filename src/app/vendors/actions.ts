"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PermissionResource } from "@prisma/client";

export type ResponsiblePartyOptions = {
  vendors: { id: string; name: string }[];
  venueVendor: { id: string; name: string } | null;
  systemVendor: { id: string; name: string } | null;
};

export async function getResponsiblePartyVendors(eventId: string, modelType?: string): Promise<ResponsiblePartyOptions> {
  await requirePermission(PermissionResource.VENDORS, "VIEW");
  const modelFilter = modelType
    ? { OR: [{ models: { isEmpty: true } }, { models: { has: modelType } }] }
    : undefined;
  const [eventVendors, event, systemVendor] = await Promise.all([
    prisma.eventVendor.findMany({
      where: { eventId, ...(modelFilter ? { vendor: modelFilter } : {}) },
      select: { vendor: { select: { id: true, name: true } } },
    }),
    prisma.event.findUnique({ where: { id: eventId }, select: { venue: { select: { vendor: { select: { id: true, name: true } } } } } }),
    prisma.vendor.findFirst({ where: { isSystemVendor: true }, select: { id: true, name: true } }),
  ]);

  const venueVendor = event?.venue?.vendor ?? null;
  const excludeIds = new Set<string>();
  if (venueVendor) excludeIds.add(venueVendor.id);
  if (systemVendor) excludeIds.add(systemVendor.id);

  const vendors = eventVendors
    .map((ev) => ev.vendor)
    .filter((v) => !excludeIds.has(v.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { vendors, venueVendor, systemVendor: systemVendor ?? null };
}

export async function getVendors() {
  await requirePermission(PermissionResource.VENDORS, "VIEW");
  return prisma.vendor.findMany({
    where: { isSystemVendor: false, venueId: null },
    include: {
      _count: { select: { contacts: true } },
    },
    orderBy: { name: "asc" },
  });
}

export async function getVendor(id: string) {
  await requirePermission(PermissionResource.VENDORS, "VIEW");
  return prisma.vendor.findUnique({
    where: { id },
    include: {
      contacts: { include: { contact: true }, orderBy: [{ isPrimary: "desc" }, { id: "asc" }] },
    },
  });
}

export async function searchVendors(query: string) {
  await requirePermission(PermissionResource.VENDORS, "VIEW");
  return prisma.vendor.findMany({
    where: {
      name: { contains: query, mode: "insensitive" },
    },
    orderBy: { name: "asc" },
    take: 20,
  });
}

export async function createVendor(formData: FormData) {
  await requirePermission(PermissionResource.VENDORS, "WRITE");
  const name = (formData.get("name") as string).trim();
  const models = formData.getAll("models") as string[];
  const notes = (formData.get("notes") as string) || null;

  const vendor = await prisma.vendor.create({
    data: { name, models, notes },
  });

  revalidatePath("/vendors");
  redirect(`/vendors/${vendor.id}`);
}

export async function updateVendor(id: string, formData: FormData) {
  await requirePermission(PermissionResource.VENDORS, "WRITE");
  const name = (formData.get("name") as string).trim();
  const models = formData.getAll("models") as string[];
  const notes = (formData.get("notes") as string) || null;

  await prisma.vendor.update({
    where: { id },
    data: { name, models, notes },
  });

  revalidatePath(`/vendors/${id}`);
  revalidatePath("/vendors");
}

export async function deleteVendor(id: string) {
  await requirePermission(PermissionResource.VENDORS, "DELETE");
  await prisma.vendor.delete({ where: { id } });
  revalidatePath("/vendors");
  redirect("/vendors");
}

// Vendor contact management

export async function searchContactsForVendor(query: string) {
  await requirePermission(PermissionResource.VENDORS, "VIEW");
  return prisma.contact.findMany({
    where: {
      OR: [
        { firstName: { contains: query, mode: "insensitive" } },
        { lastName: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
        { organization: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 20,
  });
}

async function clearOtherPrimaries(vendorId: string, excludeId?: string) {
  await prisma.vendorContact.updateMany({
    where: { vendorId, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    data: { isPrimary: false },
  });
}

export async function createAndAddVendorContact(vendorId: string, formData: FormData) {
  await requirePermission(PermissionResource.VENDORS, "WRITE");
  const firstName = formData.get("firstName") as string;
  const lastName = formData.get("lastName") as string;
  const email = formData.get("email") as string;
  const organization = formData.get("organization") as string;
  const contactType = (formData.get("contactType") as string) || null;
  const isPrimary = formData.get("isPrimary") === "true";

  const contact = await prisma.contact.create({
    data: {
      firstName,
      lastName,
      email: email || null,
      organization: organization || null,
    },
  });

  if (isPrimary) await clearOtherPrimaries(vendorId);

  await prisma.vendorContact.create({
    data: { vendorId, contactId: contact.id, contactType, isPrimary },
  });

  revalidatePath(`/vendors/${vendorId}`);
}

export async function addVendorContact(vendorId: string, formData: FormData) {
  await requirePermission(PermissionResource.VENDORS, "WRITE");
  const contactId = formData.get("contactId") as string;
  const contactType = (formData.get("contactType") as string) || null;
  const isPrimary = formData.get("isPrimary") === "true";

  if (isPrimary) await clearOtherPrimaries(vendorId);

  await prisma.vendorContact.create({
    data: { vendorId, contactId, contactType, isPrimary },
  });

  revalidatePath(`/vendors/${vendorId}`);
}

export async function updateVendorContact(contactId: string, vendorId: string, formData: FormData) {
  await requirePermission(PermissionResource.VENDORS, "WRITE");
  const contactType = (formData.get("contactType") as string) || null;
  const isPrimary = formData.get("isPrimary") === "true";

  if (isPrimary) await clearOtherPrimaries(vendorId, contactId);

  await prisma.vendorContact.update({
    where: { id: contactId },
    data: { contactType, isPrimary },
  });

  revalidatePath(`/vendors/${vendorId}`);
}

export async function removeVendorContact(contactId: string, vendorId: string) {
  await requirePermission(PermissionResource.VENDORS, "DELETE");
  await prisma.vendorContact.delete({ where: { id: contactId } });
  revalidatePath(`/vendors/${vendorId}`);
}

// Event vendor management

export async function getEventVendors(eventId: string) {
  await requirePermission(PermissionResource.VENDORS, "VIEW");
  return prisma.eventVendor.findMany({
    where: { eventId },
    include: { vendor: true },
    orderBy: { vendor: { name: "asc" } },
  });
}

export async function searchVendorsForEvent(query: string, eventId: string) {
  await requirePermission(PermissionResource.VENDORS, "VIEW");
  // Returns vendors not already assigned to this event
  const assigned = await prisma.eventVendor.findMany({
    where: { eventId },
    select: { vendorId: true },
  });
  const assignedIds = assigned.map((a) => a.vendorId);

  return prisma.vendor.findMany({
    where: {
      name: { contains: query, mode: "insensitive" },
      id: { notIn: assignedIds },
    },
    orderBy: { name: "asc" },
    take: 20,
  });
}

export async function addVendorToEvent(eventId: string, vendorId: string) {
  await requirePermission(PermissionResource.VENDORS, "WRITE");
  await prisma.eventVendor.create({
    data: { eventId, vendorId },
  });

  revalidatePath(`/events/${eventId}/vendors`);
}

export async function removeVendorFromEvent(eventVendorId: string, eventId: string) {
  await requirePermission(PermissionResource.VENDORS, "DELETE");
  await prisma.eventVendor.delete({ where: { id: eventVendorId } });
  revalidatePath(`/events/${eventId}/vendors`);
}

// Valid defaultFor values. Add new model types here when wiring up vendor auto-assignment.
export type ModelType = "CATERING_ORDER" | "AV_ORDER" | "SETUP_ORDER" | "PRINT_ORDER" | "MEDIA_ORDER";

// Assigns a vendor as the default for a model type on this event.
// Transfers the designation away from any other vendor that held it.
export async function setDefaultVendor(eventVendorId: string, modelType: ModelType, eventId: string) {
  await requirePermission(PermissionResource.VENDORS, "WRITE");
  await prisma.$transaction([
    prisma.$executeRaw`UPDATE "EventVendor" SET "defaultFor" = array_remove("defaultFor", ${modelType}) WHERE "eventId" = ${eventId} AND id != ${eventVendorId}`,
    prisma.$executeRaw`UPDATE "EventVendor" SET "defaultFor" = array_append(array_remove("defaultFor", ${modelType}), ${modelType}) WHERE id = ${eventVendorId}`,
  ]);
  revalidatePath(`/events/${eventId}/vendors`);
}

export async function removeDefaultVendor(eventVendorId: string, modelType: ModelType, eventId: string) {
  await requirePermission(PermissionResource.VENDORS, "WRITE");
  await prisma.$executeRaw`UPDATE "EventVendor" SET "defaultFor" = array_remove("defaultFor", ${modelType}) WHERE id = ${eventVendorId}`;
  revalidatePath(`/events/${eventId}/vendors`);
}

export async function getDefaultVendorForModel(eventId: string, modelType: ModelType) {
  await requirePermission(PermissionResource.VENDORS, "VIEW");
  return prisma.eventVendor.findFirst({
    where: { eventId, defaultFor: { has: modelType } },
  });
}

// Entity vendor management helpers

export async function getEventVendorsForPicker(eventId: string) {
  await requirePermission(PermissionResource.VENDORS, "VIEW");
  return prisma.eventVendor.findMany({
    where: { eventId },
    include: { vendor: true },
    orderBy: { vendor: { name: "asc" } },
  });
}

// Search among vendors assigned to the event (for entity-level vendor pickers).
// When modelType is provided, only returns vendors with that model or no models (general-purpose).
// Also includes the venue vendor and system (event team) vendor when they match the query,
// since those are valid order vendors even when not registered via EventVendor.
export async function searchAssignedEventVendors(query: string, eventId: string, modelType?: ModelType) {
  await requirePermission(PermissionResource.VENDORS, "VIEW");
  const modelFilter = modelType
    ? { OR: [{ models: { isEmpty: true } }, { models: { has: modelType } }] }
    : undefined;
  const [rows, event, systemVendor] = await Promise.all([
    prisma.eventVendor.findMany({
      where: {
        eventId,
        vendor: { name: { contains: query, mode: "insensitive" }, ...modelFilter },
      },
      include: { vendor: true },
      orderBy: { vendor: { name: "asc" } },
      take: 20,
    }),
    prisma.event.findUnique({
      where: { id: eventId },
      select: { venue: { select: { vendor: true } } },
    }),
    prisma.vendor.findFirst({ where: { isSystemVendor: true } }),
  ]);

  const results = rows.map((r) => r.vendor);
  const seen = new Set(results.map((v) => v.id));
  const q = query.toLowerCase();
  const matchesQuery = (v: { name: string } | null | undefined) =>
    !!v && (q === "" || v.name.toLowerCase().includes(q));

  const venueVendor = event?.venue?.vendor;
  if (venueVendor && !seen.has(venueVendor.id) && matchesQuery(venueVendor)) {
    results.push(venueVendor);
    seen.add(venueVendor.id);
  }
  if (systemVendor && !seen.has(systemVendor.id) && matchesQuery(systemVendor)) {
    results.push(systemVendor);
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

// AV Order vendors

export async function getAVOrderVendors(avOrderId: string) {
  await requireAuth();
  return prisma.aVOrderVendor.findMany({
    where: { avOrderId },
    include: { vendor: true },
    orderBy: { vendor: { name: "asc" } },
  });
}

export async function addVendorToAVOrder(avOrderId: string, vendorId: string, eventId: string, notes?: string) {
  await requireAuth();
  await prisma.aVOrderVendor.create({
    data: { avOrderId, vendorId, notes: notes || null },
  });

  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function updateAVOrderVendor(id: string, avOrderId: string, eventId: string, notes: string) {
  await requireAuth();
  await prisma.aVOrderVendor.update({
    where: { id },
    data: { notes: notes || null },
  });

  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function removeVendorFromAVOrder(id: string, avOrderId: string, eventId: string) {
  await requireAuth();
  await prisma.aVOrderVendor.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

// Catering Order vendors

export async function getCateringOrderVendors(cateringOrderId: string) {
  await requireAuth();
  return prisma.cateringOrderVendor.findMany({
    where: { cateringOrderId },
    include: { vendor: true },
    orderBy: { vendor: { name: "asc" } },
  });
}

export async function addVendorToCateringOrder(cateringOrderId: string, vendorId: string, eventId: string, notes?: string) {
  await requireAuth();
  await prisma.cateringOrderVendor.create({
    data: { cateringOrderId, vendorId, notes: notes || null },
  });

  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function updateCateringOrderVendor(id: string, cateringOrderId: string, eventId: string, notes: string) {
  await requireAuth();
  await prisma.cateringOrderVendor.update({
    where: { id },
    data: { notes: notes || null },
  });

  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function removeVendorFromCateringOrder(id: string, cateringOrderId: string, eventId: string) {
  await requireAuth();
  await prisma.cateringOrderVendor.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

// Setup Order vendors

export async function getSetupOrderVendors(setupOrderId: string) {
  await requireAuth();
  return prisma.setupOrderVendor.findMany({
    where: { setupOrderId },
    include: { vendor: true },
    orderBy: { vendor: { name: "asc" } },
  });
}

export async function addVendorToSetupOrder(setupOrderId: string, vendorId: string, eventId: string, notes?: string) {
  await requireAuth();
  await prisma.setupOrderVendor.create({
    data: { setupOrderId, vendorId, notes: notes || null },
  });

  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

export async function updateSetupOrderVendor(id: string, setupOrderId: string, eventId: string, notes: string) {
  await requireAuth();
  await prisma.setupOrderVendor.update({
    where: { id },
    data: { notes: notes || null },
  });

  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

export async function removeVendorFromSetupOrder(id: string, setupOrderId: string, eventId: string) {
  await requireAuth();
  await prisma.setupOrderVendor.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

export async function getPrintOrderVendors(printOrderId: string) {
  await requireAuth();
  return prisma.printOrderVendor.findMany({
    where: { printOrderId },
    include: { vendor: true },
    orderBy: { vendor: { name: "asc" } },
  });
}

export async function addVendorToPrintOrder(printOrderId: string, vendorId: string, eventId: string, notes?: string) {
  await requireAuth();
  await prisma.printOrderVendor.create({
    data: { printOrderId, vendorId, notes: notes || null },
  });
  revalidatePath(`/events/${eventId}/print-orders/${printOrderId}`);
}

export async function updatePrintOrderVendor(id: string, printOrderId: string, eventId: string, notes: string) {
  await requireAuth();
  await prisma.printOrderVendor.update({
    where: { id },
    data: { notes: notes || null },
  });
  revalidatePath(`/events/${eventId}/print-orders/${printOrderId}`);
}

export async function removeVendorFromPrintOrder(id: string, printOrderId: string, eventId: string) {
  await requireAuth();
  await prisma.printOrderVendor.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/print-orders/${printOrderId}`);
}

export async function getMediaOrderVendors(mediaOrderId: string) {
  await requireAuth();
  return prisma.mediaOrderVendor.findMany({
    where: { mediaOrderId },
    include: { vendor: true },
    orderBy: { vendor: { name: "asc" } },
  });
}

export async function addVendorToMediaOrder(mediaOrderId: string, vendorId: string, eventId: string, notes?: string) {
  await requireAuth();
  await prisma.mediaOrderVendor.create({
    data: { mediaOrderId, vendorId, notes: notes || null },
  });
  revalidatePath(`/events/${eventId}/media-orders/${mediaOrderId}`);
}

export async function updateMediaOrderVendor(id: string, mediaOrderId: string, eventId: string, notes: string) {
  await requireAuth();
  await prisma.mediaOrderVendor.update({
    where: { id },
    data: { notes: notes || null },
  });
  revalidatePath(`/events/${eventId}/media-orders/${mediaOrderId}`);
}

export async function removeVendorFromMediaOrder(id: string, mediaOrderId: string, eventId: string) {
  await requireAuth();
  await prisma.mediaOrderVendor.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/media-orders/${mediaOrderId}`);
}
