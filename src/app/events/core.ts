// Pure cores for event + event key staff mutations. NOT a "use server" file.
// See src/app/contacts/core.ts for the security rationale.

import { PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermissionForUser } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// Event

export type EventWriteArgs = {
  name: string;
  description: string | null;
  startDate: Date;
  endDate: Date;
  timezone: string;
  venueId: string | null;
};

export async function createEventCore(args: EventWriteArgs, userId: string) {
  await requirePermissionForUser(userId, PermissionResource.EVENTS, "WRITE");
  // Auto-assign the creator as event staff so a role with EVENTS:UNASSIGNED:NONE
  // doesn't lose access to events they just created.
  return prisma.event.create({
    data: {
      name: args.name,
      description: args.description,
      startDate: args.startDate,
      endDate: args.endDate,
      timezone: args.timezone || "America/Chicago",
      venueId: args.venueId,
      staff: { create: { userId } },
    },
  });
}

export async function updateEventCore(id: string, args: EventWriteArgs, userId: string) {
  await requirePermissionForUser(userId, PermissionResource.EVENTS, "WRITE", id);
  return prisma.event.update({
    where: { id },
    data: {
      name: args.name,
      description: args.description,
      startDate: args.startDate,
      endDate: args.endDate,
      timezone: args.timezone || "America/Chicago",
      venueId: args.venueId,
      updatedById: userId,
    },
  });
}

export async function deleteEventCore(id: string, userId: string) {
  await requirePermissionForUser(userId, PermissionResource.EVENTS, "DELETE", id);
  await prisma.event.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// EventKeyStaff (event ↔ contact role assignment with optional model-type scoping)

export type AddEventKeyStaffArgs = {
  eventId: string;
  contactId: string;
  title: string | null;
  models: string[];
};

export async function addEventKeyStaffCore(args: AddEventKeyStaffArgs, userId: string) {
  await requirePermissionForUser(userId, PermissionResource.EVENTS, "WRITE", args.eventId);
  const row = await prisma.eventKeyStaff.create({
    data: {
      eventId: args.eventId,
      contactId: args.contactId,
      title: args.title,
      models: args.models,
    },
  });
  await prisma.event.update({ where: { id: args.eventId }, data: { updatedById: userId } });
  return row;
}

export type UpdateEventKeyStaffArgs = {
  keyStaffId: string;
  eventId: string;
  title: string | null;
  models: string[];
};

export async function updateEventKeyStaffCore(args: UpdateEventKeyStaffArgs, userId: string) {
  await requirePermissionForUser(userId, PermissionResource.EVENTS, "WRITE", args.eventId);
  const row = await prisma.eventKeyStaff.update({
    where: { id: args.keyStaffId, eventId: args.eventId },
    data: { title: args.title, models: args.models },
  });
  await prisma.event.update({ where: { id: args.eventId }, data: { updatedById: userId } });
  return row;
}

export async function removeEventKeyStaffCore(
  keyStaffId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, PermissionResource.EVENTS, "WRITE", eventId);
  await prisma.eventKeyStaff.delete({ where: { id: keyStaffId, eventId } });
  await prisma.event.update({ where: { id: eventId }, data: { updatedById: userId } });
}

export type CreateContactAndAddKeyStaffArgs = {
  eventId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  organization: string | null;
  title: string | null;
  models: string[];
};

export async function createContactAndAddKeyStaffCore(
  args: CreateContactAndAddKeyStaffArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, PermissionResource.EVENTS, "WRITE", args.eventId);
  return prisma.$transaction(async (tx) => {
    const contact = await tx.contact.create({
      data: {
        firstName: args.firstName,
        lastName: args.lastName,
        email: args.email,
        organization: args.organization,
        updatedById: userId,
      },
    });
    const row = await tx.eventKeyStaff.create({
      data: {
        eventId: args.eventId,
        contactId: contact.id,
        title: args.title,
        models: args.models,
      },
    });
    await tx.event.update({ where: { id: args.eventId }, data: { updatedById: userId } });
    return row;
  });
}
