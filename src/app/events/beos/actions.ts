"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDefaultVendorForModel } from "@/app/vendors/actions";

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
      timelineItems: { orderBy: [{ sortOrder: "asc" }, { startTime: "asc" }] },
      equipmentItems: { orderBy: [{ sortOrder: "asc" }, { item: "asc" }] },
      lineItems: { orderBy: [{ sortOrder: "asc" }, { description: "asc" }] },
      menuSections: { orderBy: [{ sortOrder: "asc" }, { responsibleParty: "asc" }] },
      contacts: { include: { contact: true }, orderBy: { id: "asc" } },
    },
  });
}

function parseDateField(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export async function createBEO(eventId: string, formData: FormData) {
  const name = formData.get("name") as string;
  const functionId = formData.get("functionId") as string;

  const beo = await prisma.bEO.create({
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
    },
  });

  const defaultVendor = await getDefaultVendorForModel(eventId, "BEO");
  if (defaultVendor) {
    await prisma.bEOVendor.create({ data: { beoId: beo.id, vendorId: defaultVendor.vendorId } });
  }

  revalidatePath(`/events/${eventId}/beos`);
  redirect(`/events/${eventId}/beos/${beo.id}`);
}

export async function updateBEOOverview(id: string, eventId: string, formData: FormData) {
  await prisma.bEO.update({
    where: { id },
    data: {
      name: formData.get("name") as string,
      serviceStyle: (formData.get("serviceStyle") as string) || null,
      expectedCount: formData.get("expectedCount") ? parseInt(formData.get("expectedCount") as string) : null,
      confirmedCount: formData.get("confirmedCount") ? parseInt(formData.get("confirmedCount") as string) : null,
      guaranteeCount: formData.get("guaranteeCount") ? parseInt(formData.get("guaranteeCount") as string) : null,
    },
  });
  revalidatePath(`/events/${eventId}/beos`);
  revalidatePath(`/events/${eventId}/beos/${id}`);
  redirect(`/events/${eventId}/beos/${id}?tab=overview&success=Saved`);
}

export async function updateBEOService(id: string, eventId: string, formData: FormData) {
  await prisma.bEO.update({
    where: { id },
    data: {
      dietaryNotes: (formData.get("dietaryNotes") as string) || null,
      staffingNotes: (formData.get("staffingNotes") as string) || null,
    },
  });
  revalidatePath(`/events/${eventId}/beos/${id}`);
  redirect(`/events/${eventId}/beos/${id}?tab=service&success=Saved`);
}

