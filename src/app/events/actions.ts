"use server";

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function getEvents() {
  await requireAuth();
  return prisma.event.findMany({
    include: { venue: true },
    orderBy: { startDate: "desc" },
  });
}

export const getEvent = cache(async (id: string) => {
  await requireAuth();
  return prisma.event.findUnique({
    where: { id },
    include: { venue: true },
  });
});

export async function createEvent(formData: FormData) {
  await requireAuth();
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const startDate = formData.get("startDate") as string;
  const endDate = formData.get("endDate") as string;
  const timezone = formData.get("timezone") as string;
  const venueId = formData.get("venueId") as string;

  const event = await prisma.event.create({
    data: {
      name,
      description: description || null,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      timezone: timezone || "America/Chicago",
      venueId: venueId || null,
    },
  });

  revalidatePath("/events");
  redirect("/events");
}

export async function updateEvent(id: string, formData: FormData) {
  await requireAuth();
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const startDate = formData.get("startDate") as string;
  const endDate = formData.get("endDate") as string;
  const timezone = formData.get("timezone") as string;
  const venueId = formData.get("venueId") as string;

  await prisma.event.update({
    where: { id },
    data: {
      name,
      description: description || null,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      timezone: timezone || "America/Chicago",
      venueId: venueId || null,
    },
  });

  revalidatePath("/events");
  revalidatePath(`/events/${id}`);
  redirect(`/events/${id}?success=Event updated`);
}

export async function deleteEvent(id: string) {
  await requireAuth();
  await prisma.event.delete({ where: { id } });
  revalidatePath("/events");
  redirect("/events");
}

export async function searchContactsForKeyStaff(query: string) {
  await requireAuth();
  if (!query || query.length < 2) return [];
  return prisma.contact.findMany({
    where: {
      OR: [
        { firstName: { contains: query, mode: "insensitive" } },
        { lastName: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
        { organization: { contains: query, mode: "insensitive" } },
      ],
    },
    take: 10,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
}

export async function addEventKeyStaff(eventId: string, formData: FormData) {
  await requireAuth();
  const contactId = formData.get("contactId") as string;
  const title = (formData.get("title") as string) || null;
  const models = formData.getAll("models") as string[];

  await prisma.eventKeyStaff.create({
    data: { eventId, contactId, title, models },
  });
  revalidatePath(`/events/${eventId}`);
}

export async function updateEventKeyStaff(
  keyStaffId: string,
  eventId: string,
  formData: FormData
) {
  await requireAuth();
  const title = (formData.get("title") as string) || null;
  const models = formData.getAll("models") as string[];

  await prisma.eventKeyStaff.update({
    where: { id: keyStaffId },
    data: { title, models },
  });
  revalidatePath(`/events/${eventId}`);
}

export async function removeEventKeyStaff(keyStaffId: string, eventId: string) {
  await requireAuth();
  await prisma.eventKeyStaff.delete({ where: { id: keyStaffId } });
  revalidatePath(`/events/${eventId}`);
}

export async function createContactAndAddKeyStaff(eventId: string, formData: FormData) {
  await requireAuth();
  const firstName = formData.get("firstName") as string;
  const lastName = formData.get("lastName") as string;
  const email = formData.get("email") as string;
  const organization = formData.get("organization") as string;
  const title = (formData.get("title") as string) || null;
  const models = formData.getAll("models") as string[];

  await prisma.$transaction(async (tx) => {
    const contact = await tx.contact.create({
      data: {
        firstName,
        lastName,
        email: email || null,
        organization: organization || null,
      },
    });

    await tx.eventKeyStaff.create({
      data: { eventId, contactId: contact.id, title, models },
    });
  });

  revalidatePath(`/events/${eventId}`);
}
