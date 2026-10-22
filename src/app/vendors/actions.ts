"use server";

import { prisma } from "@/lib/prisma";
import { hasPermissionForUser, requirePermission } from "@/lib/permissions";
import { eventVenuesOrderBy } from "@/lib/eventVenues";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { PermissionResource, type Vendor } from "@prisma/client";
import {
  createVendorCore,
  updateVendorCore,
  deleteVendorCore,
  createAndAddVendorContactCore,
  addVendorContactCore,
  updateVendorContactCore,
  removeVendorContactCore,
  addVendorToEventCore,
  removeVendorFromEventCore,
  setDefaultVendorCore,
  removeDefaultVendorCore,
  addVendorToAVOrderCore,
  updateAVOrderVendorCore,
  removeVendorFromAVOrderCore,
  addVendorToCateringOrderCore,
  updateCateringOrderVendorCore,
  removeVendorFromCateringOrderCore,
  addVendorToSetupOrderCore,
  updateSetupOrderVendorCore,
  removeVendorFromSetupOrderCore,
  addVendorToPrintOrderCore,
  updatePrintOrderVendorCore,
  removeVendorFromPrintOrderCore,
  type ModelType,
} from "./core";

// Re-exported so existing importers (`from "@/app/vendors/actions"`) keep working.
// New callers should import from "@/app/vendors/core" directly.
export type { ModelType };

// An event's vendor lists: the event must be one the caller can open, and
// VENDORS is checked in that event's tenant (not the active one), so another
// tenant's event id reads as not-found.
async function requireEventVendorView(eventId: string) {
  const session = await requirePermission("EVENTS", "VIEW", eventId);
  if (!(await hasPermissionForUser(session.user.id, PermissionResource.VENDORS, "VIEW", { tenantId: session.tenantId }))) notFound();
  return session;
}

export type ResponsiblePartyOptions = {
  vendors: { id: string; name: string }[];
  // One per event venue that has a backing vendor, in event venue order.
  venueVendors: { id: string; name: string }[];
  systemVendor: { id: string; name: string } | null;
};

