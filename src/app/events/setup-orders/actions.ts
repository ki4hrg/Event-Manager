"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDefaultVendorForModel } from "@/app/vendors/actions";
import { autoAssignDefaultWorkflows } from "@/app/events/workflows/actions";

export async function getSetupOrders(eventId: string) {
  return prisma.setupOrder.findMany({
    where: { eventId },
    include: {
      room: true,
      functions: true,
      tables: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      equipmentItems: { orderBy: [{ sortOrder: "asc" }, { item: "asc" }] },
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
      tables: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      equipmentItems: { include: { responsiblePartyVendor: true }, orderBy: [{ sortOrder: "asc" }, { item: "asc" }] },
    },
  });
}

export async function createSetupOrder(eventId: string, formData: FormData) {
  const name = (formData.get("name") as string)?.trim() || null;
  const description = (formData.get("description") as string)?.trim() || null;
  const setupType = formData.get("setupType") as string;
  const notes = formData.get("notes") as string;
  const functionId = (formData.get("functionId") as string) || null;
  const roomId = (formData.get("roomId") as string) || null;
  const selectedVendorId = (formData.get("vendorId") as string) || null;

  const setupOrder = await prisma.setupOrder.create({
    data: {
      name,
      description,
      eventId,
      setupType: setupType || null,
      notes: notes || null,
      roomId,
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
  const description = (formData.get("description") as string)?.trim() || null;
  const setupType = formData.get("setupType") as string;
  const notes = formData.get("notes") as string;
  const roomId = (formData.get("roomId") as string) || null;

  await prisma.setupOrder.update({
    where: { id },
    data: {
      name,
      description,
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
      description: source.description,
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

  await prisma.equipmentItem.create({
    data: {
      setupOrderId,
      item: formData.get("item") as string,
      quantity: formData.get("quantity") ? parseInt(formData.get("quantity") as string) : null,
      responsiblePartyVendorId: (formData.get("responsiblePartyVendorId") as string) || null,
      notes: (formData.get("notes") as string) || null,
      sortOrder: (_max.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

export async function updateSetupEquipmentItem(id: string, setupOrderId: string, eventId: string, formData: FormData) {
  await prisma.equipmentItem.update({
    where: { id },
    data: {
      item: formData.get("item") as string,
      quantity: formData.get("quantity") ? parseInt(formData.get("quantity") as string) : null,
      responsiblePartyVendorId: (formData.get("responsiblePartyVendorId") as string) || null,
      notes: (formData.get("notes") as string) || null,
    },
  });

  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

export async function deleteSetupEquipmentItem(id: string, setupOrderId: string, eventId: string) {
  await prisma.equipmentItem.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}
