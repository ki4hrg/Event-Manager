"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { redirect, notFound } from "next/navigation";
import { PermissionResource, type Vendor } from "@prisma/client";

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
      updatedBy: { select: { name: true, email: true } },
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
  const session = await requirePermission(PermissionResource.VENDORS, "WRITE");
  const name = (formData.get("name") as string).trim();
  const models = formData.getAll("models") as string[];
  const notes = (formData.get("notes") as string) || null;

  const vendor = await prisma.vendor.create({
    data: { name, models, notes, updatedById: session.user.id },
  });

  revalidatePath("/vendors");
  redirect(`/vendors/${vendor.id}`);
}

export async function updateVendor(id: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.VENDORS, "WRITE");
  const name = (formData.get("name") as string).trim();
  const models = formData.getAll("models") as string[];
  const notes = (formData.get("notes") as string) || null;

  await prisma.vendor.update({
    where: { id },
    data: { name, models, notes, updatedById: session.user.id },
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
  const session = await requirePermission(PermissionResource.VENDORS, "WRITE");
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
      updatedById: session.user.id,
    },
  });

  if (isPrimary) await clearOtherPrimaries(vendorId);

  await prisma.vendorContact.create({
    data: { vendorId, contactId: contact.id, contactType, isPrimary },
  });
  await prisma.vendor.update({ where: { id: vendorId }, data: { updatedById: session.user.id } });

  revalidatePath(`/vendors/${vendorId}`);
}

export async function addVendorContact(vendorId: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.VENDORS, "WRITE");
  const contactId = formData.get("contactId") as string;
  const contactType = (formData.get("contactType") as string) || null;
  const isPrimary = formData.get("isPrimary") === "true";

  if (isPrimary) await clearOtherPrimaries(vendorId);

  await prisma.vendorContact.create({
    data: { vendorId, contactId, contactType, isPrimary },
  });
  await prisma.vendor.update({ where: { id: vendorId }, data: { updatedById: session.user.id } });

  revalidatePath(`/vendors/${vendorId}`);
}

export async function updateVendorContact(contactId: string, vendorId: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.VENDORS, "WRITE");
  const contactType = (formData.get("contactType") as string) || null;
  const isPrimary = formData.get("isPrimary") === "true";

  if (isPrimary) await clearOtherPrimaries(vendorId, contactId);

  await prisma.vendorContact.update({
    where: { id: contactId },
    data: { contactType, isPrimary },
  });
  await prisma.vendor.update({ where: { id: vendorId }, data: { updatedById: session.user.id } });

  revalidatePath(`/vendors/${vendorId}`);
}

export async function removeVendorContact(contactId: string, vendorId: string) {
  const session = await requirePermission(PermissionResource.VENDORS, "DELETE");
  await prisma.vendorContact.delete({ where: { id: contactId } });
  await prisma.vendor.update({ where: { id: vendorId }, data: { updatedById: session.user.id } });
  revalidatePath(`/vendors/${vendorId}`);
}

// Event vendor management

// Valid defaultFor values. Add new model types here when wiring up vendor auto-assignment.
export type ModelType = "CATERING_ORDER" | "AV_ORDER" | "SETUP_ORDER" | "PRINT_ORDER" | "SUPPLY_ORDER" | "MEDIA_DELIVERABLE";

export type EventVendorKind = "regular" | "system" | "venue";

export type EventVendorEntry = {
  vendorId: string;
  vendor: Vendor;
  defaultFor: ModelType[];
  kind: EventVendorKind;
  // null for system/venue vendors that haven't been touched yet (no EventVendor row).
  // Used by the remove action; system/venue entries are never removable.
  eventVendorId: string | null;
};

