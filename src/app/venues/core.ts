// Pure cores for venue, room, room-group, and venue-contact mutations.
// NOT a "use server" file — see src/app/contacts/core.ts for the security
// rationale.

import { PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PermissionError, requirePermissionForUser } from "@/lib/permissions";
import { requireListLabels } from "@/lib/hotelLabels";

// Every venue-scoped core asserts the venue is the tenant's own before touching
// its rooms, groups, or contacts; a foreign id reads as not-found.
async function assertVenueInTenant(venueId: string, tenantId: string) {
  const venue = await prisma.venue.findFirst({ where: { id: venueId, tenantId }, select: { id: true } });
  if (!venue) throw new PermissionError("NOT_FOUND");
}

// ---------------------------------------------------------------------------
// Venue

export type VenueWriteArgs = {
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  notes: string | null;
  // Lodging fields; omitted (undefined) leaves them unchanged.
  isLodging?: boolean;
  brand?: string | null;
  area?: string | null;
  amenities?: string[]; // hotel_amenity labels
};

// A hotel's amenities as the list spells them; labels it already holds may stay.
async function amenityLabels(args: VenueWriteArgs, tenantId: string, current: string[] = []) {
  if (args.amenities === undefined) return undefined;
  return Array.from(new Set(await requireListLabels(tenantId, "hotel_amenity", args.amenities, current)));
}

export async function createVenueCore(args: VenueWriteArgs, userId: string, tenantId: string) {
  await requirePermissionForUser(userId, PermissionResource.VENUES, "WRITE", { tenantId });
  // Creating a venue also creates a backing Vendor row linked via venueId, so
  // the venue can appear as a "vendor" in order pickers. Keeping these in a
  // single core preserves the existing invariant: every Venue has one Vendor.
  const amenities = await amenityLabels(args, tenantId);
  const venue = await prisma.venue.create({
    data: {
      tenantId,
      name: args.name,
      address: args.address,
      city: args.city,
      state: args.state,
      zip: args.zip,
      country: args.country,
      notes: args.notes,
      isLodging: args.isLodging,
      brand: args.brand,
      area: args.area,
      amenities,
      updatedById: userId,
    },
  });
  await prisma.vendor.create({
    data: { tenantId, name: args.name, venueId: venue.id, updatedById: userId },
  });
  return venue;
}

export async function updateVenueCore(id: string, args: VenueWriteArgs, userId: string, tenantId: string) {
  await requirePermissionForUser(userId, PermissionResource.VENUES, "WRITE", { tenantId });
  const current = await prisma.venue.findFirst({ where: { id, tenantId }, select: { amenities: true } });
  if (!current) throw new PermissionError("NOT_FOUND");
  const amenities = await amenityLabels(args, tenantId, current.amenities);
  // Keeps the backing Vendor.name in sync with the Venue.name rename.
  const [venue] = await Promise.all([
    prisma.venue.update({
      where: { id, tenantId },
      data: {
        name: args.name,
        address: args.address,
        city: args.city,
        state: args.state,
        zip: args.zip,
        country: args.country,
        notes: args.notes,
        isLodging: args.isLodging,
        brand: args.brand,
        area: args.area,
        amenities,
        updatedById: userId,
      },
    }),
    prisma.vendor.updateMany({
      where: { venueId: id, tenantId },
      data: { name: args.name, updatedById: userId },
    }),
  ]);
  return venue;
}

export async function updateVenueVendorDetailsCore(
  venueId: string,
  notes: string | null,
  userId: string,
  tenantId: string,
) {
  await requirePermissionForUser(userId, PermissionResource.VENUES, "WRITE", { tenantId });
  await assertVenueInTenant(venueId, tenantId);
  await prisma.vendor.updateMany({
    where: { venueId, tenantId },
    data: { notes, updatedById: userId },
  });
  await prisma.venue.update({ where: { id: venueId }, data: { updatedById: userId } });
}

export async function deleteVenueCore(id: string, userId: string, tenantId: string) {
  await requirePermissionForUser(userId, PermissionResource.VENUES, "DELETE", { tenantId });
  await prisma.venue.delete({ where: { id, tenantId } });
}

// ---------------------------------------------------------------------------
// Room

export type RoomWriteArgs = {
  name: string;
  capacity: number | null;
  notes: string | null;
  groupId: string | null;
};

// A room's group is one of its own venue's groups.
async function assertRoomGroupInVenue(groupId: string | null, venueId: string) {
  if (!groupId) return;
  const group = await prisma.roomGroup.findFirst({ where: { id: groupId, venueId }, select: { id: true } });
  if (!group) throw new PermissionError("NOT_FOUND", "Room group not found");
}

export async function createRoomCore(venueId: string, args: RoomWriteArgs, userId: string, tenantId: string) {
  await requirePermissionForUser(userId, PermissionResource.VENUES, "WRITE", { tenantId });
  await assertVenueInTenant(venueId, tenantId);
  await assertRoomGroupInVenue(args.groupId, venueId);
  const room = await prisma.room.create({
    data: {
      name: args.name,
      capacity: args.capacity,
      notes: args.notes,
      venueId,
      groupId: args.groupId,
    },
  });
  await prisma.venue.update({ where: { id: venueId }, data: { updatedById: userId } });
  return room;
}

