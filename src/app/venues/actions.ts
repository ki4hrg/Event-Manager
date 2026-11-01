"use server";

import { roomCapacitiesInclude } from "@/lib/roomCapacity";
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
  addVenueAmenityCore,
} from "./core";
import { formId, formInt, formName, formNote, formRequiredId, formTexts, formValue, parseWhole } from "@/lib/validation";

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
      rooms: { include: roomCapacitiesInclude, orderBy: { name: "asc" } },
      roomGroups: { orderBy: { sortOrder: "asc" } },
      contacts: { include: { contact: true }, orderBy: { id: "asc" } },
      vendor: true,
      updatedBy: { select: { name: true, email: true } },
    },
  });
}

function readVenueArgs(formData: FormData): VenueWriteArgs {
  return {
    name: formName(formData, "name"),
    address: formNote(formData, "address"),
    city: formNote(formData, "city"),
    state: formNote(formData, "state"),
    zip: formNote(formData, "zip"),
    country: formNote(formData, "country"),
    notes: formNote(formData, "notes"),
    isLodging: formData.get("isLodging") === "true",
    brand: formNote(formData, "brand"),
    area: formNote(formData, "area"),
    amenities: formData.has("amenitiesField") ? formTexts(formData, "amenities") : undefined,
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
  const notes = formNote(formData, "notes");
  await updateVenueVendorDetailsCore(venueId, notes, session.user.id, session.tenantId);
  revalidatePath(`/venues/${venueId}`);
}

export async function deleteVenue(id: string) {
  const session = await requirePermission(PermissionResource.VENUES, "DELETE");
  await deleteVenueCore(id, session.user.id, session.tenantId);
  revalidatePath("/venues");
  redirect("/venues");
}

// Set-up capacities post as parallel capacitySetup / capacityCount inputs.
function readRoomArgs(formData: FormData): RoomWriteArgs {
  const counts = formTexts(formData, "capacityCount", { max: 20 });
  const setups = formTexts(formData, "capacitySetup");
  return {
    name: formName(formData, "name"),
    capacity: formInt(formData, "capacity", { min: 0 }),
    notes: formNote(formData, "notes"),
    groupId: formId(formData, "groupId"),
    capacities: setups.map((setupType, i) => ({
      setupType,
      capacity: counts[i]?.trim() ? parseWhole(counts[i], "Capacity", { min: 0 }) : 0,
    })),
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

export async function addVenueAmenity(venueId: string, label: string) {
  const session = await requirePermission(PermissionResource.VENUES, "WRITE");
  await addVenueAmenityCore(venueId, label, session.user.id, session.tenantId);
  revalidatePath(`/venues/${venueId}`);
}

export async function createRoomGroup(venueId: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.VENUES, "WRITE");
  await createRoomGroupCore(venueId, formName(formData, "name"), session.user.id, session.tenantId);
  revalidatePath(`/venues/${venueId}`);
}

export async function updateRoomGroup(groupId: string, venueId: string, formData: FormData) {
  const session = await requirePermission(PermissionResource.VENUES, "WRITE");
  await updateRoomGroupCore(groupId, venueId, formName(formData, "name"), session.user.id, session.tenantId);
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
    formRequiredId(formData, "contactId", "contact"),
    formNote(formData, "role"),
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
    formNote(formData, "role"),
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
      firstName: formValue(formData, "firstName"),
      lastName: formValue(formData, "lastName"),
      email: formNote(formData, "email"),
      organization: formNote(formData, "organization"),
      role: formNote(formData, "role"),
    },
    session.user.id,
    session.tenantId,
  );
  revalidatePath(`/venues/${venueId}`);
}
