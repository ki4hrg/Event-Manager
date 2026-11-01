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
import { formId, formInt, formName, formNote, formNumber, formRequiredId, formValue, parseWhole } from "@/lib/validation";
import { UserFacingError } from "@/lib/userErrors";

export async function getCateringOrders(eventId: string) {
  await requirePermission("CATERING_ORDERS", "VIEW", eventId);
  const orders = await prisma.cateringOrder.findMany({
    where: { eventId },
    include: {
      function: {
        select: {
          id: true,
          name: true,
          functionNumber: true,
          breakoutGroup: { select: { name: true } },
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
          breakoutGroup: { select: { name: true } },
        },
      },
      timelineItems: { orderBy: [{ sortOrder: "asc" }, { startTime: "asc" }] },
      equipmentItems: { include: { equipment: true, providerVendor: true, providerContact: true, operatorVendor: true, operatorContact: true }, orderBy: [{ sortOrder: "asc" }, { item: "asc" }] },
      lineItems: { orderBy: [{ sortOrder: "asc" }, { description: "asc" }] },
      dietaryCounts: { orderBy: { sortOrder: "asc" } },
      menuSections: { include: { responsiblePartyVendor: true }, orderBy: [{ sortOrder: "asc" }] },
      additionalServiceLocations: {
        include: {
          function: {
            select: {
              id: true,
              name: true,
              functionNumber: true,
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
      name: formName(formData, "name"),
      functionId: formId(formData, "functionId"),
      serviceStyle: formNote(formData, "serviceStyle"),
      mealType: formNote(formData, "mealType"),
      expectedCount: formInt(formData, "expectedCount", { min: 0 }),
      confirmedCount: formInt(formData, "confirmedCount", { min: 0 }),
      guaranteeCount: formInt(formData, "guaranteeCount", { min: 0 }),
      staffingNotes: formNote(formData, "staffingNotes"),
      rentalMinimum: formNumber(formData, "rentalMinimum"),
      fbMinimum: formNumber(formData, "fbMinimum"),
      depositDeadline: parseDateField(formValue(formData, "depositDeadline")),
      guaranteeDeadline: parseDateField(formValue(formData, "guaranteeDeadline")),
      paymentDeadline: parseDateField(formValue(formData, "paymentDeadline")),
      cancellationTerms: formNote(formData, "cancellationTerms"),
      dietaryNotes: formNote(formData, "dietaryNotes"),
      notes: formNote(formData, "notes"),
      vendorId: formId(formData, "vendorId"),
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
      name: formName(formData, "name"),
      serviceStyle: formNote(formData, "serviceStyle"),
      mealType: formNote(formData, "mealType"),
      notes: formNote(formData, "notes"),
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
      expectedCount: formInt(formData, "expectedCount", { min: 0 }),
      confirmedCount: formInt(formData, "confirmedCount", { min: 0 }),
      guaranteeCount: formInt(formData, "guaranteeCount", { min: 0 }),
      actualCount: formInt(formData, "actualCount", { min: 0 }),
    },
    session.user.id,
  );
  revalidatePath(`/events/${eventId}/catering-orders/${id}`);
  redirect(`/events/${eventId}/catering-orders/${id}?tab=overview&success=Saved`);
}

// Parallel dietaryLabel / dietaryCount inputs, one pair per dietary need.
function readDietaryCounts(formData: FormData) {
  const text = (v: FormDataEntryValue) => (typeof v === "string" ? v : "");
  const counts = formData.getAll("dietaryCount").map(text);
  const labels = formData.getAll("dietaryLabel").map(text);
  if (labels.length > 200 || labels.some((l) => l.length > 1_000)) throw new UserFacingError("Too many or too long dietary labels");
  return labels.map((label, i) => {
    const raw = counts[i]?.trim();
    return { label, count: raw ? parseWhole(raw, "Dietary count", { min: 0, max: 1_000_000 }) : 0 };
  });
}

export async function updateCateringOrderService(id: string, eventId: string, formData: FormData) {
  const session = await requirePermission("CATERING_ORDERS", "WRITE", eventId);
  await updateCateringOrderCore(
    id,
    eventId,
    {
      dietaryNotes: formNote(formData, "dietaryNotes"),
      staffingNotes: formNote(formData, "staffingNotes"),
      dietaryCounts: readDietaryCounts(formData),
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
      depositDeadline: parseDateField(formValue(formData, "depositDeadline")),
      guaranteeDeadline: parseDateField(formValue(formData, "guaranteeDeadline")),
      paymentDeadline: parseDateField(formValue(formData, "paymentDeadline")),
      rentalMinimum: formNumber(formData, "rentalMinimum"),
      fbMinimum: formNumber(formData, "fbMinimum"),
      cancellationTerms: formNote(formData, "cancellationTerms"),
      notes: formNote(formData, "notes"),
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
    label: formValue(formData, "label"),
    startTime: formValue(formData, "startTime"),
    endTime: formNote(formData, "endTime"),
    notes: formNote(formData, "notes"),
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
    equipmentId: formId(formData, "equipmentId"),
    item: formValue(formData, "item"),
    quantity: formInt(formData, "quantity", { min: 0 }),
    providerVendorId: formId(formData, "providerVendorId"),
    providerContactId: formId(formData, "providerContactId"),
    operatorVendorId: formId(formData, "operatorVendorId"),
    operatorContactId: formId(formData, "operatorContactId"),
    notes: formNote(formData, "notes"),
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
    description: formValue(formData, "description"),
    unitType: formNote(formData, "unitType"),
    unitPrice: formNumber(formData, "unitPrice"),
    quantity: formInt(formData, "quantity", { min: 0 }),
    notes: formNote(formData, "notes"),
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
    responsiblePartyVendorId: formId(formData, "responsiblePartyVendorId"),
    menuContent: formValue(formData, "menuContent"),
    notes: formNote(formData, "notes"),
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
  return {
    name: formNote(formData, "name"),
    functionId: formId(formData, "functionId"),
    expectedCount: formInt(formData, "expectedCount", { min: 0 }),
    notes: formNote(formData, "notes"),
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
  function: { select: { id: true, name: true, functionNumber: true, breakoutGroup: { select: { name: true } } } },
  vendors: { include: { vendor: { select: { id: true, name: true } } } },
  additionalServiceLocations: {
    include: {
      function: { select: { id: true, name: true, functionNumber: true, breakoutGroup: { select: { name: true } } } },
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
    formRequiredId(formData, "contactId", "contact"),
    formNote(formData, "role"),
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
    formNote(formData, "role"),
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
      firstName: formValue(formData, "firstName"),
      lastName: formValue(formData, "lastName"),
      email: formNote(formData, "email"),
      organization: formNote(formData, "organization"),
      role: formNote(formData, "role"),
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
