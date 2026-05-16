"use server";

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { loadPermissions, requirePermission } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function getEvents() {
  const session = await requirePermission("EVENTS", "VIEW");
  const { permissions } = await loadPermissions(session.user.id);
  const unassigned = permissions.find(
    (p) => p.resource === "EVENTS" && p.scope === "UNASSIGNED",
  );
  const canSeeUnassigned = unassigned && unassigned.level !== "NONE";

  return prisma.event.findMany({
    where: canSeeUnassigned ? undefined : { staff: { some: { userId: session.user.id } } },
    include: { venue: true },
    orderBy: { startDate: "desc" },
  });
}

// No requireAuth() — reused by /share/[token] (see CLAUDE.md share-link carve-out).
export const getEvent = cache(async (id: string) => {
  return prisma.event.findUnique({
    where: { id },
    include: { venue: true },
  });
});

export async function createEvent(formData: FormData) {
  const session = await requirePermission("EVENTS", "WRITE");
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const startDate = formData.get("startDate") as string;
  const endDate = formData.get("endDate") as string;
  const timezone = formData.get("timezone") as string;
  const venueId = formData.get("venueId") as string;

  // Auto-assign creator as event staff so any role with EVENTS:UNASSIGNED:NONE
  // doesn't lose access to events they just created.
  await prisma.event.create({
    data: {
      name,
      description: description || null,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      timezone: timezone || "America/Chicago",
      venueId: venueId || null,
      staff: { create: { userId: session.user.id } },
    },
  });

  revalidatePath("/events");
  redirect("/events");
}

export async function updateEvent(id: string, formData: FormData) {
  await requirePermission("EVENTS", "WRITE", id);
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
  await requirePermission("EVENTS", "DELETE", id);
  await prisma.event.delete({ where: { id } });
  revalidatePath("/events");
  redirect("/events");
}

export async function searchContactsForKeyStaff(query: string) {
  await requirePermission("CONTACTS", "VIEW");
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
  await requirePermission("EVENTS", "WRITE", eventId);
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
  await requirePermission("EVENTS", "WRITE", eventId);
  const title = (formData.get("title") as string) || null;
  const models = formData.getAll("models") as string[];

  await prisma.eventKeyStaff.update({
    where: { id: keyStaffId, eventId },
    data: { title, models },
  });
  revalidatePath(`/events/${eventId}`);
}

export async function removeEventKeyStaff(keyStaffId: string, eventId: string) {
  await requirePermission("EVENTS", "WRITE", eventId);
  await prisma.eventKeyStaff.delete({ where: { id: keyStaffId, eventId } });
  revalidatePath(`/events/${eventId}`);
}

export async function createContactAndAddKeyStaff(eventId: string, formData: FormData) {
  await requirePermission("EVENTS", "WRITE", eventId);
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
