"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function getBEOs(eventId: string) {
  return prisma.bEO.findMany({
    where: { eventId },
    include: { function: true },
    orderBy: { name: "asc" },
  });
}

export async function getBEO(id: string) {
  return prisma.bEO.findUnique({
    where: { id },
    include: {
      function: { include: { schedules: { orderBy: { startTime: "asc" } } } },
    },
  });
}

export async function createBEO(eventId: string, formData: FormData) {
  const name = formData.get("name") as string;
  const guaranteeCountStr = formData.get("guaranteeCount") as string;
  const tableSetup = formData.get("tableSetup") as string;
  const menuNotes = formData.get("menuNotes") as string;
  const dietaryNotes = formData.get("dietaryNotes") as string;
  const beverageNotes = formData.get("beverageNotes") as string;
  const notes = formData.get("notes") as string;
  const functionId = formData.get("functionId") as string;

  const beo = await prisma.bEO.create({
    data: {
      name,
      eventId,
      guaranteeCount: guaranteeCountStr ? parseInt(guaranteeCountStr) : null,
      tableSetup: tableSetup || null,
      menuNotes: menuNotes || null,
      dietaryNotes: dietaryNotes || null,
      beverageNotes: beverageNotes || null,
      notes: notes || null,
      functionId: functionId || null,
    },
  });

  revalidatePath(`/events/${eventId}/beos`);
  redirect(`/events/${eventId}/beos/${beo.id}`);
}

export async function updateBEO(id: string, eventId: string, formData: FormData) {
  const name = formData.get("name") as string;
  const guaranteeCountStr = formData.get("guaranteeCount") as string;
  const tableSetup = formData.get("tableSetup") as string;
  const menuNotes = formData.get("menuNotes") as string;
  const dietaryNotes = formData.get("dietaryNotes") as string;
  const beverageNotes = formData.get("beverageNotes") as string;
  const notes = formData.get("notes") as string;

  await prisma.bEO.update({
    where: { id },
    data: {
      name,
      guaranteeCount: guaranteeCountStr ? parseInt(guaranteeCountStr) : null,
      tableSetup: tableSetup || null,
      menuNotes: menuNotes || null,
      dietaryNotes: dietaryNotes || null,
      beverageNotes: beverageNotes || null,
      notes: notes || null,
    },
  });

  revalidatePath(`/events/${eventId}/beos`);
  revalidatePath(`/events/${eventId}/beos/${id}`);
  redirect(`/events/${eventId}/beos/${id}?success=BEO updated`);
}

export async function deleteBEO(id: string, eventId: string) {
  await prisma.bEO.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/beos`);
  redirect(`/events/${eventId}/beos`);
}

export async function linkBEOToFunction(beoId: string, functionId: string, eventId: string) {
  await prisma.bEO.update({
    where: { id: beoId },
    data: { functionId },
  });
  revalidatePath(`/events/${eventId}/beos/${beoId}`);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function unlinkBEOFromFunction(beoId: string, eventId: string) {
  const beo = await prisma.bEO.findUnique({
    where: { id: beoId },
    select: { functionId: true },
  });
  await prisma.bEO.update({
    where: { id: beoId },
    data: { functionId: null },
  });
  revalidatePath(`/events/${eventId}/beos/${beoId}`);
  if (beo?.functionId) {
    revalidatePath(`/events/${eventId}/functions/${beo.functionId}`);
  }
}

// BEOs not yet linked to a function (for a given event)
export async function getAvailableBEOs(eventId: string) {
  return prisma.bEO.findMany({
    where: { eventId, functionId: null },
    orderBy: { name: "asc" },
  });
}

// Link/unlink from the Function detail page panel
export async function linkBEOToFunctionFromFunction(
  beoId: string,
  functionId: string,
  eventId: string
) {
  await prisma.bEO.update({
    where: { id: beoId },
    data: { functionId },
  });
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function unlinkBEOFromFunctionPage(functionId: string, eventId: string) {
  await prisma.bEO.updateMany({
    where: { functionId },
    data: { functionId: null },
  });
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}
