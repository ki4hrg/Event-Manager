"use server";

import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AcquisitionState, PackingStatus } from "@prisma/client";
import {
  createSupplyOrderCore,
  updateSupplyOrderCore,
  deleteSupplyOrderCore,
  deleteSupplyOrdersCore,
  bulkUpdateSupplyOrdersCore,
  bulkSetSupplyOrderItemsPackingStatusCore,
  bulkSetSupplyOrderItemsAcquisitionStateCore,
  linkSupplyOrderToFunctionCore,
  unlinkSupplyOrderFromFunctionCore,
  linkSupplyOrderToPresentationCore,
  unlinkSupplyOrderFromPresentationCore,
  createSupplyOrderItemCore,
  updateSupplyOrderItemCore,
  deleteSupplyOrderItemCore,
  updateSupplyOrderItemPackingStatusCore,
  updateSupplyOrderItemAcquisitionStateCore,
  type SupplyItemWriteArgs,
  type BulkSupplyOrderUpdates,
} from "./core";
import { formEnum, formId, formInt, formNote, formValue } from "@/lib/validation";

export async function getSupplyOrders(eventId: string) {
  await requirePermission("SUPPLY_ORDERS", "VIEW", eventId);
  return prisma.supplyOrder.findMany({
    where: { eventId },
    include: {
      room: { select: { id: true, name: true } },
      items: { select: { id: true, packingStatus: true, acquisitionState: true } },
      functions: { include: { function: { select: { id: true, name: true, functionNumber: true, breakoutGroup: { select: { name: true } } } } } },
      presentations: { include: { presentation: { select: { id: true, title: true } } } },
      providerVendor: { select: { id: true, name: true } },
      providerContact: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getSupplyOrder(id: string) {
  const row = await prisma.supplyOrder.findUnique({
    where: { id },
    include: {
      room: { select: { id: true, name: true } },
      providerVendor: { select: { id: true, name: true } },
      providerContact: { select: { id: true, firstName: true, lastName: true } },
      functions: {
        include: {
          function: {
            include: {
              schedules: { orderBy: { startTime: "asc" } },
              contacts: { include: { contact: true } },
              breakoutGroup: { select: { name: true } },
            },
          },
        },
        orderBy: { function: { name: "asc" } },
      },
      presentations: {
        include: {
          presentation: {
            select: {
              id: true,
              title: true,
              eventId: true,
              speakers: { include: { contact: true }, orderBy: { sortOrder: "asc" } },
            },
          },
        },
        orderBy: { presentation: { title: "asc" } },
      },
      items: {
        include: {
          equipment: true,
          sourceLocation: { select: { id: true, name: true, kind: true } },
          containerLocation: { select: { id: true, name: true, kind: true, type: true } },
          providerVendor: { select: { id: true, name: true } },
          providerContact: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      },
      files: { orderBy: { createdAt: "asc" } },
      updatedBy: { select: { name: true, email: true } },
    },
  });
  if (!row) return null;
  await requirePermission("SUPPLY_ORDERS", "VIEW", row.eventId);
  return row;
}

export async function createSupplyOrder(eventId: string, formData: FormData) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  const functionId = formId(formData, "functionId");
  const presentationId = formId(formData, "presentationId");
  const supplyOrder = await createSupplyOrderCore(
    eventId,
    {
      name: formValue(formData, "name")?.trim(),
      roomId: formId(formData, "roomId"),
      specificLocation: formNote(formData, "specificLocation"),
      notes: formNote(formData, "notes"),
      providerVendorId: formId(formData, "providerVendorId"),
      providerContactId: formId(formData, "providerContactId"),
      functionId,
      presentationId,
    },
    session.user.id,
  );

  if (functionId) revalidatePath(`/events/${eventId}/functions/${functionId}`);
  if (presentationId) revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
  revalidatePath(`/events/${eventId}/supply-orders`);
  redirect(`/events/${eventId}/supply-orders/${supplyOrder.id}?success=Supply Order created`);
}

export async function updateSupplyOrder(id: string, eventId: string, formData: FormData) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  await updateSupplyOrderCore(
    id,
    eventId,
    {
      name: formValue(formData, "name")?.trim(),
      roomId: formId(formData, "roomId"),
      specificLocation: formNote(formData, "specificLocation"),
      notes: formNote(formData, "notes"),
      providerVendorId: formId(formData, "providerVendorId"),
      providerContactId: formId(formData, "providerContactId"),
    },
    session.user.id,
  );
  revalidatePath(`/events/${eventId}/supply-orders`);
  revalidatePath(`/events/${eventId}/supply-orders/${id}`);
  redirect(`/events/${eventId}/supply-orders/${id}?success=Supply Order updated`);
}

export async function deleteSupplyOrder(id: string, eventId: string) {
  const session = await requirePermission("SUPPLY_ORDERS", "DELETE", eventId);
  await deleteSupplyOrderCore(id, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/supply-orders`);
  redirect(`/events/${eventId}/supply-orders`);
}

export async function deleteSupplyOrders(ids: string[], eventId: string) {
  const session = await requirePermission("SUPPLY_ORDERS", "DELETE", eventId);
  await deleteSupplyOrdersCore(ids, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/supply-orders`);
}

export async function bulkSetSupplyOrderItemsPackingStatus(
  supplyOrderId: string,
  eventId: string,
  packingStatus: PackingStatus,
  packingSubstatus?: string | null,
) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  await bulkSetSupplyOrderItemsPackingStatusCore(supplyOrderId, eventId, packingStatus, session.user.id, packingSubstatus);
  revalidatePath(`/events/${eventId}/supply-orders/${supplyOrderId}`);
  revalidatePath(`/events/${eventId}/packing`);
}

export async function bulkSetSupplyOrderItemsAcquisitionState(
  supplyOrderId: string,
  eventId: string,
  acquisitionState: AcquisitionState,
) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  await bulkSetSupplyOrderItemsAcquisitionStateCore(supplyOrderId, eventId, acquisitionState, session.user.id);
  revalidatePath(`/events/${eventId}/supply-orders/${supplyOrderId}`);
  revalidatePath(`/events/${eventId}/packing`);
}

// Function link/unlink (many-to-many via junction)
export async function linkSupplyOrderToFunction(supplyOrderId: string, functionId: string, eventId: string) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  await linkSupplyOrderToFunctionCore(supplyOrderId, functionId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/supply-orders/${supplyOrderId}`);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function unlinkSupplyOrderFromFunction(supplyOrderId: string, functionId: string, eventId: string) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  await unlinkSupplyOrderFromFunctionCore(supplyOrderId, functionId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/supply-orders/${supplyOrderId}`);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

// Presentation link/unlink (many-to-many via junction)
export async function linkSupplyOrderToPresentation(supplyOrderId: string, presentationId: string, eventId: string) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  await linkSupplyOrderToPresentationCore(supplyOrderId, presentationId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/supply-orders/${supplyOrderId}`);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function unlinkSupplyOrderFromPresentation(supplyOrderId: string, presentationId: string, eventId: string) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  await unlinkSupplyOrderFromPresentationCore(supplyOrderId, presentationId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/supply-orders/${supplyOrderId}`);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

// "From parent" variants — revalidate the parent path (function or presentation)
// instead of the supply order, since they're invoked from the parent's detail page.
export async function linkSupplyOrderToFunctionFromFunction(
  supplyOrderId: string,
  functionId: string,
  eventId: string,
) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  await linkSupplyOrderToFunctionCore(supplyOrderId, functionId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function unlinkSupplyOrderFromFunctionPage(
  supplyOrderId: string,
  functionId: string,
  eventId: string,
) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  await unlinkSupplyOrderFromFunctionCore(supplyOrderId, functionId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function linkSupplyOrderToPresentationFromPresentation(
  supplyOrderId: string,
  presentationId: string,
  eventId: string,
) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  await linkSupplyOrderToPresentationCore(supplyOrderId, presentationId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function unlinkSupplyOrderFromPresentationPage(
  supplyOrderId: string,
  presentationId: string,
  eventId: string,
) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  await unlinkSupplyOrderFromPresentationCore(supplyOrderId, presentationId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function getAvailableSupplyOrdersForFunction(eventId: string, functionId: string) {
  await requirePermission("SUPPLY_ORDERS", "VIEW", eventId);
  return prisma.supplyOrder.findMany({
    where: { eventId, functions: { none: { functionId } } },
    include: {
      room: { select: { id: true, name: true } },
      providerVendor: { select: { id: true, name: true } },
      providerContact: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { name: "asc" },
  });
}

export async function getAvailableSupplyOrdersForPresentation(eventId: string, presentationId: string) {
  await requirePermission("SUPPLY_ORDERS", "VIEW", eventId);
  return prisma.supplyOrder.findMany({
    where: { eventId, presentations: { none: { presentationId } } },
    include: {
      room: { select: { id: true, name: true } },
      providerVendor: { select: { id: true, name: true } },
      providerContact: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { name: "asc" },
  });
}

function parseSupplyItemData(formData: FormData): SupplyItemWriteArgs {
  return {
    description: formNote(formData, "description"),
    equipmentId: formId(formData, "equipmentId"),
    quantity: formInt(formData, "quantity", { min: 0 }),
    acquisitionState: formEnum(formData, "acquisitionState", AcquisitionState, "ON_HAND"),
    providerVendorId: formId(formData, "providerVendorId"),
    providerContactId: formId(formData, "providerContactId"),
    packingStatus: formEnum(formData, "packingStatus", PackingStatus, "NEEDED"),
    // Absent when the status has no sub-states: kept only while the status stays put.
    packingSubstatus: formData.has("packingSubstatus") ? formNote(formData, "packingSubstatus") : undefined,
    notes: formNote(formData, "notes"),
    sourceLocationId: formId(formData, "sourceLocationId"),
    containerLocationId: formId(formData, "containerLocationId"),
    // Not a form field: provenance is written by the location-side bridge and by
    // a post-event repack, never typed. Editing a line by hand clears it, which
    // is right — the description no longer necessarily describes that inventory.
    inventoryItemId: null,
  };
}

export async function createSupplyOrderItem(supplyOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  await createSupplyOrderItemCore(supplyOrderId, eventId, parseSupplyItemData(formData), session.user.id);
  revalidatePath(`/events/${eventId}/supply-orders/${supplyOrderId}`);
}

export async function updateSupplyOrderItem(id: string, supplyOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  await updateSupplyOrderItemCore(id, supplyOrderId, eventId, parseSupplyItemData(formData), session.user.id);
  revalidatePath(`/events/${eventId}/supply-orders/${supplyOrderId}`);
}

export async function deleteSupplyOrderItem(id: string, supplyOrderId: string, eventId: string) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  await deleteSupplyOrderItemCore(id, supplyOrderId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/supply-orders/${supplyOrderId}`);
}

export async function updateSupplyOrderItemPackingStatus(
  id: string,
  supplyOrderId: string,
  eventId: string,
  packingStatus: PackingStatus,
  packingSubstatus?: string | null,
) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  await updateSupplyOrderItemPackingStatusCore(id, supplyOrderId, eventId, packingStatus, session.user.id, packingSubstatus);
  revalidatePath(`/events/${eventId}/supply-orders/${supplyOrderId}`);
  revalidatePath(`/events/${eventId}/packing`);
}

export async function updateSupplyOrderItemAcquisitionState(
  id: string,
  supplyOrderId: string,
  eventId: string,
  acquisitionState: AcquisitionState,
) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  await updateSupplyOrderItemAcquisitionStateCore(id, supplyOrderId, eventId, acquisitionState, session.user.id);
  revalidatePath(`/events/${eventId}/supply-orders/${supplyOrderId}`);
  revalidatePath(`/events/${eventId}/packing`);
}

export async function bulkUpdateSupplyOrders(
  ids: string[],
  eventId: string,
  updates: BulkSupplyOrderUpdates,
) {
  const session = await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  await bulkUpdateSupplyOrdersCore(ids, eventId, updates, session.user.id);
  revalidatePath(`/events/${eventId}/supply-orders`);
}