// Returns the EventVendor list for the page. Always surfaces the system (event team) vendor
// and the event's venue vendor as virtual entries when they don't yet have an EventVendor row,
// so they can be tagged as defaults like any other vendor.
export async function getEventVendors(eventId: string): Promise<EventVendorEntry[]> {
  await requirePermission(PermissionResource.VENDORS, "VIEW");

  const [eventVendors, systemVendor, eventData] = await Promise.all([
    prisma.eventVendor.findMany({
      where: { eventId },
      include: { vendor: true },
    }),
    prisma.vendor.findFirst({ where: { isSystemVendor: true } }),
    prisma.event.findUnique({
      where: { id: eventId },
      select: { venue: { select: { vendor: true } } },
    }),
  ]);

  const venueVendor = eventData?.venue?.vendor ?? null;
  const byVendorId = new Map(eventVendors.map((ev) => [ev.vendorId, ev]));

  const buildEntry = (vendor: Vendor, kind: EventVendorKind): EventVendorEntry => {
    const ev = byVendorId.get(vendor.id);
    return {
      vendorId: vendor.id,
      vendor: ev?.vendor ?? vendor,
      defaultFor: (ev?.defaultFor ?? []) as ModelType[],
      kind,
      eventVendorId: ev?.id ?? null,
    };
  };

  const entries: EventVendorEntry[] = [];
  const pinnedIds = new Set<string>();

  if (systemVendor) {
    entries.push(buildEntry(systemVendor, "system"));
    pinnedIds.add(systemVendor.id);
  }
  if (venueVendor && !pinnedIds.has(venueVendor.id)) {
    entries.push(buildEntry(venueVendor, "venue"));
    pinnedIds.add(venueVendor.id);
  }

  const regulars = eventVendors
    .filter((ev) => !pinnedIds.has(ev.vendorId))
    .sort((a, b) => a.vendor.name.localeCompare(b.vendor.name))
    .map((ev): EventVendorEntry => ({
      vendorId: ev.vendorId,
      vendor: ev.vendor,
      defaultFor: ev.defaultFor as ModelType[],
      kind: "regular",
      eventVendorId: ev.id,
    }));

  entries.push(...regulars);
  return entries;
}

