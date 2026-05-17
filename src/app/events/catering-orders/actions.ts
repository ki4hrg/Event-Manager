"use server";

import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect, notFound } from "next/navigation";
import type { EntityStatus } from "@prisma/client";
import { getDefaultVendorForModel } from "@/app/vendors/actions";
import { resolveEquipmentName } from "@/lib/equipment-utils";
import { parseDateTimeInTimezone } from "@/lib/timezones";
import { autoAssignDefaultWorkflows } from "@/app/events/workflows/actions";
import { resolveCreateStatus } from "@/lib/statusDefaults";
import { compareByMainFunctionTime } from "@/lib/functionSchedules";

// Verifies the catering order belongs to the claimed event before a create-style mutation
// (where Prisma can't enforce ownership via the where clause).
async function assertCateringOrderInEvent(cateringOrderId: string, eventId: string) {
  const found = await prisma.cateringOrder.findUnique({
    where: { id: cateringOrderId, eventId },
    select: { id: true },
  });
  if (!found) notFound();
}

async function eventTimezone(eventId: string): Promise<string> {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { timezone: true } });
  if (!event) throw new Error("Event not found");
  return event.timezone;
}

export async function getCateringOrders(eventId: string) {
  await requirePermission("CATERING_ORDERS", "VIEW", eventId);
  const orders = await prisma.cateringOrder.findMany({
    where: { eventId },
    include: {
      function: {
        select: {
          id: true,
          name: true,
          schedules: { select: { startTime: true, endTime: true, isPublic: true } },
        },
      },
      vendors: { include: { vendor: { select: { id: true, name: true } } } },
    },
  });
  return orders.sort(compareByMainFunctionTime);
}

export async function getCateringOrder(id: string) {
  const row = await prisma.cateringOrder.findUnique({
    where: { id },
    include: {
      function: { include: { schedules: { orderBy: { startTime: "asc" } } } },
      timelineItems: { orderBy: [{ sortOrder: "asc" }, { startTime: "asc" }] },
      equipmentItems: { include: { equipment: true, providerVendor: true, providerContact: true, operatorVendor: true, operatorContact: true }, orderBy: [{ sortOrder: "asc" }, { item: "asc" }] },
      lineItems: { orderBy: [{ sortOrder: "asc" }, { description: "asc" }] },
      menuSections: { include: { responsiblePartyVendor: true }, orderBy: [{ sortOrder: "asc" }] },
      contacts: { include: { contact: true }, orderBy: { id: "asc" } },
    },
  });
  if (!row) return null;
  await requirePermission("CATERING_ORDERS", "VIEW", row.eventId);
  return row;
}

