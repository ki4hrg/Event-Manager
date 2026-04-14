"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function getResponsiblePartyVendors(eventId: string): Promise<{ id: string; name: string }[]> {
  const [eventVendors, event, systemVendor] = await Promise.all([
    prisma.eventVendor.findMany({ where: { eventId }, select: { vendor: { select: { id: true, name: true } } } }),
    prisma.event.findUnique({ where: { id: eventId }, select: { venue: { select: { vendor: { select: { id: true, name: true } } } } } }),
    prisma.vendor.findFirst({ where: { isSystemVendor: true }, select: { id: true, name: true } }),
  ]);

  const seen = new Set<string>();
  const vendors: { id: string; name: string }[] = [];

  const addVendor = (v: { id: string; name: string }) => {
    if (!seen.has(v.id)) {
      seen.add(v.id);
      vendors.push({ id: v.id, name: v.name });
    }
  };

  for (const ev of eventVendors) {
    addVendor(ev.vendor);
  }

  if (event?.venue?.vendor) {
    addVendor(event.venue.vendor);
  }

  if (systemVendor) {
    addVendor(systemVendor);
  }

  return vendors.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getVendors() {
  return prisma.vendor.findMany({
    where: { isSystemVendor: false, venueId: null },
    include: {
      _count: { select: { contacts: true } },
    },
    orderBy: { name: "asc" },
  });
}

export async function getVendor(id: string) {
  return prisma.vendor.findUnique({
    where: { id },
    include: {
      contacts: { include: { contact: true }, orderBy: { id: "asc" } },
    },
  });
}

export async function searchVendors(query: string) {
  return prisma.vendor.findMany({
    where: {
      name: { contains: query, mode: "insensitive" },
    },
    orderBy: { name: "asc" },
    take: 20,
  });
}

export async function createVendor(formData: FormData) {
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
  await prisma.vendor.delete({ where: { id } });
  revalidatePath("/vendors");
  redirect("/vendors");
}

// Vendor contact management

