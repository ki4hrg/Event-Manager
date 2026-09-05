"use server";

import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { compareByMainFunctionTime } from "@/lib/functionSchedules";
import {
  createCateringOrderCore,
  updateCateringOrderCore,
  deleteCateringOrderCore,
  deleteCateringOrdersCore,
  bulkUpdateCateringOrdersCore,
  linkCateringOrderToFunctionCore,
  unlinkCateringOrderFromFunctionCore,
  unlinkCateringOrdersFromFunctionCore,
  createTimelineItemCore,
  updateTimelineItemCore,
  deleteTimelineItemCore,
  createCateringEquipmentItemCore,
  updateCateringEquipmentItemCore,
  deleteCateringEquipmentItemCore,
  createCateringOrderLineItemCore,
  updateCateringOrderLineItemCore,
  deleteCateringOrderLineItemCore,
  createCateringOrderMenuSectionCore,
  updateCateringOrderMenuSectionCore,
  deleteCateringOrderMenuSectionCore,
  createCateringOrderServiceLocationCore,
  updateCateringOrderServiceLocationCore,
  deleteCateringOrderServiceLocationCore,
  addCateringOrderContactCore,
  updateCateringOrderContactCore,
  removeCateringOrderContactCore,
  createAndAddCateringOrderContactCore,
  type TimelineItemWriteArgs,
  type CateringEquipmentItemWriteArgs,
  type LineItemWriteArgs,
  type MenuSectionWriteArgs,
  type ServiceLocationWriteArgs,
  type BulkCateringOrderUpdates,
} from "./core";

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
      function: {
        include: {
          schedules: { orderBy: { startTime: "asc" } },
          rooms: { include: { room: { select: { id: true, name: true } } } },
        },
      },
      timelineItems: { orderBy: [{ sortOrder: "asc" }, { startTime: "asc" }] },
      equipmentItems: { include: { equipment: true, providerVendor: true, providerContact: true, operatorVendor: true, operatorContact: true }, orderBy: [{ sortOrder: "asc" }, { item: "asc" }] },
      lineItems: { orderBy: [{ sortOrder: "asc" }, { description: "asc" }] },
      menuSections: { include: { responsiblePartyVendor: true }, orderBy: [{ sortOrder: "asc" }] },
      additionalServiceLocations: {
        include: {
          function: {
            select: {
              id: true,
              name: true,
              breakoutGroup: { select: { name: true } },
              rooms: { include: { room: { select: { id: true, name: true } } } },
            },
          },
        },
        orderBy: [{ sortOrder: "asc" }],
      },
      contacts: { include: { contact: true }, orderBy: { id: "asc" } },
      updatedBy: { select: { name: true, email: true } },
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
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  const cateringOrder = await createCateringOrderCore(
    eventId,
    {
      name: formData.get("name") as string,
      functionId: (formData.get("functionId") as string) || null,
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
      vendorId: (formData.get("vendorId") as string) || null,
    },
    session.user.id,
  );

  revalidatePath(`/events/${eventId}/catering-orders`);
  redirect(`/events/${eventId}/catering-orders/${cateringOrder.id}`);
}

export async function updateCateringOrderDetails(id: string, eventId: string, formData: FormData) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await updateCateringOrderCore(
    id,
    eventId,
    {
      name: formData.get("name") as string,
      serviceStyle: (formData.get("serviceStyle") as string) || null,
      notes: (formData.get("notes") as string) || null,
    },
    session.user.id,
  );
  revalidatePath(`/events/${eventId}/catering-orders/${id}`);
  redirect(`/events/${eventId}/catering-orders/${id}?tab=overview&success=Saved`);
}

export async function updateCateringOrderGuestCounts(id: string, eventId: string, formData: FormData) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await updateCateringOrderCore(
    id,
    eventId,
    {
      expectedCount: formData.get("expectedCount") ? parseInt(formData.get("expectedCount") as string) : null,
      confirmedCount: formData.get("confirmedCount") ? parseInt(formData.get("confirmedCount") as string) : null,
      guaranteeCount: formData.get("guaranteeCount") ? parseInt(formData.get("guaranteeCount") as string) : null,
    },
    session.user.id,
  );
  revalidatePath(`/events/${eventId}/catering-orders/${id}`);
  redirect(`/events/${eventId}/catering-orders/${id}?tab=overview&success=Saved`);
}

export async function updateCateringOrderService(id: string, eventId: string, formData: FormData) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await updateCateringOrderCore(
    id,
    eventId,
    {
      dietaryNotes: (formData.get("dietaryNotes") as string) || null,
      staffingNotes: (formData.get("staffingNotes") as string) || null,
    },
    session.user.id,
  );
  revalidatePath(`/events/${eventId}/catering-orders/${id}`);
  redirect(`/events/${eventId}/catering-orders/${id}?tab=service&success=Saved`);
}