export async function updateBEOContract(id: string, eventId: string, formData: FormData) {
  await prisma.bEO.update({
    where: { id },
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
  revalidatePath(`/events/${eventId}/beos/${id}`);
  redirect(`/events/${eventId}/beos/${id}?tab=contract&success=Saved`);
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

export async function getAvailableBEOs(eventId: string) {
  return prisma.bEO.findMany({
    where: { eventId, functionId: null },
    orderBy: { name: "asc" },
  });
}

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

export async function createTimelineItem(beoId: string, eventId: string, formData: FormData) {
  const label = formData.get("label") as string;
  const startTime = new Date(formData.get("startTime") as string);
  const endTimeStr = formData.get("endTime") as string;
  const notes = formData.get("notes") as string;

  const { _max } = await prisma.timelineItem.aggregate({ where: { beoId }, _max: { sortOrder: true } });

  await prisma.timelineItem.create({
    data: {
      beoId,
      label,
      startTime,
      endTime: endTimeStr ? new Date(endTimeStr) : null,
      notes: notes || null,
      sortOrder: (_max.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath(`/events/${eventId}/beos/${beoId}`);
}

export async function updateTimelineItem(id: string, beoId: string, eventId: string, formData: FormData) {
  const startTime = new Date(formData.get("startTime") as string);
  const endTimeStr = formData.get("endTime") as string;

  await prisma.timelineItem.update({
    where: { id },
    data: {
      label: formData.get("label") as string,
      startTime,
      endTime: endTimeStr ? new Date(endTimeStr) : null,
      notes: (formData.get("notes") as string) || null,
    },
  });

  revalidatePath(`/events/${eventId}/beos/${beoId}`);
}

export async function deleteTimelineItem(id: string, beoId: string, eventId: string) {
  await prisma.timelineItem.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/beos/${beoId}`);
}

export async function createEquipmentItem(beoId: string, eventId: string, formData: FormData) {
  const { _max } = await prisma.equipmentItem.aggregate({ where: { beoId }, _max: { sortOrder: true } });

  await prisma.equipmentItem.create({
    data: {
      beoId,
      item: formData.get("item") as string,
      quantity: formData.get("quantity") ? parseInt(formData.get("quantity") as string) : null,
      responsibleParty: (formData.get("responsibleParty") as string) || null,
      notes: (formData.get("notes") as string) || null,
      sortOrder: (_max.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath(`/events/${eventId}/beos/${beoId}`);
}

export async function updateEquipmentItem(id: string, beoId: string, eventId: string, formData: FormData) {
  await prisma.equipmentItem.update({
    where: { id },
    data: {
      item: formData.get("item") as string,
      quantity: formData.get("quantity") ? parseInt(formData.get("quantity") as string) : null,
      responsibleParty: (formData.get("responsibleParty") as string) || null,
      notes: (formData.get("notes") as string) || null,
    },
  });

  revalidatePath(`/events/${eventId}/beos/${beoId}`);
}

export async function deleteEquipmentItem(id: string, beoId: string, eventId: string) {
  await prisma.equipmentItem.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/beos/${beoId}`);
}

export async function createBEOLineItem(beoId: string, eventId: string, formData: FormData) {
  const { _max } = await prisma.bEOLineItem.aggregate({ where: { beoId }, _max: { sortOrder: true } });

  await prisma.bEOLineItem.create({
    data: {
      beoId,
      description: formData.get("description") as string,
      unitType: (formData.get("unitType") as string) || null,
      unitPrice: (formData.get("unitPrice") as string) ? parseFloat(formData.get("unitPrice") as string) : null,
      quantity: formData.get("quantity") ? parseInt(formData.get("quantity") as string) : null,
      notes: (formData.get("notes") as string) || null,
      sortOrder: (_max.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath(`/events/${eventId}/beos/${beoId}`);
}

export async function updateBEOLineItem(id: string, beoId: string, eventId: string, formData: FormData) {
  await prisma.bEOLineItem.update({
    where: { id },
    data: {
      description: formData.get("description") as string,
      unitType: (formData.get("unitType") as string) || null,
      unitPrice: (formData.get("unitPrice") as string) ? parseFloat(formData.get("unitPrice") as string) : null,
      quantity: formData.get("quantity") ? parseInt(formData.get("quantity") as string) : null,
      notes: (formData.get("notes") as string) || null,
    },
  });

  revalidatePath(`/events/${eventId}/beos/${beoId}`);
}

export async function deleteBEOLineItem(id: string, beoId: string, eventId: string) {
  await prisma.bEOLineItem.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/beos/${beoId}`);
}

export async function createBEOMenuSection(beoId: string, eventId: string, formData: FormData) {
  const { _max } = await prisma.bEOMenuSection.aggregate({ where: { beoId }, _max: { sortOrder: true } });

  await prisma.bEOMenuSection.create({
    data: {
      beoId,
      responsibleParty: formData.get("responsibleParty") as string,
      menuContent: formData.get("menuContent") as string,
      notes: (formData.get("notes") as string) || null,
      sortOrder: (_max.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath(`/events/${eventId}/beos/${beoId}`);
}

export async function updateBEOMenuSection(id: string, beoId: string, eventId: string, formData: FormData) {
  await prisma.bEOMenuSection.update({
    where: { id },
    data: {
      responsibleParty: formData.get("responsibleParty") as string,
      menuContent: formData.get("menuContent") as string,
      notes: (formData.get("notes") as string) || null,
    },
  });

  revalidatePath(`/events/${eventId}/beos/${beoId}`);
}

export async function deleteBEOMenuSection(id: string, beoId: string, eventId: string) {
  await prisma.bEOMenuSection.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/beos/${beoId}`);
}

export async function addBEOContact(beoId: string, eventId: string, formData: FormData) {
  const contactId = formData.get("contactId") as string;
  const role = formData.get("role") as string;

  await prisma.bEOContact.create({
    data: {
      beoId,
      contactId,
      role: role || null,
    },
  });

  revalidatePath(`/events/${eventId}/beos/${beoId}`);
}

export async function updateBEOContact(id: string, beoId: string, eventId: string, formData: FormData) {
  await prisma.bEOContact.update({
    where: { id },
    data: { role: (formData.get("role") as string) || null },
  });

  revalidatePath(`/events/${eventId}/beos/${beoId}`);
}

export async function removeBEOContact(id: string, beoId: string, eventId: string) {
  await prisma.bEOContact.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/beos/${beoId}`);
}

export async function searchContactsForBEO(query: string) {
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
