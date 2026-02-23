"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function getEvents() {
  return prisma.event.findMany({
    include: { venue: true },
    orderBy: { startDate: "desc" },
  });
}

export async function getEvent(id: string) {
  return prisma.event.findUnique({
    where: { id },
    include: { venue: true },
  });
}

export async function createEvent(formData: FormData) {
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
  await prisma.event.delete({ where: { id } });
  revalidatePath("/events");
  redirect("/events");
}
