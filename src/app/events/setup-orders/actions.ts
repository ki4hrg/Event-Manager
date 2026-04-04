"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function getSetupOrders(eventId: string) {
  return prisma.setupOrder.findMany({
    where: { eventId },
    include: {
      function: true,
      tables: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      equipmentItems: { orderBy: [{ sortOrder: "asc" }, { item: "asc" }] },
    },
    orderBy: { name: "asc" },
  });
}

export async function getSetupOrder(id: string) {
  return prisma.setupOrder.findUnique({
    where: { id },
    include: {
      function: { include: { schedules: { orderBy: { startTime: "asc" } } } },
      tables: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      equipmentItems: { orderBy: [{ sortOrder: "asc" }, { item: "asc" }] },
    },
  });
}

export async function createSetupOrder(eventId: string, formData: FormData) {
  const name = formData.get("name") as string;
  const setupType = formData.get("setupType") as string;
  const notes = formData.get("notes") as string;
  const functionId = formData.get("functionId") as string;

  const setupOrder = await prisma.setupOrder.create({
    data: {
      name,
      eventId,
      setupType: setupType || null,
      notes: notes || null,
      functionId: functionId || null,
    },
  });

  revalidatePath(`/events/${eventId}/setup-orders`);
  redirect(`/events/${eventId}/setup-orders/${setupOrder.id}`);
}

export async function updateSetupOrder(id: string, eventId: string, formData: FormData) {
  const name = formData.get("name") as string;
  const setupType = formData.get("setupType") as string;
  const notes = formData.get("notes") as string;

  await prisma.setupOrder.update({
    where: { id },
    data: {
      name,
      setupType: setupType || null,
      notes: notes || null,
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

// Link/unlink from Setup Order detail page
export async function linkSetupOrderToFunction(setupOrderId: string, functionId: string, eventId: string) {
  await prisma.setupOrder.update({
    where: { id: setupOrderId },
    data: { functionId },
  });
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function unlinkSetupOrderFromFunction(setupOrderId: string, eventId: string) {
  const setupOrder = await prisma.setupOrder.findUnique({
    where: { id: setupOrderId },
    select: { functionId: true },
  });
  await prisma.setupOrder.update({
    where: { id: setupOrderId },
    data: { functionId: null },
  });
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
  if (setupOrder?.functionId) {
    revalidatePath(`/events/${eventId}/functions/${setupOrder.functionId}`);
  }
}

export async function getAvailableSetupOrdersForFunction(eventId: string) {
  return prisma.setupOrder.findMany({
    where: { eventId, functionId: null },
    orderBy: { name: "asc" },
  });
}

// Link/unlink from Function detail page
export async function linkSetupOrderToFunctionFromFunction(
  setupOrderId: string,
  functionId: string,
  eventId: string
) {
  await prisma.setupOrder.update({
    where: { id: setupOrderId },
    data: { functionId },
  });
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function unlinkSetupOrderFromFunctionPage(functionId: string, eventId: string) {
  await prisma.setupOrder.updateMany({
    where: { functionId },
    data: { functionId: null },
  });
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

// SetupTable CRUD
export async function createSetupTable(setupOrderId: string, eventId: string, formData: FormData) {
  const { _max } = await prisma.setupTable.aggregate({ where: { setupOrderId }, _max: { sortOrder: true } });

  await prisma.setupTable.create({
    data: {
      setupOrderId,
      quantity: parseInt(formData.get("quantity") as string),
      tableType: formData.get("tableType") as string,
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
      tableType: formData.get("tableType") as string,
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
      responsibleParty: (formData.get("responsibleParty") as string) || null,
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
      responsibleParty: (formData.get("responsibleParty") as string) || null,
      notes: (formData.get("notes") as string) || null,
    },
  });

  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}

export async function deleteSetupEquipmentItem(id: string, setupOrderId: string, eventId: string) {
  await prisma.equipmentItem.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/setup-orders/${setupOrderId}`);
}