function parseDateField(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export async function createCateringOrder(eventId: string, formData: FormData) {
  await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  const name = formData.get("name") as string;
  const functionId = formData.get("functionId") as string;

  const defaults = await resolveCreateStatus(eventId, "CATERING_ORDER");

  const cateringOrder = await prisma.cateringOrder.create({
    data: {
      name,
      eventId,
      functionId: functionId || null,
      serviceStyle: (formData.get("serviceStyle") as string) || null,
      expectedCount: formData.get("expectedCount") ? parseInt(formData.get("expectedCount") as string) : null,
      confirmedCount: formData.get("confirmedCount") ? parseInt(formData.get("confirmedCount") as string) : null,
      guaranteeCount: formData.get("guaranteeCount") ? parseInt(formData.get("guaranteeCount") as string) : null,
      staffingNotes: (formData.get("staffingNotes") as string) || null,
      rentalMinimum: (formData.get("rentalMinimum") as string) ? parseFloat(formData.get("rentalMinimum") as string) : null,
      fbMinimum: (formData.get("fbMinimum") as string) ? parseFloat(formData.get("fbMinimum") as string) : null,
      depositDeadline: parseDateField(formData.get("depositDeadline") as string),
      guaranteeDeadline: parseDateField(formData.get("guaranteeDeadline") as string),
      paymentDeadline: parseDateField(formData.get("paymentDeadline") as string),
      cancellationTerms: (formData.get("cancellationTerms") as string) || null,
      dietaryNotes: (formData.get("dietaryNotes") as string) || null,
      notes: (formData.get("notes") as string) || null,
      status: defaults.status,
      substatus: defaults.substatus,
    },
  });

  const selectedVendorId = (formData.get("vendorId") as string) || null;
  const vendorIdToAssign = selectedVendorId ?? (await getDefaultVendorForModel(eventId, "CATERING_ORDER"))?.vendorId ?? null;
  if (vendorIdToAssign) {
    await prisma.cateringOrderVendor.create({ data: { cateringOrderId: cateringOrder.id, vendorId: vendorIdToAssign } });
  }

  await autoAssignDefaultWorkflows("catering_order", cateringOrder.id, eventId);
  revalidatePath(`/events/${eventId}/catering-orders`);
  redirect(`/events/${eventId}/catering-orders/${cateringOrder.id}`);
}

export async function updateCateringOrderDetails(id: string, eventId: string, formData: FormData) {
  await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await prisma.cateringOrder.update({
    where: { id, eventId },
    data: {
      name: formData.get("name") as string,
      serviceStyle: (formData.get("serviceStyle") as string) || null,
      notes: (formData.get("notes") as string) || null,
    },
  });
  revalidatePath(`/events/${eventId}/catering-orders/${id}`);
  redirect(`/events/${eventId}/catering-orders/${id}?tab=overview&success=Saved`);
}

export async function updateCateringOrderGuestCounts(id: string, eventId: string, formData: FormData) {
  await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await prisma.cateringOrder.update({
    where: { id, eventId },
    data: {
      expectedCount: formData.get("expectedCount") ? parseInt(formData.get("expectedCount") as string) : null,
      confirmedCount: formData.get("confirmedCount") ? parseInt(formData.get("confirmedCount") as string) : null,
      guaranteeCount: formData.get("guaranteeCount") ? parseInt(formData.get("guaranteeCount") as string) : null,
    },
  });
  revalidatePath(`/events/${eventId}/catering-orders/${id}`);
  redirect(`/events/${eventId}/catering-orders/${id}?tab=overview&success=Saved`);
}

export async function updateCateringOrderService(id: string, eventId: string, formData: FormData) {
  await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await prisma.cateringOrder.update({
    where: { id, eventId },
    data: {
      dietaryNotes: (formData.get("dietaryNotes") as string) || null,
      staffingNotes: (formData.get("staffingNotes") as string) || null,
    },
  });
  revalidatePath(`/events/${eventId}/catering-orders/${id}`);
  redirect(`/events/${eventId}/catering-orders/${id}?tab=service&success=Saved`);
}

export async function updateCateringOrderContract(id: string, eventId: string, formData: FormData) {
  await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await prisma.cateringOrder.update({
    where: { id, eventId },
    data: {
      depositDeadline: parseDateField(formData.get("depositDeadline") as string),
      guaranteeDeadline: parseDateField(formData.get("guaranteeDeadline") as string),
      paymentDeadline: parseDateField(formData.get("paymentDeadline") as string),
      rentalMinimum: (formData.get("rentalMinimum") as string) ? parseFloat(formData.get("rentalMinimum") as string) : null,
      fbMinimum: (formData.get("fbMinimum") as string) ? parseFloat(formData.get("fbMinimum") as string) : null,
      cancellationTerms: (formData.get("cancellationTerms") as string) || null,
      notes: (formData.get("notes") as string) || null,
    },
  });
  revalidatePath(`/events/${eventId}/catering-orders/${id}`);
  redirect(`/events/${eventId}/catering-orders/${id}?tab=contract&success=Saved`);
}

export async function deleteCateringOrder(id: string, eventId: string) {
  await requirePermission("CATERING_ORDERS", "DELETE", eventId);
  await prisma.cateringOrder.delete({ where: { id, eventId } });
  revalidatePath(`/events/${eventId}/catering-orders`);
  redirect(`/events/${eventId}/catering-orders`);
}

export async function linkCateringOrderToFunction(cateringOrderId: string, functionId: string, eventId: string) {
  await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await assertCateringOrderInEvent(cateringOrderId, eventId);
  await prisma.cateringOrder.update({
    where: { id: cateringOrderId, eventId },
    data: { functionId },
  });
  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function unlinkCateringOrderFromFunction(cateringOrderId: string, eventId: string) {
  await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  const cateringOrder = await prisma.cateringOrder.findUnique({
    where: { id: cateringOrderId, eventId },
    select: { functionId: true },
  });
  await prisma.cateringOrder.update({
    where: { id: cateringOrderId, eventId },
    data: { functionId: null },
  });
  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
  if (cateringOrder?.functionId) {
    revalidatePath(`/events/${eventId}/functions/${cateringOrder.functionId}`);
  }
}

export async function getAvailableCateringOrders(eventId: string) {
  await requirePermission("CATERING_ORDERS", "VIEW", eventId);
  return prisma.cateringOrder.findMany({
    where: { eventId, functionId: null },
    orderBy: { name: "asc" },
  });
}

export async function linkCateringOrderToFunctionFromFunction(
  cateringOrderId: string,
  functionId: string,
  eventId: string
) {
  await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await assertCateringOrderInEvent(cateringOrderId, eventId);
  await prisma.cateringOrder.update({
    where: { id: cateringOrderId, eventId },
    data: { functionId },
  });
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function unlinkCateringOrderFromFunctionPage(functionId: string, eventId: string) {
  await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await prisma.cateringOrder.updateMany({
    where: { functionId, eventId },
    data: { functionId: null },
  });
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function createTimelineItem(cateringOrderId: string, eventId: string, formData: FormData) {
  await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await assertCateringOrderInEvent(cateringOrderId, eventId);
  const timezone = await eventTimezone(eventId);
  const label = formData.get("label") as string;
  const startTime = parseDateTimeInTimezone(formData.get("startTime") as string, timezone);
  const endTimeStr = formData.get("endTime") as string;
  const notes = formData.get("notes") as string;

  const { _max } = await prisma.timelineItem.aggregate({ where: { cateringOrderId }, _max: { sortOrder: true } });

  await prisma.timelineItem.create({
    data: {
      cateringOrderId,
      label,
      startTime,
      endTime: endTimeStr ? parseDateTimeInTimezone(endTimeStr, timezone) : null,
      notes: notes || null,
      sortOrder: (_max.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function updateTimelineItem(id: string, cateringOrderId: string, eventId: string, formData: FormData) {
  await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  const timezone = await eventTimezone(eventId);
  const startTime = parseDateTimeInTimezone(formData.get("startTime") as string, timezone);
  const endTimeStr = formData.get("endTime") as string;

  await prisma.timelineItem.update({
    where: { id, cateringOrder: { eventId } },
    data: {
      label: formData.get("label") as string,
      startTime,
      endTime: endTimeStr ? parseDateTimeInTimezone(endTimeStr, timezone) : null,
      notes: (formData.get("notes") as string) || null,
    },
  });

  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function deleteTimelineItem(id: string, cateringOrderId: string, eventId: string) {
  await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await prisma.timelineItem.delete({ where: { id, cateringOrder: { eventId } } });
  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function createEquipmentItem(cateringOrderId: string, eventId: string, formData: FormData) {
  await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await assertCateringOrderInEvent(cateringOrderId, eventId);
  const { _max } = await prisma.equipmentItem.aggregate({ where: { cateringOrderId }, _max: { sortOrder: true } });
  const equipmentId = (formData.get("equipmentId") as string) || null;
  const item = await resolveEquipmentName(equipmentId, (formData.get("item") as string) || "");

  await prisma.equipmentItem.create({
    data: {
      cateringOrderId,
      equipmentId,
      item,
      quantity: formData.get("quantity") ? parseInt(formData.get("quantity") as string) : null,
      providerVendorId: (formData.get("providerVendorId") as string) || null,
      providerContactId: (formData.get("providerContactId") as string) || null,
      operatorVendorId: (formData.get("operatorVendorId") as string) || null,
      operatorContactId: (formData.get("operatorContactId") as string) || null,
      notes: (formData.get("notes") as string) || null,
      sortOrder: (_max.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function updateEquipmentItem(id: string, cateringOrderId: string, eventId: string, formData: FormData) {
  await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  const equipmentId = (formData.get("equipmentId") as string) || null;
  const item = await resolveEquipmentName(equipmentId, (formData.get("item") as string) || "");

  await prisma.equipmentItem.update({
    where: { id, cateringOrder: { eventId } },
    data: {
      equipmentId,
      item,
      quantity: formData.get("quantity") ? parseInt(formData.get("quantity") as string) : null,
      providerVendorId: (formData.get("providerVendorId") as string) || null,
      providerContactId: (formData.get("providerContactId") as string) || null,
      operatorVendorId: (formData.get("operatorVendorId") as string) || null,
      operatorContactId: (formData.get("operatorContactId") as string) || null,
      notes: (formData.get("notes") as string) || null,
    },
  });

  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function deleteEquipmentItem(id: string, cateringOrderId: string, eventId: string) {
  await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await prisma.equipmentItem.delete({ where: { id, cateringOrder: { eventId } } });
  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function createCateringOrderLineItem(cateringOrderId: string, eventId: string, formData: FormData) {
  await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await assertCateringOrderInEvent(cateringOrderId, eventId);
  const { _max } = await prisma.cateringOrderLineItem.aggregate({ where: { cateringOrderId }, _max: { sortOrder: true } });

  await prisma.cateringOrderLineItem.create({
    data: {
      cateringOrderId,
      description: formData.get("description") as string,
      unitType: (formData.get("unitType") as string) || null,
      unitPrice: (formData.get("unitPrice") as string) ? parseFloat(formData.get("unitPrice") as string) : null,
      quantity: formData.get("quantity") ? parseInt(formData.get("quantity") as string) : null,
      notes: (formData.get("notes") as string) || null,
      sortOrder: (_max.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function updateCateringOrderLineItem(id: string, cateringOrderId: string, eventId: string, formData: FormData) {
  await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await prisma.cateringOrderLineItem.update({
    where: { id, cateringOrder: { eventId } },
    data: {
      description: formData.get("description") as string,
      unitType: (formData.get("unitType") as string) || null,
      unitPrice: (formData.get("unitPrice") as string) ? parseFloat(formData.get("unitPrice") as string) : null,
      quantity: formData.get("quantity") ? parseInt(formData.get("quantity") as string) : null,
      notes: (formData.get("notes") as string) || null,
    },
  });

  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function deleteCateringOrderLineItem(id: string, cateringOrderId: string, eventId: string) {
  await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await prisma.cateringOrderLineItem.delete({ where: { id, cateringOrder: { eventId } } });
  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function createCateringOrderMenuSection(cateringOrderId: string, eventId: string, formData: FormData) {
  await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await assertCateringOrderInEvent(cateringOrderId, eventId);
  const { _max } = await prisma.cateringOrderMenuSection.aggregate({ where: { cateringOrderId }, _max: { sortOrder: true } });

  await prisma.cateringOrderMenuSection.create({
    data: {
      cateringOrderId,
      responsiblePartyVendorId: (formData.get("responsiblePartyVendorId") as string) || null,
      menuContent: formData.get("menuContent") as string,
      notes: (formData.get("notes") as string) || null,
      sortOrder: (_max.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function updateCateringOrderMenuSection(id: string, cateringOrderId: string, eventId: string, formData: FormData) {
  await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await prisma.cateringOrderMenuSection.update({
    where: { id, cateringOrder: { eventId } },
    data: {
      responsiblePartyVendorId: (formData.get("responsiblePartyVendorId") as string) || null,
      menuContent: formData.get("menuContent") as string,
      notes: (formData.get("notes") as string) || null,
    },
  });

  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function deleteCateringOrderMenuSection(id: string, cateringOrderId: string, eventId: string) {
  await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await prisma.cateringOrderMenuSection.delete({ where: { id, cateringOrder: { eventId } } });
  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function addCateringOrderContact(cateringOrderId: string, eventId: string, formData: FormData) {
  await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await assertCateringOrderInEvent(cateringOrderId, eventId);
  const contactId = formData.get("contactId") as string;
  const role = formData.get("role") as string;

  await prisma.cateringOrderContact.create({
    data: {
      cateringOrderId,
      contactId,
      role: role || null,
    },
  });

  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function updateCateringOrderContact(id: string, cateringOrderId: string, eventId: string, formData: FormData) {
  await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await prisma.cateringOrderContact.update({
    where: { id, cateringOrder: { eventId } },
    data: { role: (formData.get("role") as string) || null },
  });

  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function removeCateringOrderContact(id: string, cateringOrderId: string, eventId: string) {
  await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await prisma.cateringOrderContact.delete({ where: { id, cateringOrder: { eventId } } });
  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function createAndAddCateringOrderContact(cateringOrderId: string, eventId: string, formData: FormData) {
  await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await assertCateringOrderInEvent(cateringOrderId, eventId);
  const firstName = formData.get("firstName") as string;
  const lastName = formData.get("lastName") as string;
  const email = formData.get("email") as string;
  const organization = formData.get("organization") as string;
  const role = formData.get("role") as string;

  const contact = await prisma.contact.create({
    data: {
      firstName,
      lastName,
      email: email || null,
      organization: organization || null,
    },
  });

  await prisma.cateringOrderContact.create({
    data: { cateringOrderId, contactId: contact.id, role: role || null },
  });

  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function searchContactsForCateringOrder(query: string) {
  await requirePermission("CONTACTS", "VIEW");
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

export async function deleteCateringOrders(ids: string[], eventId: string) {
  await requirePermission("CATERING_ORDERS", "DELETE", eventId);
  await prisma.cateringOrder.deleteMany({ where: { id: { in: ids }, eventId } });
  revalidatePath(`/events/${eventId}/catering-orders`);
}

export async function bulkUpdateCateringOrders(
  ids: string[],
  eventId: string,
  updates: { status?: EntityStatus; substatus?: string | null; vendorId?: string }
) {
  await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  const { status, substatus, vendorId } = updates;

  if (status !== undefined || substatus !== undefined) {
    await prisma.cateringOrder.updateMany({
      where: { id: { in: ids }, eventId },
      data: {
        ...(status !== undefined ? { status } : {}),
        ...(substatus !== undefined ? { substatus } : {}),
      },
    });
  }

  if (vendorId) {
    await prisma.cateringOrderVendor.deleteMany({ where: { cateringOrderId: { in: ids }, cateringOrder: { eventId } } });
    await prisma.cateringOrderVendor.createMany({ data: ids.map((id) => ({ cateringOrderId: id, vendorId })) });
  }

  revalidatePath(`/events/${eventId}/catering-orders`);
}