export async function updateCateringOrderContract(id: string, eventId: string, formData: FormData) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await updateCateringOrderCore(
    id,
    eventId,
    {
      depositDeadline: parseDateField(formData.get("depositDeadline") as string),
      guaranteeDeadline: parseDateField(formData.get("guaranteeDeadline") as string),
      paymentDeadline: parseDateField(formData.get("paymentDeadline") as string),
      rentalMinimum: (formData.get("rentalMinimum") as string) ? parseFloat(formData.get("rentalMinimum") as string) : null,
      fbMinimum: (formData.get("fbMinimum") as string) ? parseFloat(formData.get("fbMinimum") as string) : null,
      cancellationTerms: (formData.get("cancellationTerms") as string) || null,
      notes: (formData.get("notes") as string) || null,
    },
    session.user.id,
  );
  revalidatePath(`/events/${eventId}/catering-orders/${id}`);
  redirect(`/events/${eventId}/catering-orders/${id}?tab=contract&success=Saved`);
}

export async function deleteCateringOrder(id: string, eventId: string) {
  const session = await requirePermission("CATERING_ORDERS", "DELETE", eventId);
  await deleteCateringOrderCore(id, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/catering-orders`);
  redirect(`/events/${eventId}/catering-orders`);
}

export async function linkCateringOrderToFunction(cateringOrderId: string, functionId: string, eventId: string) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await linkCateringOrderToFunctionCore(cateringOrderId, functionId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function unlinkCateringOrderFromFunction(cateringOrderId: string, eventId: string) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  const { previousFunctionId } = await unlinkCateringOrderFromFunctionCore(cateringOrderId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
  if (previousFunctionId) {
    revalidatePath(`/events/${eventId}/functions/${previousFunctionId}`);
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
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await linkCateringOrderToFunctionCore(cateringOrderId, functionId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function unlinkCateringOrderFromFunctionPage(functionId: string, eventId: string) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await unlinkCateringOrdersFromFunctionCore(functionId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

function parseTimelineItemData(formData: FormData): TimelineItemWriteArgs {
  return {
    label: formData.get("label") as string,
    startTime: formData.get("startTime") as string,
    endTime: (formData.get("endTime") as string) || null,
    notes: (formData.get("notes") as string) || null,
  };
}

export async function createTimelineItem(cateringOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await createTimelineItemCore(cateringOrderId, eventId, parseTimelineItemData(formData), session.user.id);
  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function updateTimelineItem(id: string, cateringOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await updateTimelineItemCore(id, cateringOrderId, eventId, parseTimelineItemData(formData), session.user.id);
  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function deleteTimelineItem(id: string, cateringOrderId: string, eventId: string) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await deleteTimelineItemCore(id, cateringOrderId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

function parseEquipmentItemData(formData: FormData): CateringEquipmentItemWriteArgs {
  return {
    equipmentId: (formData.get("equipmentId") as string) || null,
    item: (formData.get("item") as string) || "",
    quantity: formData.get("quantity") ? parseInt(formData.get("quantity") as string) : null,
    providerVendorId: (formData.get("providerVendorId") as string) || null,
    providerContactId: (formData.get("providerContactId") as string) || null,
    operatorVendorId: (formData.get("operatorVendorId") as string) || null,
    operatorContactId: (formData.get("operatorContactId") as string) || null,
    notes: (formData.get("notes") as string) || null,
  };
}

export async function createEquipmentItem(cateringOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await createCateringEquipmentItemCore(cateringOrderId, eventId, parseEquipmentItemData(formData), session.user.id);
  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function updateEquipmentItem(id: string, cateringOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await updateCateringEquipmentItemCore(id, cateringOrderId, eventId, parseEquipmentItemData(formData), session.user.id);
  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function deleteEquipmentItem(id: string, cateringOrderId: string, eventId: string) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await deleteCateringEquipmentItemCore(id, cateringOrderId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

function parseLineItemData(formData: FormData): LineItemWriteArgs {
  return {
    description: formData.get("description") as string,
    unitType: (formData.get("unitType") as string) || null,
    unitPrice: (formData.get("unitPrice") as string) ? parseFloat(formData.get("unitPrice") as string) : null,
    quantity: formData.get("quantity") ? parseInt(formData.get("quantity") as string) : null,
    notes: (formData.get("notes") as string) || null,
  };
}

export async function createCateringOrderLineItem(cateringOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await createCateringOrderLineItemCore(cateringOrderId, eventId, parseLineItemData(formData), session.user.id);
  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function updateCateringOrderLineItem(id: string, cateringOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await updateCateringOrderLineItemCore(id, cateringOrderId, eventId, parseLineItemData(formData), session.user.id);
  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function deleteCateringOrderLineItem(id: string, cateringOrderId: string, eventId: string) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await deleteCateringOrderLineItemCore(id, cateringOrderId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

function parseMenuSectionData(formData: FormData): MenuSectionWriteArgs {
  return {
    responsiblePartyVendorId: (formData.get("responsiblePartyVendorId") as string) || null,
    menuContent: formData.get("menuContent") as string,
    notes: (formData.get("notes") as string) || null,
  };
}

export async function createCateringOrderMenuSection(cateringOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await createCateringOrderMenuSectionCore(cateringOrderId, eventId, parseMenuSectionData(formData), session.user.id);
  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function updateCateringOrderMenuSection(id: string, cateringOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await updateCateringOrderMenuSectionCore(id, cateringOrderId, eventId, parseMenuSectionData(formData), session.user.id);
  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function deleteCateringOrderMenuSection(id: string, cateringOrderId: string, eventId: string) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await deleteCateringOrderMenuSectionCore(id, cateringOrderId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

function parseServiceLocationData(formData: FormData): ServiceLocationWriteArgs {
  const rawFunctionId = formData.get("functionId") as string | null;
  const rawExpectedCount = formData.get("expectedCount") as string | null;
  return {
    name: ((formData.get("name") as string) || "").trim() || null,
    functionId: rawFunctionId && rawFunctionId !== "__blank__" ? rawFunctionId : null,
    expectedCount: rawExpectedCount ? parseInt(rawExpectedCount) : null,
    notes: (formData.get("notes") as string) || null,
  };
}

export async function createCateringOrderServiceLocation(cateringOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await createCateringOrderServiceLocationCore(cateringOrderId, eventId, parseServiceLocationData(formData), session.user.id);
  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function updateCateringOrderServiceLocation(id: string, cateringOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await updateCateringOrderServiceLocationCore(id, cateringOrderId, eventId, parseServiceLocationData(formData), session.user.id);
  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function deleteCateringOrderServiceLocation(id: string, cateringOrderId: string, eventId: string) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await deleteCateringOrderServiceLocationCore(id, cateringOrderId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

const cateringOrderForFunctionInclude = {
  function: { select: { id: true, name: true, breakoutGroup: { select: { name: true } } } },
  vendors: { include: { vendor: { select: { id: true, name: true } } } },
  additionalServiceLocations: {
    include: {
      function: { select: { id: true, name: true } },
    },
  },
} as const;

type CateringOrderForFunction = Prisma.CateringOrderGetPayload<{ include: typeof cateringOrderForFunctionInclude }>;

export type CateringOrderForFunctionEntry = {
  order: CateringOrderForFunction;
  via: "PRIMARY" | "ADDITIONAL_LOCATION";
  location: CateringOrderForFunction["additionalServiceLocations"][number] | null;
};

export async function getCateringOrdersForFunction(functionId: string, eventId: string): Promise<CateringOrderForFunctionEntry[]> {
  await requirePermission("CATERING_ORDERS", "VIEW", eventId);

  const orders = await prisma.cateringOrder.findMany({
    where: {
      eventId,
      OR: [
        { functionId },
        { additionalServiceLocations: { some: { functionId } } },
      ],
    },
    include: cateringOrderForFunctionInclude,
  });

  return orders.flatMap<CateringOrderForFunctionEntry>((order) => {
    if (order.functionId === functionId) {
      return [{ order, via: "PRIMARY", location: null }];
    }
    return order.additionalServiceLocations
      .filter((loc) => loc.functionId === functionId)
      .map((location) => ({ order, via: "ADDITIONAL_LOCATION" as const, location }));
  });
}

export async function addCateringOrderContact(cateringOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await addCateringOrderContactCore(
    cateringOrderId,
    eventId,
    formData.get("contactId") as string,
    (formData.get("role") as string) || null,
    session.user.id,
  );
  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function updateCateringOrderContact(id: string, cateringOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await updateCateringOrderContactCore(
    id,
    cateringOrderId,
    eventId,
    (formData.get("role") as string) || null,
    session.user.id,
  );
  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function removeCateringOrderContact(id: string, cateringOrderId: string, eventId: string) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await removeCateringOrderContactCore(id, cateringOrderId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function createAndAddCateringOrderContact(cateringOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await createAndAddCateringOrderContactCore(
    {
      cateringOrderId,
      eventId,
      firstName: formData.get("firstName") as string,
      lastName: formData.get("lastName") as string,
      email: (formData.get("email") as string) || null,
      organization: (formData.get("organization") as string) || null,
      role: (formData.get("role") as string) || null,
    },
    session.user.id,
  );
  revalidatePath(`/events/${eventId}/catering-orders/${cateringOrderId}`);
}

export async function searchContactsForCateringOrder(query: string) {
  const session = await requirePermission("CONTACTS", "VIEW");
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

export async function deleteCateringOrders(ids: string[], eventId: string) {
  const session = await requirePermission("CATERING_ORDERS", "DELETE", eventId);
  await deleteCateringOrdersCore(ids, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/catering-orders`);
}

export async function bulkUpdateCateringOrders(
  ids: string[],
  eventId: string,
  updates: BulkCateringOrderUpdates,
) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await bulkUpdateCateringOrdersCore(ids, eventId, updates, session.user.id);
  revalidatePath(`/events/${eventId}/catering-orders`);
}