export async function updateRoomCore(
  roomId: string,
  venueId: string,
  args: RoomWriteArgs,
  userId: string,
  tenantId: string,
) {
  await requirePermissionForUser(userId, PermissionResource.VENUES, "WRITE", { tenantId });
  await assertVenueInTenant(venueId, tenantId);
  await assertRoomGroupInVenue(args.groupId, venueId);
  const room = await prisma.room.update({
    where: { id: roomId, venueId },
    data: {
      name: args.name,
      capacity: args.capacity,
      notes: args.notes,
      groupId: args.groupId,
    },
  });
  await prisma.venue.update({ where: { id: venueId }, data: { updatedById: userId } });
  return room;
}

export async function deleteRoomCore(roomId: string, venueId: string, userId: string, tenantId: string) {
  await requirePermissionForUser(userId, PermissionResource.VENUES, "DELETE", { tenantId });
  await assertVenueInTenant(venueId, tenantId);
  await prisma.room.delete({ where: { id: roomId, venueId } });
  await prisma.venue.update({ where: { id: venueId }, data: { updatedById: userId } });
}

// ---------------------------------------------------------------------------
// RoomGroup

export async function createRoomGroupCore(venueId: string, name: string, userId: string, tenantId: string) {
  await requirePermissionForUser(userId, PermissionResource.VENUES, "WRITE", { tenantId });
  await assertVenueInTenant(venueId, tenantId);
  const group = await prisma.roomGroup.create({ data: { name, venueId } });
  await prisma.venue.update({ where: { id: venueId }, data: { updatedById: userId } });
  return group;
}

export async function updateRoomGroupCore(
  groupId: string,
  venueId: string,
  name: string,
  userId: string,
  tenantId: string,
) {
  await requirePermissionForUser(userId, PermissionResource.VENUES, "WRITE", { tenantId });
  await assertVenueInTenant(venueId, tenantId);
  const group = await prisma.roomGroup.update({ where: { id: groupId, venueId }, data: { name } });
  await prisma.venue.update({ where: { id: venueId }, data: { updatedById: userId } });
  return group;
}

export async function deleteRoomGroupCore(groupId: string, venueId: string, userId: string, tenantId: string) {
  await requirePermissionForUser(userId, PermissionResource.VENUES, "DELETE", { tenantId });
  await assertVenueInTenant(venueId, tenantId);
  await prisma.roomGroup.delete({ where: { id: groupId, venueId } });
  await prisma.venue.update({ where: { id: venueId }, data: { updatedById: userId } });
}

// ---------------------------------------------------------------------------
// VenueContact (venue ↔ contact junction with optional role)

export async function addVenueContactCore(
  venueId: string,
  contactId: string,
  role: string | null,
  userId: string,
  tenantId: string,
) {
  await requirePermissionForUser(userId, PermissionResource.VENUES, "WRITE", { tenantId });
  await assertVenueInTenant(venueId, tenantId);
  const contact = await prisma.contact.findFirst({ where: { id: contactId, tenantId }, select: { id: true } });
  if (!contact) throw new PermissionError("NOT_FOUND", "Contact not found");
  const link = await prisma.venueContact.create({
    data: { venueId, contactId, role },
  });
  await prisma.venue.update({ where: { id: venueId }, data: { updatedById: userId } });
  return link;
}

export async function updateVenueContactCore(
  venueContactId: string,
  venueId: string,
  role: string | null,
  userId: string,
  tenantId: string,
) {
  await requirePermissionForUser(userId, PermissionResource.VENUES, "WRITE", { tenantId });
  await assertVenueInTenant(venueId, tenantId);
  const link = await prisma.venueContact.update({
    where: { id: venueContactId, venueId },
    data: { role },
  });
  await prisma.venue.update({ where: { id: venueId }, data: { updatedById: userId } });
  return link;
}

export async function removeVenueContactCore(
  venueContactId: string,
  venueId: string,
  userId: string,
  tenantId: string,
) {
  await requirePermissionForUser(userId, PermissionResource.VENUES, "DELETE", { tenantId });
  await assertVenueInTenant(venueId, tenantId);
  await prisma.venueContact.delete({ where: { id: venueContactId, venueId } });
  await prisma.venue.update({ where: { id: venueId }, data: { updatedById: userId } });
}

export type CreateAndAddVenueContactArgs = {
  venueId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  organization: string | null;
  role: string | null;
};

export async function createAndAddVenueContactCore(
  args: CreateAndAddVenueContactArgs,
  userId: string,
  tenantId: string,
) {
  await requirePermissionForUser(userId, PermissionResource.VENUES, "WRITE", { tenantId });
  await assertVenueInTenant(args.venueId, tenantId);
  const contact = await prisma.contact.create({
    data: {
      tenantId,
      firstName: args.firstName,
      lastName: args.lastName,
      email: args.email,
      organization: args.organization,
      updatedById: userId,
    },
  });
  const link = await prisma.venueContact.create({
    data: { venueId: args.venueId, contactId: contact.id, role: args.role },
  });
  await prisma.venue.update({
    where: { id: args.venueId },
    data: { updatedById: userId },
  });
  return link;
}

// Puts one amenity on a hotel's profile (a proposal confirmed one it lacked).
export async function addVenueAmenityCore(venueId: string, label: string, userId: string, tenantId: string) {
  await requirePermissionForUser(userId, PermissionResource.VENUES, "WRITE", { tenantId });
  const venue = await prisma.venue.findFirst({ where: { id: venueId, tenantId }, select: { amenities: true } });
  if (!venue) throw new PermissionError("NOT_FOUND");
  const [listed] = await requireListLabels(tenantId, "hotel_amenity", [label]);
  if (venue.amenities.includes(listed)) return;
  await prisma.venue.update({ where: { id: venueId, tenantId }, data: { amenities: [...venue.amenities, listed], updatedById: userId } });
}
