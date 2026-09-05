"use server";

import { PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createVenueCore,
  updateVenueCore,
  updateVenueVendorDetailsCore,
  deleteVenueCore,
  createRoomCore,
  updateRoomCore,
  deleteRoomCore,
  createRoomGroupCore,
  updateRoomGroupCore,
  deleteRoomGroupCore,
  addVenueContactCore,
  updateVenueContactCore,
  removeVenueContactCore,
  createAndAddVenueContactCore,
  type VenueWriteArgs,
  type RoomWriteArgs,
} from "./core";

export async function getVenues() {
  const session = await requirePermission(PermissionResource.VENUES, "VIEW");
  return prisma.venue.findMany({
    where: { tenantId: session.tenantId },
    include: { _count: { select: { rooms: true } } },
    orderBy: { name: "asc" },
  });
}

export async function getVenue(id: string) {
  const session = await requirePermission(PermissionResource.VENUES, "VIEW");
  return prisma.venue.findFirst({
    where: { id, tenantId: session.tenantId },
    include: {
      rooms: { orderBy: { name: "asc" } },
      roomGroups: { orderBy: { sortOrder: "asc" } },
      contacts: { include: { contact: true }, orderBy: { id: "asc" } },
      vendor: true,
      updatedBy: { select: { name: true, email: true } },
    },
  });
}

function readVenueArgs(formData: FormData): VenueWriteArgs {
  return {
    name: formData.get("name") as string,
    address: (formData.get("address") as string) || null,
    city: (formData.get("city") as string) || null,
    state: (formData.get("state") as string) || null,
    zip: (formData.get("zip") as string) || null,
    country: (formData.get("country") as string) || null,
    notes: (formData.get("notes") as string) || null,
  };
}

export async function createVenue(formData: FormData) {
  const session = await requirePermission(PermissionResource.VENUES, "WRITE");
  await createVenueCore(readVenueArgs(formData), session.user.id, session.tenantId);
  revalidatePath("/venues");
  redirect("/venues");
}

export async function updateVenue(id: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.VENUES, "WRITE");
  await updateVenueCore(id, readVenueArgs(formData), session.user.id, session.tenantId);
  revalidatePath("/venues");
  revalidatePath(`/venues/${id}`);
  redirect(`/venues/${id}?success=Venue updated`);
}

export async function updateVenueVendorDetails(venueId: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.VENUES, "WRITE");
  const notes = (formData.get("notes") as string) || null;
  await updateVenueVendorDetailsCore(venueId, notes, session.user.id, session.tenantId);
  revalidatePath(`/venues/${venueId}`);
}

export async function deleteVenue(id: string) {
  const session = await requirePermission(PermissionResource.VENUES, "DELETE");
  await deleteVenueCore(id, session.user.id, session.tenantId);
  revalidatePath("/venues");
  redirect("/venues");
}

function readRoomArgs(formData: FormData): RoomWriteArgs {
  const capacity = formData.get("capacity") as string;
  return {
    name: formData.get("name") as string,
    capacity: capacity ? parseInt(capacity) : null,
    notes: (formData.get("notes") as string) || null,
    groupId: (formData.get("groupId") as string) || null,
  };
}

export async function createRoom(venueId: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.VENUES, "WRITE");
  await createRoomCore(venueId, readRoomArgs(formData), session.user.id, session.tenantId);
  revalidatePath(`/venues/${venueId}`);
}

export async function updateRoom(roomId: string, venueId: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.VENUES, "WRITE");
  await updateRoomCore(roomId, venueId, readRoomArgs(formData), session.user.id, session.tenantId);
  revalidatePath(`/venues/${venueId}`);
}

export async function deleteRoom(roomId: string, venueId: string) {
  const session = await requirePermission(PermissionResource.VENUES, "DELETE");
  await deleteRoomCore(roomId, venueId, session.user.id, session.tenantId);
  revalidatePath(`/venues/${venueId}`);
}

export async function createRoomGroup(venueId: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.VENUES, "WRITE");
  await createRoomGroupCore(venueId, formData.get("name") as string, session.user.id, session.tenantId);
  revalidatePath(`/venues/${venueId}`);
}

export async function updateRoomGroup(groupId: string, venueId: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.VENUES, "WRITE");
  await updateRoomGroupCore(groupId, venueId, formData.get("name") as string, session.user.id, session.tenantId);
  revalidatePath(`/venues/${venueId}`);
}

export async function deleteRoomGroup(groupId: string, venueId: string) {
  const session = await requirePermission(PermissionResource.VENUES, "DELETE");
  await deleteRoomGroupCore(groupId, venueId, session.user.id, session.tenantId);
  revalidatePath(`/venues/${venueId}`);
}

// ============================================================================
// Contact Assignment
// ============================================================================

export async function searchContacts(query: string) {
  const session = await requirePermission(PermissionResource.CONTACTS, "VIEW");
  if (!query || query.length < 2) {
    return [];
  }

  return prisma.contact.findMany({
    where: {
      tenantId: session.tenantId,
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
  const session = await requirePermission(PermissionResource.VENUES, "WRITE");
  await addVenueContactCore(
    venueId,
    formData.get("contactId") as string,
    (formData.get("role") as string) || null,
    session.user.id,
    session.tenantId,
  );
  revalidatePath(`/venues/${venueId}`);
}

export async function updateVenueContact(contactId: string, venueId: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.VENUES, "WRITE");
  await updateVenueContactCore(
    contactId,
    venueId,
    (formData.get("role") as string) || null,
    session.user.id,
    session.tenantId,
  );
  revalidatePath(`/venues/${venueId}`);
}

export async function removeVenueContact(contactId: string, venueId: string) {
  const session = await requirePermission(PermissionResource.VENUES, "DELETE");
  await removeVenueContactCore(contactId, venueId, session.user.id, session.tenantId);
  revalidatePath(`/venues/${venueId}`);
}

export async function createAndAddVenueContact(venueId: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.VENUES, "WRITE");
  await createAndAddVenueContactCore(
    {
      venueId,
      firstName: formData.get("firstName") as string,
      lastName: formData.get("lastName") as string,
      email: (formData.get("email") as string) || null,
      organization: (formData.get("organization") as string) || null,
      role: (formData.get("role") as string) || null,
    },
    session.user.id,
    session.tenantId,
  );
  revalidatePath(`/venues/${venueId}`);
}