export async function searchContactsForVendor(query: string) {
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

export async function createAndAddVendorContact(vendorId: string, formData: FormData) {
  const firstName = formData.get("firstName") as string;
  const lastName = formData.get("lastName") as string;
  const email = formData.get("email") as string;
  const organization = formData.get("organization") as string;
  const contactType = (formData.get("contactType") as string) || null;

  const contact = await prisma.contact.create({
    data: {
      firstName,
      lastName,
      email: email || null,
      organization: organization || null,
    },
  });

  await prisma.vendorContact.create({
    data: { vendorId, contactId: contact.id, contactType },
  });

  revalidatePath(`/vendors/${vendorId}`);
}

export async function addVendorContact(vendorId: string, formData: FormData) {
  const contactId = formData.get("contactId") as string;
  const contactType = (formData.get("contactType") as string) || null;

  await prisma.vendorContact.create({
    data: { vendorId, contactId, contactType },
  });

  revalidatePath(`/vendors/${vendorId}`);
}

export async function updateVendorContact(contactId: string, vendorId: string, formData: FormData) {
  const contactType = (formData.get("contactType") as string) || null;

  await prisma.vendorContact.update({
    where: { id: contactId },
    data: { contactType },
  });

  revalidatePath(`/vendors/${vendorId}`);
}

export async function removeVendorContact(contactId: string, vendorId: string) {
  await prisma.vendorContact.delete({ where: { id: contactId } });
  revalidatePath(`/vendors/${vendorId}`);
}

// Event vendor management

export async function getEventVendors(eventId: string) {
  return prisma.eventVendor.findMany({
    where: { eventId },
    include: { vendor: true },
    orderBy: { vendor: { name: "asc" } },
  });
}

export async function searchVendorsForEvent(query: string, eventId: string) {
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
  await prisma.eventVendor.create({
    data: { eventId, vendorId },
  });

  revalidatePath(`/events/${eventId}/vendors`);
}

export async function removeVendorFromEvent(eventVendorId: string, eventId: string) {
  await prisma.eventVendor.delete({ where: { id: eventVendorId } });
  revalidatePath(`/events/${eventId}/vendors`);
}

// Valid defaultFor values. Add new model types here when wiring up vendor auto-assignment.
export type ModelType = "CATERING_ORDER" | "AV_ORDER" | "SETUP_ORDER";

// Assigns a vendor as the default for a model type on this event.
// Transfers the designation away from any other vendor that held it.
export async function setDefaultVendor(eventVendorId: string, modelType: ModelType, eventId: string) {
  await prisma.$transaction([
    prisma.$executeRaw`UPDATE "EventVendor" SET "defaultFor" = array_remove("defaultFor", ${modelType}) WHERE "eventId" = ${eventId} AND id != ${eventVendorId}`,
    prisma.$executeRaw`UPDATE "EventVendor" SET "defaultFor" = array_append(array_remove("defaultFor", ${modelType}), ${modelType}) WHERE id = ${eventVendorId}`,
  ]);
  revalidatePath(`/events/${eventId}/vendors`);
}

export async function removeDefaultVendor(eventVendorId: string, modelType: ModelType, eventId: string) {
  await prisma.$executeRaw`UPDATE "EventVendor" SET "defaultFor" = array_remove("defaultFor", ${modelType}) WHERE id = ${eventVendorId}`;
  revalidatePath(`/events/${eventId}/vendors`);
}

export async function getDefaultVendorForModel(eventId: string, modelType: ModelType) {
  return prisma.eventVendor.findFirst({
    where: { eventId, defaultFor: { has: modelType } },
  });
}

// Entity vendor management helpers

export async function getEventVendorsForPicker(eventId: string) {
  return prisma.eventVendor.findMany({
    where: { eventId },
    include: { vendor: true },
    orderBy: { vendor: { name: "asc" } },
  });
}

// Search among vendors assigned to the event (for entity-level vendor pickers).
// When modelType is provided, only returns vendors with that model or no models (general-purpose).
export async function searchAssignedEventVendors(query: string, eventId: string, modelType?: ModelType) {
  const modelFilter = modelType
    ? { OR: [{ models: { isEmpty: true } }, { models: { has: modelType } }] }
    : undefined;
  const rows = await prisma.eventVendor.findMany({
    where: {
      eventId,
      vendor: { name: { contains: query, mode: "insensitive" }, ...modelFilter },
    },
    include: { vendor: true },
    orderBy: { vendor: { name: "asc" } },
    take: 20,
  });
  return rows.map((r) => r.vendor);
}

// AV Order vendors

export async function getAVOrderVendors(avOrderId: string) {
  return prisma.aVOrderVendor.findMany({
    where: { avOrderId },
    include: { vendor: true },
    orderBy: { vendor: { name: "asc" } },
  });
}

export async function addVendorToAVOrder(avOrderId: string, vendorId: string, eventId: string, notes?: string) {
  await prisma.aVOrderVendor.create({
    data: { avOrderId, vendorId, notes: notes || null },
  });

  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function updateAVOrderVendor(id: string, avOrderId: string, eventId: string, notes: string) {
  await prisma.aVOrderVendor.update({
    where: { id },
    data: { notes: notes || null },
  });

  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function removeVendorFromAVOrder(id: string, avOrderId: string, eventId: string) {
  await prisma.aVOrderVendor.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

// Catering Order vendors

export async function getCateringOrderVendors(cateringOrderId: string) {
  return prisma.cateringOrderVendor.findMany({
    where: { cateringOrderId },
    include: { vendor: true },
    orderBy: { vendor: { name: "asc" } },
  });
}

export async function addVendorToCateringOrder(cateringOrderId: string, vendorId: string, eventId: string, notes?: string) {
  await prisma.cateringOrderVendor.create({
    data: { cateringOrderId, vendorId, notes: notes || null },
  });

  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function updateCateringOrderVendor(id: string, cateringOrderId: string, eventId: string, notes: string) {
  await prisma.cateringOrderVendor.update({
    where: { id },
    data: { notes: notes || null },
  });

  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function removeVendorFromCateringOrder(id: string, cateringOrderId: string, eventId: string) {
  await prisma.cateringOrderVendor.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

// Setup Order vendors

export async function getSetupOrderVendors(setupOrderId: string) {
  return prisma.setupOrderVendor.findMany({
    where: { setupOrderId },
    include: { vendor: true },
    orderBy: { vendor: { name: "asc" } },
  });
}

export async function addVendorToSetupOrder(setupOrderId: string, vendorId: string, eventId: string, notes?: string) {
  await prisma.setupOrderVendor.create({
    data: { setupOrderId, vendorId, notes: notes || null },
  });

  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

export async function updateSetupOrderVendor(id: string, setupOrderId: string, eventId: string, notes: string) {
  await prisma.setupOrderVendor.update({
    where: { id },
    data: { notes: notes || null },
  });

  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

export async function removeVendorFromSetupOrder(id: string, setupOrderId: string, eventId: string) {
  await prisma.setupOrderVendor.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}
