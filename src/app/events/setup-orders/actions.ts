"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EntityStatus } from "@prisma/client";
import { getDefaultVendorForModel } from "@/app/vendors/actions";
import { resolveEquipmentName } from "@/lib/equipment-utils";
import { autoAssignDefaultWorkflows } from "@/app/events/workflows/actions";

export async function getSetupOrders(eventId: string) {
  return prisma.setupOrder.findMany({
    where: { eventId },
    include: {
      room: { select: { id: true, name: true } },
      functions: { select: { id: true, name: true } },
      tables: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      equipmentItems: { orderBy: [{ sortOrder: "asc" }, { item: "asc" }] },
      vendors: { include: { vendor: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getSetupOrder(id: string) {
  return prisma.setupOrder.findUnique({
    where: { id },
    include: {
      room: true,
      functions: { include: { schedules: { orderBy: { startTime: "asc" } } }, orderBy: { name: "asc" } },
      presentation: { select: { id: true, title: true, eventId: true } },
      tables: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      equipmentItems: { include: { equipment: true, providerVendor: true, providerContact: true, operatorVendor: true, operatorContact: true }, orderBy: [{ sortOrder: "asc" }, { item: "asc" }] },
    },
  });
}

export async function createSetupOrder(eventId: string, formData: FormData) {
  const name = (formData.get("name") as string)?.trim() || null;
  const setupType = formData.get("setupType") as string;
  const notes = formData.get("notes") as string;
  const functionId = (formData.get("functionId") as string) || null;
  const presentationId = (formData.get("presentationId") as string) || null;
  const roomId = (formData.get("roomId") as string) || null;
  const selectedVendorId = (formData.get("vendorId") as string) || null;

  const setupOrder = await prisma.setupOrder.create({
    data: {
      name,
      eventId,
      setupType: setupType || null,
      notes: notes || null,
      roomId,
      presentationId,
    },
  });

  if (functionId) {
    await prisma.function.update({ where: { id: functionId }, data: { setupOrderId: setupOrder.id } });
  }

  const vendorIdToAssign = selectedVendorId ?? (await getDefaultVendorForModel(eventId, "SETUP_ORDER"))?.vendorId ?? null;
  if (vendorIdToAssign) {
    await prisma.setupOrderVendor.create({ data: { setupOrderId: setupOrder.id, vendorId: vendorIdToAssign } });
  }

  await autoAssignDefaultWorkflows("setup_order", setupOrder.id);
  revalidatePath(`/events/${eventId}/setup-orders`);
  redirect(`/events/${eventId}/setup-orders/${setupOrder.id}`);
}

export async function updateSetupOrder(id: string, eventId: string, formData: FormData) {
  const name = (formData.get("name") as string)?.trim() || null;
  const setupType = formData.get("setupType") as string;
  const notes = formData.get("notes") as string;
  const roomId = (formData.get("roomId") as string) || null;

  await prisma.setupOrder.update({
    where: { id },
    data: {
      name,
      setupType: setupType || null,
      notes: notes || null,
      roomId,
    },
  });

  revalidatePath(`/events/${eventId}/setup-orders`);
  revalidatePath(`/events/${eventId}/setup-orders/${id}`);
  redirect(`/events/${eventId}/setup-orders/${id}?success=Setup Order updated`);
}

export async function deleteSetupOrder(id: string, eventId: string) {
  await prisma.setupOrder.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/setup-orders`);
  redirect(`/events/${eventId}/setup-orders`);
}

export async function duplicateSetupOrder(id: string, eventId: string) {
  const source = await prisma.setupOrder.findUnique({
    where: { id },
    include: {
      tables: true,
      equipmentItems: true,
    },
  });
  if (!source) throw new Error("Setup order not found");

  const duplicate = await prisma.setupOrder.create({
    data: {
      eventId,
      name: source.name ? `${source.name} (Copy)` : null,
      setupType: source.setupType,
      notes: source.notes,
      roomId: source.roomId,
    },
  });

  await Promise.all([
    prisma.setupTable.createMany({
      data: source.tables.map((t) => ({
        setupOrderId: duplicate.id,
        quantity: t.quantity,
        tableType: t.tableType,
        chairCount: t.chairCount,
        chairType: t.chairType,
        notes: t.notes,
        sortOrder: t.sortOrder,
      })),
    }),
    prisma.equipmentItem.createMany({
      data: source.equipmentItems.map((e) => ({
        setupOrderId: duplicate.id,
        item: e.item,
        quantity: e.quantity,
        notes: e.notes,
        sortOrder: e.sortOrder,
      })),
    }),
  ]);

  await autoAssignDefaultWorkflows("setup_order", duplicate.id);
  revalidatePath(`/events/${eventId}/setup-orders`);
  redirect(`/events/${eventId}/setup-orders/${duplicate.id}`);
}

// Link/unlink from Setup Order detail page
export async function linkSetupOrderToFunction(setupOrderId: string, functionId: string, eventId: string) {
  await prisma.function.update({ where: { id: functionId }, data: { setupOrderId } });
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function unlinkSetupOrderFromFunction(setupOrderId: string, functionId: string, eventId: string) {
  await prisma.function.update({ where: { id: functionId }, data: { setupOrderId: null } });
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function getAvailableSetupOrdersForFunction(eventId: string) {
  return prisma.setupOrder.findMany({
    where: { eventId },
    include: { room: true },
    orderBy: { createdAt: "asc" },
  });
}

// Link/unlink from Function detail page
export async function linkSetupOrderToFunctionFromFunction(
  setupOrderId: string,
  functionId: string,
  eventId: string
) {
  await prisma.function.update({ where: { id: functionId }, data: { setupOrderId } });
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function unlinkSetupOrderFromFunctionPage(functionId: string, eventId: string) {
  await prisma.function.update({ where: { id: functionId }, data: { setupOrderId: null } });
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

// Link/unlink from Setup Order detail page (Presentation)
export async function linkSetupOrderToPresentation(setupOrderId: string, presentationId: string, eventId: string) {
  await prisma.setupOrder.update({ where: { id: setupOrderId }, data: { presentationId } });
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function unlinkSetupOrderFromPresentation(setupOrderId: string, eventId: string) {
  const setupOrder = await prisma.setupOrder.findUnique({ where: { id: setupOrderId }, select: { presentationId: true } });
  await prisma.setupOrder.update({ where: { id: setupOrderId }, data: { presentationId: null } });
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
  if (setupOrder?.presentationId) {
    revalidatePath(`/events/${eventId}/presentations/${setupOrder.presentationId}`);
  }
}

export async function getAvailableSetupOrdersForPresentation(eventId: string) {
  return prisma.setupOrder.findMany({
    where: { eventId, presentationId: null },
    include: { room: true },
    orderBy: { createdAt: "asc" },
  });
}

// Link/unlink from Presentation detail page
export async function linkSetupOrderToPresentationFromPresentation(
  setupOrderId: string,
  presentationId: string,
  eventId: string
) {
  await prisma.setupOrder.update({ where: { id: setupOrderId }, data: { presentationId } });
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function unlinkSetupOrderFromPresentationPage(presentationId: string, eventId: string) {
  await prisma.setupOrder.updateMany({ where: { presentationId }, data: { presentationId: null } });
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

// SetupTable CRUD
export async function createSetupTable(setupOrderId: string, eventId: string, formData: FormData) {
  const { _max } = await prisma.setupTable.aggregate({ where: { setupOrderId }, _max: { sortOrder: true } });

  await prisma.setupTable.create({
    data: {
      setupOrderId,
      quantity: parseInt(formData.get("quantity") as string),
      tableType: (formData.get("tableType") as string) || null,
      chairCount: formData.get("chairCount") ? parseInt(formData.get("chairCount") as string) : null,
      chairType: (formData.get("chairType") as string) || null,
      notes: (formData.get("notes") as string) || null,
      sortOrder: (_max.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

export async function updateSetupTable(id: string, setupOrderId: string, eventId: string, formData: FormData) {
  await prisma.setupTable.update({
    where: { id },
    data: {
      quantity: parseInt(formData.get("quantity") as string),
      tableType: (formData.get("tableType") as string) || null,
      chairCount: formData.get("chairCount") ? parseInt(formData.get("chairCount") as string) : null,
      chairType: (formData.get("chairType") as string) || null,
      notes: (formData.get("notes") as string) || null,
    },
  });

  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

export async function deleteSetupTable(id: string, setupOrderId: string, eventId: string) {
  await prisma.setupTable.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

// EquipmentItem CRUD for Setup Orders
export async function createSetupEquipmentItem(setupOrderId: string, eventId: string, formData: FormData) {
  const { _max } = await prisma.equipmentItem.aggregate({ where: { setupOrderId }, _max: { sortOrder: true } });
  const equipmentId = (formData.get("equipmentId") as string) || null;
  const item = await resolveEquipmentName(equipmentId, (formData.get("item") as string) || "");

  await prisma.equipmentItem.create({
    data: {
      setupOrderId,
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

  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

export async function updateSetupEquipmentItem(id: string, setupOrderId: string, eventId: string, formData: FormData) {
  const equipmentId = (formData.get("equipmentId") as string) || null;
  const item = await resolveEquipmentName(equipmentId, (formData.get("item") as string) || "");

  await prisma.equipmentItem.update({
    where: { id },
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

  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

export async function deleteSetupEquipmentItem(id: string, setupOrderId: string, eventId: string) {
  await prisma.equipmentItem.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

export async function deleteSetupOrders(ids: string[], eventId: string) {
  await prisma.setupOrder.deleteMany({ where: { id: { in: ids }, eventId } });
  revalidatePath(`/events/${eventId}/setup-orders`);
}

export async function bulkUpdateSetupOrders(
  ids: string[],
  eventId: string,
  updates: { status?: EntityStatus; substatus?: string | null; vendorId?: string }
) {
  const { status, substatus, vendorId } = updates;

  if (status !== undefined || substatus !== undefined) {
    await prisma.setupOrder.updateMany({
      where: { id: { in: ids }, eventId },
      data: {
        ...(status !== undefined ? { status } : {}),
        ...(substatus !== undefined ? { substatus } : {}),
      },
    });
  }

  if (vendorId) {
    await prisma.setupOrderVendor.deleteMany({ where: { setupOrderId: { in: ids } } });
    await prisma.setupOrderVendor.createMany({ data: ids.map((id) => ({ setupOrderId: id, vendorId })) });
  }

  revalidatePath(`/events/${eventId}/setup-orders`);
}
