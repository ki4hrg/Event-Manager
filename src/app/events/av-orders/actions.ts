"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDefaultVendorForModel } from "@/app/vendors/actions";

export async function getAVOrders(eventId: string) {
  return prisma.aVOrder.findMany({
    where: { eventId },
    include: {
      function: true,
      presentation: true,
    },
    orderBy: { name: "asc" },
  });
}

export async function getAVOrder(id: string) {
  return prisma.aVOrder.findUnique({
    where: { id },
    include: {
      function: { include: { schedules: { orderBy: { startTime: "asc" } } } },
      presentation: true,
    },
  });
}

export async function createAVOrder(eventId: string, formData: FormData) {
  const name = formData.get("name") as string;
  const equipment = formData.getAll("equipment") as string[];
  const notes = formData.get("notes") as string;
  const functionId = formData.get("functionId") as string;
  const presentationId = formData.get("presentationId") as string;

  const avOrder = await prisma.aVOrder.create({
    data: {
      name,
      eventId,
      equipment,
      notes: notes || null,
      functionId: functionId || null,
      presentationId: presentationId || null,
    },
  });

  const defaultVendor = await getDefaultVendorForModel(eventId, "AV_ORDER");
  if (defaultVendor) {
    await prisma.aVOrderVendor.create({ data: { avOrderId: avOrder.id, vendorId: defaultVendor.vendorId } });
  }

  revalidatePath(`/events/${eventId}/av-orders`);
  redirect(`/events/${eventId}/av-orders/${avOrder.id}`);
}

export async function updateAVOrder(id: string, eventId: string, formData: FormData) {
  const name = formData.get("name") as string;
  const equipment = formData.getAll("equipment") as string[];
  const notes = formData.get("notes") as string;

  await prisma.aVOrder.update({
    where: { id },
    data: {
      name,
      equipment,
      notes: notes || null,
    },
  });

  revalidatePath(`/events/${eventId}/av-orders`);
  revalidatePath(`/events/${eventId}/av-orders/${id}`);
  redirect(`/events/${eventId}/av-orders/${id}?success=AV Order updated`);
}

export async function deleteAVOrder(id: string, eventId: string) {
  await prisma.aVOrder.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/av-orders`);
  redirect(`/events/${eventId}/av-orders`);
}

export async function linkAVOrderToFunction(avOrderId: string, functionId: string, eventId: string) {
  await prisma.aVOrder.update({
    where: { id: avOrderId },
    data: { functionId },
  });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function linkAVOrderToPresentation(
  avOrderId: string,
  presentationId: string,
  eventId: string
) {
  await prisma.aVOrder.update({
    where: { id: avOrderId },
    data: { presentationId },
  });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function unlinkAVOrderFromFunction(avOrderId: string, eventId: string) {
  const avOrder = await prisma.aVOrder.findUnique({
    where: { id: avOrderId },
    select: { functionId: true },
  });
  await prisma.aVOrder.update({
    where: { id: avOrderId },
    data: { functionId: null },
  });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
  if (avOrder?.functionId) {
    revalidatePath(`/events/${eventId}/functions/${avOrder.functionId}`);
  }
}

export async function unlinkAVOrderFromPresentation(avOrderId: string, eventId: string) {
  const avOrder = await prisma.aVOrder.findUnique({
    where: { id: avOrderId },
    select: { presentationId: true },
  });
  await prisma.aVOrder.update({
    where: { id: avOrderId },
    data: { presentationId: null },
  });
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
  if (avOrder?.presentationId) {
    revalidatePath(`/events/${eventId}/presentations/${avOrder.presentationId}`);
  }
}

// AVOrders not yet linked to a function (for a given event)
export async function getAvailableAVOrdersForFunction(eventId: string) {
  return prisma.aVOrder.findMany({
    where: { eventId, functionId: null },
    orderBy: { name: "asc" },
  });
}

// AVOrders not yet linked to a presentation (for a given event)
export async function getAvailableAVOrdersForPresentation(eventId: string) {
  return prisma.aVOrder.findMany({
    where: { eventId, presentationId: null },
    orderBy: { name: "asc" },
  });
}

// Link/unlink actions for the Function detail page panel
export async function linkAVOrderToFunctionFromFunction(
  avOrderId: string,
  functionId: string,
  eventId: string
) {
  await prisma.aVOrder.update({
    where: { id: avOrderId },
    data: { functionId },
  });
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function unlinkAVOrderFromFunctionPage(functionId: string, eventId: string) {
  await prisma.aVOrder.updateMany({
    where: { functionId },
    data: { functionId: null },
  });
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

// Link/unlink actions for the Presentation detail page panel
export async function linkAVOrderToPresentationFromPresentation(
  avOrderId: string,
  presentationId: string,
  eventId: string
) {
  await prisma.aVOrder.update({
    where: { id: avOrderId },
    data: { presentationId },
  });
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function unlinkAVOrderFromPresentationPage(presentationId: string, eventId: string) {
  await prisma.aVOrder.updateMany({
    where: { presentationId },
    data: { presentationId: null },
  });
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}
