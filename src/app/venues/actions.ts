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
    include: { rooms: { orderBy: { name: "asc" } } },
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
  redirect(`/venues/${venue.id}`);
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
