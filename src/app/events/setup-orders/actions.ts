"use server";

import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createSetupOrderCore,
  updateSetupOrderCore,
  deleteSetupOrderCore,
  deleteSetupOrdersCore,
  duplicateSetupOrderCore,
  bulkUpdateSetupOrdersCore,
  linkSetupOrderToFunctionCore,
  unlinkSetupOrderFromFunctionCore,
  linkSetupOrderToPresentationCore,
  unlinkSetupOrderFromPresentationCore,
  createSetupTableCore,
  updateSetupTableCore,
  deleteSetupTableCore,
  createSetupOrderDetailCore,
  updateSetupOrderDetailCore,
  deleteSetupOrderDetailCore,
  createSetupEquipmentItemCore,
  updateSetupEquipmentItemCore,
  deleteSetupEquipmentItemCore,
  type SetupTableWriteArgs,
  type SetupOrderDetailWriteArgs,
  type SetupEquipmentItemWriteArgs,
  type BulkSetupOrderUpdates,
} from "./core";
import { formId, formInt, formNote, formValue } from "@/lib/validation";
import { UserFacingError, withUserErrors } from "@/lib/userErrors";

export async function getSetupOrders(eventId: string) {
  await requirePermission("SETUP_ORDERS", "VIEW", eventId);
  const rows = await prisma.setupOrder.findMany({
    where: { eventId },
    include: {
      room: { select: { id: true, name: true } },
      functionLinks: { include: { function: { select: { id: true, name: true, functionNumber: true, breakoutGroup: { select: { name: true } } } } } },
      presentationLinks: { include: { presentation: { select: { id: true, title: true } } } },
      tables: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      equipmentItems: { orderBy: [{ sortOrder: "asc" }, { item: "asc" }] },
      vendors: { include: { vendor: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    ...r,
    functions: r.functionLinks.map((l) => l.function),
    presentations: r.presentationLinks.map((l) => l.presentation),
  }));
}

export async function getSetupOrder(id: string) {
  const row = await prisma.setupOrder.findUnique({
    where: { id },
    include: {
      room: true,
      functionLinks: {
        include: { function: { include: { schedules: { orderBy: { startTime: "asc" } }, breakoutGroup: { select: { name: true } } } } },
      },
      presentationLinks: { include: { presentation: { select: { id: true, title: true, eventId: true } } } },
      tables: { include: { providerVendor: { select: { id: true, name: true } } }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      details: { include: { responsiblePartyVendor: { select: { id: true, name: true } } }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      equipmentItems: { include: { equipment: true, providerVendor: true, providerContact: true, operatorVendor: true, operatorContact: true }, orderBy: [{ sortOrder: "asc" }, { item: "asc" }] },
      updatedBy: { select: { name: true, email: true } },
    },
  });
  if (!row) return null;
  await requirePermission("SETUP_ORDERS", "VIEW", row.eventId);
  const functions = row.functionLinks.map((l) => l.function).sort((a, b) => a.name.localeCompare(b.name));
  return {
    ...row,
    functions,
    presentations: row.presentationLinks.map((l) => l.presentation),
  };
}

export async function createSetupOrder(eventId: string, formData: FormData) {
  const session = await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  return withUserErrors(async () => {
    const functionId = formId(formData, "functionId");
    const presentationId = formId(formData, "presentationId");
    const setupOrder = await createSetupOrderCore(
      eventId,
      {
        name: formNote(formData, "name"),
        setupType: formNote(formData, "setupType"),
        notes: formNote(formData, "notes"),
        roomId: formId(formData, "roomId"),
        functionId,
        presentationId,
        vendorId: formId(formData, "vendorId"),
      },
      session.user.id,
    );

    if (functionId) revalidatePath(`/events/${eventId}/functions/${functionId}`);
    if (presentationId) revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
    revalidatePath(`/events/${eventId}/setup-orders`);
    redirect(`/events/${eventId}/setup-orders/${setupOrder.id}`);
  });
}

export async function updateSetupOrder(id: string, eventId: string, formData: FormData) {
  const session = await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  return withUserErrors(async () => {
    await updateSetupOrderCore(
      id,
      eventId,
      {
        name: formNote(formData, "name"),
        setupType: formNote(formData, "setupType"),
        notes: formNote(formData, "notes"),
        roomId: formId(formData, "roomId"),
      },
      session.user.id,
    );
    revalidatePath(`/events/${eventId}/setup-orders`);
    revalidatePath(`/events/${eventId}/setup-orders/${id}`);
    redirect(`/events/${eventId}/setup-orders/${id}?success=Setup Order updated`);
  });
}

export async function deleteSetupOrder(id: string, eventId: string) {
  const session = await requirePermission("SETUP_ORDERS", "DELETE", eventId);
  await deleteSetupOrderCore(id, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/setup-orders`);
  redirect(`/events/${eventId}/setup-orders`);
}

export async function duplicateSetupOrder(id: string, eventId: string) {
  const session = await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  const duplicate = await duplicateSetupOrderCore(id, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/setup-orders`);
  redirect(`/events/${eventId}/setup-orders/${duplicate.id}`);
}

// Link/unlink (M:N via SetupOrderFunction / SetupOrderPresentation)
export async function linkSetupOrderToFunction(setupOrderId: string, functionId: string, eventId: string) {
  const session = await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  await linkSetupOrderToFunctionCore(setupOrderId, functionId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function unlinkSetupOrderFromFunction(setupOrderId: string, functionId: string, eventId: string) {
  const session = await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  await unlinkSetupOrderFromFunctionCore(setupOrderId, functionId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function getAvailableSetupOrdersForFunction(eventId: string, functionId?: string) {
  await requirePermission("SETUP_ORDERS", "VIEW", eventId);
  return prisma.setupOrder.findMany({
    where: {
      eventId,
      ...(functionId ? { NOT: { functionLinks: { some: { functionId } } } } : {}),
    },
    include: { room: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function linkSetupOrderToFunctionFromFunction(
  setupOrderId: string,
  functionId: string,
  eventId: string
) {
  await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  return linkSetupOrderToFunction(setupOrderId, functionId, eventId);
}

export async function unlinkSetupOrderFromFunctionPage(setupOrderId: string, functionId: string, eventId: string) {
  await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  return unlinkSetupOrderFromFunction(setupOrderId, functionId, eventId);
}

export async function linkSetupOrderToPresentation(setupOrderId: string, presentationId: string, eventId: string) {
  const session = await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  await linkSetupOrderToPresentationCore(setupOrderId, presentationId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function unlinkSetupOrderFromPresentation(setupOrderId: string, presentationId: string, eventId: string) {
  const session = await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  await unlinkSetupOrderFromPresentationCore(setupOrderId, presentationId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function getAvailableSetupOrdersForPresentation(eventId: string, presentationId?: string) {
  await requirePermission("SETUP_ORDERS", "VIEW", eventId);
  return prisma.setupOrder.findMany({
    where: {
      eventId,
      ...(presentationId ? { NOT: { presentationLinks: { some: { presentationId } } } } : {}),
    },
    include: { room: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function linkSetupOrderToPresentationFromPresentation(
  setupOrderId: string,
  presentationId: string,
  eventId: string
) {
  await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  return linkSetupOrderToPresentation(setupOrderId, presentationId, eventId);
}

export async function unlinkSetupOrderFromPresentationPage(setupOrderId: string, presentationId: string, eventId: string) {
  await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  return unlinkSetupOrderFromPresentation(setupOrderId, presentationId, eventId);
}

// SetupTable CRUD
function requireQuantity(formData: FormData): number {
  const quantity = formInt(formData, "quantity", { min: 0 });
  if (quantity === null) throw new UserFacingError("Quantity is required");
  return quantity;
}

function parseSetupTableData(formData: FormData): SetupTableWriteArgs {
  return {
    // Required: a missing quantity used to become NaN.
    quantity: requireQuantity(formData),
    tableType: formNote(formData, "tableType"),
    chairCount: formInt(formData, "chairCount", { min: 0 }),
    chairType: formNote(formData, "chairType"),
    providerVendorId: formId(formData, "providerVendorId"),
    notes: formNote(formData, "notes"),
  };
}

export async function createSetupTable(setupOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  await createSetupTableCore(setupOrderId, eventId, parseSetupTableData(formData), session.user.id);
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

export async function updateSetupTable(id: string, setupOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  await updateSetupTableCore(id, setupOrderId, eventId, parseSetupTableData(formData), session.user.id);
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

export async function deleteSetupTable(id: string, setupOrderId: string, eventId: string) {
  const session = await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  await deleteSetupTableCore(id, setupOrderId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

// SetupOrderDetail CRUD
function parseSetupDetailData(formData: FormData): SetupOrderDetailWriteArgs {
  return {
    headline: formNote(formData, "headline"),
    description: formValue(formData, "description"),
    responsiblePartyVendorId: formId(formData, "responsiblePartyVendorId"),
  };
}

export async function createSetupOrderDetail(setupOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  await createSetupOrderDetailCore(setupOrderId, eventId, parseSetupDetailData(formData), session.user.id);
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

export async function updateSetupOrderDetail(id: string, setupOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  await updateSetupOrderDetailCore(id, setupOrderId, eventId, parseSetupDetailData(formData), session.user.id);
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

export async function deleteSetupOrderDetail(id: string, setupOrderId: string, eventId: string) {
  const session = await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  await deleteSetupOrderDetailCore(id, setupOrderId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

// EquipmentItem CRUD for Setup Orders
function parseSetupEquipmentItemData(formData: FormData): SetupEquipmentItemWriteArgs {
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

export async function createSetupEquipmentItem(setupOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  return withUserErrors(async () => {
    await createSetupEquipmentItemCore(setupOrderId, eventId, parseSetupEquipmentItemData(formData), session.user.id);
    revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
  });
}

export async function updateSetupEquipmentItem(id: string, setupOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  return withUserErrors(async () => {
    await updateSetupEquipmentItemCore(id, setupOrderId, eventId, parseSetupEquipmentItemData(formData), session.user.id);
    revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
  });
}

export async function deleteSetupEquipmentItem(id: string, setupOrderId: string, eventId: string) {
  const session = await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  await deleteSetupEquipmentItemCore(id, setupOrderId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

export async function deleteSetupOrders(ids: string[], eventId: string) {
  const session = await requirePermission("SETUP_ORDERS", "DELETE", eventId);
  await deleteSetupOrdersCore(ids, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/setup-orders`);
}

export async function bulkUpdateSetupOrders(
  ids: string[],
  eventId: string,
  updates: BulkSetupOrderUpdates,
) {
  const session = await requirePermission("SETUP_ORDERS", "WRITE", eventId);
  await bulkUpdateSetupOrdersCore(ids, eventId, updates, session.user.id);
  revalidatePath(`/events/${eventId}/setup-orders`);
}
