"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function getVenues() {
  return prisma.venue.findMany({
    include: { _count: { select: { rooms: true } } },
    orderBy: { name: "asc" },
  });
}

export async function getVenue(id: string) {
  return prisma.venue.findUnique({
    where: { id },
    include: {
      rooms: { orderBy: { name: "asc" } },
      contacts: { include: { contact: true }, orderBy: { id: "asc" } },
    },
  });
}

export async function createVenue(formData: FormData) {
  const name = formData.get("name") as string;
  const address = formData.get("address") as string;
  const city = formData.get("city") as string;
  const state = formData.get("state") as string;
  const zip = formData.get("zip") as string;
  const country = formData.get("country") as string;
  const notes = formData.get("notes") as string;

  const venue = await prisma.venue.create({
    data: {
      name,
      address: address || null,
      city: city || null,
      state: state || null,
      zip: zip || null,
      country: country || null,
      notes: notes || null,
    },
  });

  revalidatePath("/venues");
  redirect("/venues");
}

export async function updateVenue(id: string, formData: FormData) {
  const name = formData.get("name") as string;
  const address = formData.get("address") as string;
  const city = formData.get("city") as string;
  const state = formData.get("state") as string;
  const zip = formData.get("zip") as string;
  const country = formData.get("country") as string;
  const notes = formData.get("notes") as string;

  await prisma.venue.update({
    where: { id },
    data: {
      name,
      address: address || null,
      city: city || null,
      state: state || null,
      zip: zip || null,
      country: country || null,
      notes: notes || null,
    },
  });

  revalidatePath("/venues");
  revalidatePath(`/venues/${id}`);
  redirect(`/venues/${id}?success=Venue updated`);
}

export async function deleteVenue(id: string) {
  await prisma.venue.delete({ where: { id } });
  revalidatePath("/venues");
  redirect("/venues");
}

// Room actions
export async function createRoom(venueId: string, formData: FormData) {
  const name = formData.get("name") as string;
  const capacity = formData.get("capacity") as string;
  const notes = formData.get("notes") as string;

  await prisma.room.create({
    data: {
      name,
      capacity: capacity ? parseInt(capacity) : null,
      notes: notes || null,
      venueId,
    },
  });

  revalidatePath(`/venues/${venueId}`);
}

export async function updateRoom(roomId: string, venueId: string, formData: FormData) {
  const name = formData.get("name") as string;
  const capacity = formData.get("capacity") as string;
  const notes = formData.get("notes") as string;

  await prisma.room.update({
    where: { id: roomId },
    data: {
      name,
      capacity: capacity ? parseInt(capacity) : null,
      notes: notes || null,
    },
  });

  revalidatePath(`/venues/${venueId}`);
}

export async function deleteRoom(roomId: string, venueId: string) {
  await prisma.room.delete({ where: { id: roomId } });
  revalidatePath(`/venues/${venueId}`);
}

// ============================================================================
// Contact Assignment
// ============================================================================

export async function searchContacts(query: string) {
  if (!query || query.length < 2) {
    return [];
  }

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

export async function addVenueContact(venueId: string, formData: FormData) {
  const contactId = formData.get("contactId") as string;
  const role = formData.get("role") as string;

  await prisma.venueContact.create({
    data: {
      venueId,
      contactId,
      role: role || null,
    },
  });

  revalidatePath(`/venues/${venueId}`);
}

export async function updateVenueContact(contactId: string, venueId: string, formData: FormData) {
  const role = formData.get("role") as string;

  await prisma.venueContact.update({
    where: { id: contactId },
    data: { role: role || null },
  });

  revalidatePath(`/venues/${venueId}`);
}

export async function removeVenueContact(contactId: string, venueId: string) {
  await prisma.venueContact.delete({ where: { id: contactId } });
  revalidatePath(`/venues/${venueId}`);
}

export async function createAndAddVenueContact(venueId: string, formData: FormData) {
  const firstName = formData.get("firstName") as string;
  const lastName = formData.get("lastName") as string;
  const email = formData.get("email") as string;
  const organization = formData.get("organization") as string;
  const role = formData.get("role") as string;

  const contact = await prisma.contact.create({
    data: {
      firstName,
      lastName,
      email: email || null,
      organization: organization || null,
    },
  });

  await prisma.venueContact.create({
    data: { venueId, contactId: contact.id, role: role || null },
  });

  revalidatePath(`/venues/${venueId}`);
}