export async function searchVendorsForEvent(query: string, eventId: string) {
  await requirePermission(PermissionResource.VENDORS, "VIEW");
  // Returns vendors not already assigned to this event. Excludes system / venue-linked
  // vendors because those are always surfaced as virtual entries on the page.
  const assigned = await prisma.eventVendor.findMany({
    where: { eventId },
    select: { vendorId: true },
  });
  const assignedIds = assigned.map((a) => a.vendorId);

  return prisma.vendor.findMany({
    where: {
      name: { contains: query, mode: "insensitive" },
      id: { notIn: assignedIds },
      isSystemVendor: false,
      venueId: null,
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

// Assigns a vendor as the default for a model type on this event.
// Transfers the designation away from any other vendor that held it.
// Lazy-creates the EventVendor row when needed (e.g. for system / venue vendors).
export async function setDefaultVendor(eventId: string, vendorId: string, modelType: ModelType) {
  await requirePermission(PermissionResource.VENDORS, "WRITE");
  await prisma.eventVendor.upsert({
    where: { eventId_vendorId: { eventId, vendorId } },
    create: { eventId, vendorId },
    update: {},
  });
  await prisma.$transaction([
    prisma.$executeRaw`UPDATE "EventVendor" SET "defaultFor" = array_remove("defaultFor", ${modelType}) WHERE "eventId" = ${eventId} AND "vendorId" != ${vendorId}`,
    prisma.$executeRaw`UPDATE "EventVendor" SET "defaultFor" = array_append(array_remove("defaultFor", ${modelType}), ${modelType}) WHERE "eventId" = ${eventId} AND "vendorId" = ${vendorId}`,
  ]);
  revalidatePath(`/events/${eventId}/vendors`);
}

export async function removeDefaultVendor(eventId: string, vendorId: string, modelType: ModelType) {
  await requirePermission(PermissionResource.VENDORS, "WRITE");
  await prisma.$executeRaw`UPDATE "EventVendor" SET "defaultFor" = array_remove("defaultFor", ${modelType}) WHERE "eventId" = ${eventId} AND "vendorId" = ${vendorId}`;
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

async function assertAVOrderInEvent(avOrderId: string, eventId: string) {
  const found = await prisma.aVOrder.findUnique({ where: { id: avOrderId, eventId }, select: { id: true } });
  if (!found) notFound();
}

async function assertCateringOrderInEvent(cateringOrderId: string, eventId: string) {
  const found = await prisma.cateringOrder.findUnique({ where: { id: cateringOrderId, eventId }, select: { id: true } });
  if (!found) notFound();
}

async function assertSetupOrderInEvent(setupOrderId: string, eventId: string) {
  const found = await prisma.setupOrder.findUnique({ where: { id: setupOrderId, eventId }, select: { id: true } });
  if (!found) notFound();
}

async function assertPrintOrderInEvent(printOrderId: string, eventId: string) {
  const found = await prisma.printOrder.findUnique({ where: { id: printOrderId, eventId }, select: { id: true } });
  if (!found) notFound();
}

async function assertSupplyOrderInEvent(supplyOrderId: string, eventId: string) {
  const found = await prisma.supplyOrder.findUnique({ where: { id: supplyOrderId, eventId }, select: { id: true } });
  if (!found) notFound();
}

export async function getAVOrderVendors(avOrderId: string, eventId: string) {
  await requirePermission("AV_ORDERS", "VIEW", eventId);
  return prisma.aVOrderVendor.findMany({
    where: { avOrderId, avOrder: { eventId } },
    include: { vendor: true },
    orderBy: { vendor: { name: "asc" } },
  });
}

export async function addVendorToAVOrder(avOrderId: string, vendorId: string, eventId: string, notes?: string) {
  const session = await requirePermission("AV_ORDERS", "WRITE", eventId);
  await assertAVOrderInEvent(avOrderId, eventId);
  await prisma.aVOrderVendor.create({
    data: { avOrderId, vendorId, notes: notes || null },
  });
  await prisma.aVOrder.update({ where: { id: avOrderId }, data: { updatedById: session.user.id } });

  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function updateAVOrderVendor(id: string, avOrderId: string, eventId: string, notes: string) {
  const session = await requirePermission("AV_ORDERS", "WRITE", eventId);
  await prisma.aVOrderVendor.update({
    where: { id, avOrder: { eventId } },
    data: { notes: notes || null },
  });
  await prisma.aVOrder.update({ where: { id: avOrderId }, data: { updatedById: session.user.id } });

  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function removeVendorFromAVOrder(id: string, avOrderId: string, eventId: string) {
  const session = await requirePermission("AV_ORDERS", "WRITE", eventId);
  await prisma.aVOrderVendor.delete({ where: { id, avOrder: { eventId } } });
  await prisma.aVOrder.update({ where: { id: avOrderId }, data: { updatedById: session.user.id } });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

// Catering Order vendors

export async function getCateringOrderVendors(cateringOrderId: string, eventId: string) {
  await requirePermission("CATERING_ORDERS", "VIEW", eventId);
  return prisma.cateringOrderVendor.findMany({
    where: { cateringOrderId, cateringOrder: { eventId } },
    include: { vendor: true },
    orderBy: { vendor: { name: "asc" } },
  });
}

export async function addVendorToCateringOrder(cateringOrderId: string, vendorId: string, eventId: string, notes?: string) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await assertCateringOrderInEvent(cateringOrderId, eventId);
  await prisma.cateringOrderVendor.create({
    data: { cateringOrderId, vendorId, notes: notes || null },
  });
  await prisma.cateringOrder.update({ where: { id: cateringOrderId }, data: { updatedById: session.user.id } });

  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function updateCateringOrderVendor(id: string, cateringOrderId: string, eventId: string, notes: string) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await prisma.cateringOrderVendor.update({
    where: { id, cateringOrder: { eventId } },
    data: { notes: notes || null },
  });
  await prisma.cateringOrder.update({ where: { id: cateringOrderId }, data: { updatedById: session.user.id } });

  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function removeVendorFromCateringOrder(id: string, cateringOrderId: string, eventId: string) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await prisma.cateringOrderVendor.delete({ where: { id, cateringOrder: { eventId } } });
  await prisma.cateringOrder.update({ where: { id: cateringOrderId }, data: { updatedById: session.user.id } });
  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

// Setup Order vendors

export async function getSetupOrderVendors(setupOrderId: string, eventId: string) {
  await requirePermission("SETUP_ORDERS", "VIEW", eventId);
  return prisma.setupOrderVendor.findMany({
    where: { setupOrderId, setupOrder: { eventId } },
    include: { vendor: true },
    orderBy: { vendor: { name: "asc" } },
  });
}

export async function addVendorToSetupOrder(setupOrderId: string, vendorId: string, eventId: string, notes?: string) {
  const session = await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  await assertSetupOrderInEvent(setupOrderId, eventId);
  await prisma.setupOrderVendor.create({
    data: { setupOrderId, vendorId, notes: notes || null },
  });
  await prisma.setupOrder.update({ where: { id: setupOrderId }, data: { updatedById: session.user.id } });

  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

export async function updateSetupOrderVendor(id: string, setupOrderId: string, eventId: string, notes: string) {
  const session = await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  await prisma.setupOrderVendor.update({
    where: { id, setupOrder: { eventId } },
    data: { notes: notes || null },
  });
  await prisma.setupOrder.update({ where: { id: setupOrderId }, data: { updatedById: session.user.id } });

  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

export async function removeVendorFromSetupOrder(id: string, setupOrderId: string, eventId: string) {
  const session = await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  await prisma.setupOrderVendor.delete({ where: { id, setupOrder: { eventId } } });
  await prisma.setupOrder.update({ where: { id: setupOrderId }, data: { updatedById: session.user.id } });
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

export async function getPrintOrderVendors(printOrderId: string, eventId: string) {
  await requirePermission("PRINT_ORDERS", "VIEW", eventId);
  return prisma.printOrderVendor.findMany({
    where: { printOrderId, printOrder: { eventId } },
    include: { vendor: true },
    orderBy: { vendor: { name: "asc" } },
  });
}

export async function addVendorToPrintOrder(printOrderId: string, vendorId: string, eventId: string, notes?: string) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  await assertPrintOrderInEvent(printOrderId, eventId);
  await prisma.printOrderVendor.create({
    data: { printOrderId, vendorId, notes: notes || null },
  });
  await prisma.printOrder.update({ where: { id: printOrderId }, data: { updatedById: session.user.id } });
  revalidatePath(`/events/${eventId}/print-orders/${printOrderId}`);
}

export async function updatePrintOrderVendor(id: string, printOrderId: string, eventId: string, notes: string) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  await prisma.printOrderVendor.update({
    where: { id, printOrder: { eventId } },
    data: { notes: notes || null },
  });
  await prisma.printOrder.update({ where: { id: printOrderId }, data: { updatedById: session.user.id } });
  revalidatePath(`/events/${eventId}/print-orders/${printOrderId}`);
}

export async function removeVendorFromPrintOrder(id: string, printOrderId: string, eventId: string) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  await prisma.printOrderVendor.delete({ where: { id, printOrder: { eventId } } });
  await prisma.printOrder.update({ where: { id: printOrderId }, data: { updatedById: session.user.id } });
  revalidatePath(`/events/${eventId}/print-orders/${printOrderId}`);
}

// Supply Order vendors

export async function getSupplyOrderVendors(supplyOrderId: string, eventId: string) {
  await requirePermission("SUPPLY_ORDERS", "VIEW", eventId);
  return prisma.supplyOrderVendor.findMany({
    where: { supplyOrderId, supplyOrder: { eventId } },
    include: { vendor: true },
    orderBy: { vendor: { name: "asc" } },
  });
}

export async function addVendorToSupplyOrder(supplyOrderId: string, vendorId: string, eventId: string, notes?: string) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  await assertSupplyOrderInEvent(supplyOrderId, eventId);
  await prisma.supplyOrderVendor.create({
    data: { supplyOrderId, vendorId, notes: notes || null },
  });
  await prisma.supplyOrder.update({ where: { id: supplyOrderId }, data: { updatedById: session.user.id } });
  revalidatePath(`/events/${eventId}/supply-orders/${supplyOrderId}`);
}

export async function updateSupplyOrderVendor(id: string, supplyOrderId: string, eventId: string, notes: string) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  await prisma.supplyOrderVendor.update({
    where: { id, supplyOrder: { eventId } },
    data: { notes: notes || null },
  });
  await prisma.supplyOrder.update({ where: { id: supplyOrderId }, data: { updatedById: session.user.id } });
  revalidatePath(`/events/${eventId}/supply-orders/${supplyOrderId}`);
}

export async function removeVendorFromSupplyOrder(id: string, supplyOrderId: string, eventId: string) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  await prisma.supplyOrderVendor.delete({ where: { id, supplyOrder: { eventId } } });
  await prisma.supplyOrder.update({ where: { id: supplyOrderId }, data: { updatedById: session.user.id } });
  revalidatePath(`/events/${eventId}/supply-orders/${supplyOrderId}`);
}