export async function getResponsiblePartyVendors(eventId: string, modelType?: string): Promise<ResponsiblePartyOptions> {
  const session = await requireEventVendorView(eventId);
  const modelFilter = modelType
    ? { OR: [{ models: { isEmpty: true } }, { models: { has: modelType } }] }
    : undefined;
  const [eventVendors, eventVenues, systemVendor] = await Promise.all([
    prisma.eventVendor.findMany({
      where: { eventId, ...(modelFilter ? { vendor: modelFilter } : {}) },
      select: { vendor: { select: { id: true, name: true } } },
    }),
    prisma.eventVenue.findMany({
      where: { eventId },
      orderBy: eventVenuesOrderBy,
      select: { venue: { select: { vendor: { select: { id: true, name: true } } } } },
    }),
    prisma.vendor.findFirst({ where: { tenantId: session.tenantId, isSystemVendor: true }, select: { id: true, name: true } }),
  ]);

  const venueVendors = eventVenues.flatMap((ev) => (ev.venue.vendor ? [ev.venue.vendor] : []));
  const excludeIds = new Set<string>(venueVendors.map((v) => v.id));
  if (systemVendor) excludeIds.add(systemVendor.id);

  const vendors = eventVendors
    .map((ev) => ev.vendor)
    .filter((v) => !excludeIds.has(v.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { vendors, venueVendors, systemVendor: systemVendor ?? null };
}

export async function getVendors() {
  const session = await requirePermission(PermissionResource.VENDORS, "VIEW");
  return prisma.vendor.findMany({
    where: { tenantId: session.tenantId, isSystemVendor: false, venueId: null },
    include: {
      _count: { select: { contacts: true } },
    },
    orderBy: { name: "asc" },
  });
}

export async function getVendor(id: string) {
  const session = await requirePermission(PermissionResource.VENDORS, "VIEW");
  return prisma.vendor.findFirst({
    where: { id, tenantId: session.tenantId },
    include: {
      contacts: { include: { contact: true }, orderBy: [{ isPrimary: "desc" }, { id: "asc" }] },
      updatedBy: { select: { name: true, email: true } },
    },
  });
}

export async function searchVendors(query: string) {
  const session = await requirePermission(PermissionResource.VENDORS, "VIEW");
  return prisma.vendor.findMany({
    where: {
      tenantId: session.tenantId,
      name: { contains: query, mode: "insensitive" },
    },
    orderBy: { name: "asc" },
    take: 20,
  });
}

export async function createVendor(formData: FormData) {
  const session = await requirePermission(PermissionResource.VENDORS, "WRITE");
  const vendor = await createVendorCore(
    {
      name: (formData.get("name") as string).trim(),
      models: formData.getAll("models") as string[],
      notes: (formData.get("notes") as string) || null,
    },
    session.user.id,
    session.tenantId,
  );
  revalidatePath("/vendors");
  redirect(`/vendors/${vendor.id}`);
}

export async function updateVendor(id: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.VENDORS, "WRITE");
  await updateVendorCore(
    id,
    {
      name: (formData.get("name") as string).trim(),
      models: formData.getAll("models") as string[],
      notes: (formData.get("notes") as string) || null,
    },
    session.user.id,
    session.tenantId,
  );
  revalidatePath(`/vendors/${id}`);
  revalidatePath("/vendors");
}

export async function deleteVendor(id: string) {
  const session = await requirePermission(PermissionResource.VENDORS, "DELETE");
  await deleteVendorCore(id, session.user.id, session.tenantId);
  revalidatePath("/vendors");
  redirect("/vendors");
}

// Vendor contact management

export async function searchContactsForVendor(query: string) {
  const session = await requirePermission(PermissionResource.VENDORS, "VIEW");
  return prisma.contact.findMany({
    where: {
      tenantId: session.tenantId,
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

export async function createAndAddVendorContact(vendorId: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.VENDORS, "WRITE");
  await createAndAddVendorContactCore(
    {
      vendorId,
      firstName: formData.get("firstName") as string,
      lastName: formData.get("lastName") as string,
      email: (formData.get("email") as string) || null,
      organization: (formData.get("organization") as string) || null,
      contactType: (formData.get("contactType") as string) || null,
      isPrimary: formData.get("isPrimary") === "true",
    },
    session.user.id,
    session.tenantId,
  );
  revalidatePath(`/vendors/${vendorId}`);
}

export async function addVendorContact(vendorId: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.VENDORS, "WRITE");
  await addVendorContactCore(
    {
      vendorId,
      contactId: formData.get("contactId") as string,
      contactType: (formData.get("contactType") as string) || null,
      isPrimary: formData.get("isPrimary") === "true",
    },
    session.user.id,
    session.tenantId,
  );
  revalidatePath(`/vendors/${vendorId}`);
}

export async function updateVendorContact(contactId: string, vendorId: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.VENDORS, "WRITE");
  await updateVendorContactCore(
    {
      vendorContactId: contactId,
      vendorId,
      contactType: (formData.get("contactType") as string) || null,
      isPrimary: formData.get("isPrimary") === "true",
    },
    session.user.id,
    session.tenantId,
  );
  revalidatePath(`/vendors/${vendorId}`);
}

export async function removeVendorContact(contactId: string, vendorId: string) {
  const session = await requirePermission(PermissionResource.VENDORS, "DELETE");
  await removeVendorContactCore(contactId, vendorId, session.user.id, session.tenantId);
  revalidatePath(`/vendors/${vendorId}`);
}

// Event vendor management

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
// and each event venue's vendor as virtual entries when they don't yet have an EventVendor row,
// so they can be tagged as defaults like any other vendor.
export async function getEventVendors(eventId: string): Promise<EventVendorEntry[]> {
  const session = await requireEventVendorView(eventId);

  const [eventVendors, systemVendor, eventVenues] = await Promise.all([
    prisma.eventVendor.findMany({
      where: { eventId },
      include: { vendor: true },
    }),
    prisma.vendor.findFirst({ where: { tenantId: session.tenantId, isSystemVendor: true } }),
    prisma.eventVenue.findMany({
      where: { eventId },
      orderBy: eventVenuesOrderBy,
      select: { venue: { select: { vendor: true } } },
    }),
  ]);

  const venueVendors = eventVenues.flatMap((ev) => (ev.venue.vendor ? [ev.venue.vendor] : []));
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
  for (const venueVendor of venueVendors) {
    if (pinnedIds.has(venueVendor.id)) continue;
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
  const session = await requireEventVendorView(eventId);
  // Returns vendors not already assigned to this event. Excludes system / venue-linked
  // vendors because those are always surfaced as virtual entries on the page.
  const assigned = await prisma.eventVendor.findMany({
    where: { eventId },
    select: { vendorId: true },
  });
  const assignedIds = assigned.map((a) => a.vendorId);

  return prisma.vendor.findMany({
    where: {
      tenantId: session.tenantId,
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
  const session = await requirePermission(PermissionResource.VENDORS, "WRITE");
  await addVendorToEventCore(eventId, vendorId, session.user.id);
  revalidatePath(`/events/${eventId}/vendors`);
}

export async function removeVendorFromEvent(eventVendorId: string, eventId: string) {
  const session = await requirePermission(PermissionResource.VENDORS, "DELETE");
  await removeVendorFromEventCore(eventVendorId, session.user.id);
  revalidatePath(`/events/${eventId}/vendors`);
}

export async function setDefaultVendor(eventId: string, vendorId: string, modelType: ModelType) {
  const session = await requirePermission(PermissionResource.VENDORS, "WRITE");
  await setDefaultVendorCore(eventId, vendorId, modelType, session.user.id);
  revalidatePath(`/events/${eventId}/vendors`);
}

export async function removeDefaultVendor(eventId: string, vendorId: string, modelType: ModelType) {
  const session = await requirePermission(PermissionResource.VENDORS, "WRITE");
  await removeDefaultVendorCore(eventId, vendorId, modelType, session.user.id);
  revalidatePath(`/events/${eventId}/vendors`);
}

export async function getDefaultVendorForModel(eventId: string, modelType: ModelType) {
  await requireEventVendorView(eventId);
  return prisma.eventVendor.findFirst({
    where: { eventId, defaultFor: { has: modelType } },
  });
}

// Entity vendor management helpers

export async function getEventVendorsForPicker(eventId: string) {
  await requireEventVendorView(eventId);
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
  const session = await requireEventVendorView(eventId);
  const modelFilter = modelType
    ? { OR: [{ models: { isEmpty: true } }, { models: { has: modelType } }] }
    : undefined;
  const [rows, eventVenues, systemVendor] = await Promise.all([
    prisma.eventVendor.findMany({
      where: {
        eventId,
        vendor: { name: { contains: query, mode: "insensitive" }, ...modelFilter },
      },
      include: { vendor: true },
      orderBy: { vendor: { name: "asc" } },
      take: 20,
    }),
    prisma.eventVenue.findMany({
      where: { eventId },
      select: { venue: { select: { vendor: true } } },
    }),
    prisma.vendor.findFirst({ where: { tenantId: session.tenantId, isSystemVendor: true } }),
  ]);

  const results = rows.map((r) => r.vendor);
  const seen = new Set(results.map((v) => v.id));
  const q = query.toLowerCase();
  const matchesQuery = (v: { name: string } | null | undefined) =>
    !!v && (q === "" || v.name.toLowerCase().includes(q));

  for (const { venue } of eventVenues) {
    const venueVendor = venue.vendor;
    if (venueVendor && !seen.has(venueVendor.id) && matchesQuery(venueVendor)) {
      results.push(venueVendor);
      seen.add(venueVendor.id);
    }
  }
  if (systemVendor && !seen.has(systemVendor.id) && matchesQuery(systemVendor)) {
    results.push(systemVendor);
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

// AV Order vendors

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
  await addVendorToAVOrderCore(avOrderId, vendorId, eventId, notes || null, session.user.id);
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function updateAVOrderVendor(id: string, avOrderId: string, eventId: string, notes: string) {
  const session = await requirePermission("AV_ORDERS", "WRITE", eventId);
  await updateAVOrderVendorCore(id, avOrderId, eventId, notes || null, session.user.id);
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function removeVendorFromAVOrder(id: string, avOrderId: string, eventId: string) {
  const session = await requirePermission("AV_ORDERS", "WRITE", eventId);
  await removeVendorFromAVOrderCore(id, avOrderId, eventId, session.user.id);
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
  await addVendorToCateringOrderCore(cateringOrderId, vendorId, eventId, notes || null, session.user.id);
  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function updateCateringOrderVendor(id: string, cateringOrderId: string, eventId: string, notes: string) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await updateCateringOrderVendorCore(id, cateringOrderId, eventId, notes || null, session.user.id);
  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function removeVendorFromCateringOrder(id: string, cateringOrderId: string, eventId: string) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await removeVendorFromCateringOrderCore(id, cateringOrderId, eventId, session.user.id);
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
  await addVendorToSetupOrderCore(setupOrderId, vendorId, eventId, notes || null, session.user.id);
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

export async function updateSetupOrderVendor(id: string, setupOrderId: string, eventId: string, notes: string) {
  const session = await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  await updateSetupOrderVendorCore(id, setupOrderId, eventId, notes || null, session.user.id);
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

export async function removeVendorFromSetupOrder(id: string, setupOrderId: string, eventId: string) {
  const session = await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  await removeVendorFromSetupOrderCore(id, setupOrderId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

// Print Order vendors

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
  await addVendorToPrintOrderCore(printOrderId, vendorId, eventId, notes || null, session.user.id);
  revalidatePath(`/events/${eventId}/print-orders/${printOrderId}`);
}

export async function updatePrintOrderVendor(id: string, printOrderId: string, eventId: string, notes: string) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  await updatePrintOrderVendorCore(id, printOrderId, eventId, notes || null, session.user.id);
  revalidatePath(`/events/${eventId}/print-orders/${printOrderId}`);
}

export async function removeVendorFromPrintOrder(id: string, printOrderId: string, eventId: string) {
  const session = await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  await removeVendorFromPrintOrderCore(id, printOrderId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/print-orders/${printOrderId}`);
}
