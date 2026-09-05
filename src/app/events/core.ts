// Pure cores for event + event key staff mutations. NOT a "use server" file.
// See src/app/contacts/core.ts for the security rationale.

import { PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  loadPermissionsForUser,
  requireEventTenantId,
  requirePermissionForUser,
  PermissionError,
} from "@/lib/permissions";

// The single definition of "which events may this user see". A role with
// EVENTS:UNASSIGNED above NONE sees everything; everyone else sees only the
// events they are staff on. Every list that returns events — the events page,
// the series page, and their MCP equivalents — must AND this in, or it becomes
// a way to enumerate events the caller has no access to.
//
// Always tenant-bound: the events of a tenant the user isn't a member of are
// never listed, whatever their role elsewhere says.
export async function eventScopeWhere(userId: string, tenantId: string) {
  const { permissions } = await loadPermissionsForUser(userId, tenantId);
  const unassigned = permissions.find(
    (p) => p.resource === PermissionResource.EVENTS && p.scope === "UNASSIGNED",
  );
  const canSeeUnassigned = unassigned && unassigned.level !== "NONE";
  return canSeeUnassigned ? { tenantId } : { tenantId, staff: { some: { userId } } };
}

// Venue and series are tenant-owned lookups; a foreign id is a not-found, not
// a cross-tenant link.
async function assertEventRefsInTenant(args: EventWriteArgs, tenantId: string) {
  const [venue, series] = await Promise.all([
    args.venueId
      ? prisma.venue.findFirst({ where: { id: args.venueId, tenantId }, select: { id: true } })
      : null,
    args.seriesId
      ? prisma.eventSeries.findFirst({ where: { id: args.seriesId, tenantId }, select: { id: true } })
      : null,
  ]);
  if (args.venueId && !venue) throw new PermissionError("NOT_FOUND", "Venue not found");
  if (args.seriesId && !series) throw new PermissionError("NOT_FOUND", "Series not found");
}

// ---------------------------------------------------------------------------
// Event

export type EventWriteArgs = {
  name: string;
  description: string | null;
  startDate: Date;
  endDate: Date;
  timezone: string;
  venueId: string | null;
  seriesId: string | null;
};

export async function createEventCore(args: EventWriteArgs, userId: string, tenantId: string) {
  await requirePermissionForUser(userId, PermissionResource.EVENTS, "WRITE", { tenantId });
  await assertEventRefsInTenant(args, tenantId);
  // Auto-assign the creator as event staff so a role with EVENTS:UNASSIGNED:NONE
  // doesn't lose access to events they just created.
  return prisma.event.create({
    data: {
      tenantId,
      name: args.name,
      description: args.description,
      startDate: args.startDate,
      endDate: args.endDate,
      timezone: args.timezone || "America/Chicago",
      venueId: args.venueId,
      seriesId: args.seriesId,
      staff: { create: { userId } },
    },
  });
}

export async function updateEventCore(id: string, args: EventWriteArgs, userId: string) {
  await requirePermissionForUser(userId, PermissionResource.EVENTS, "WRITE", id);
  await assertEventRefsInTenant(args, await requireEventTenantId(id));
  return prisma.event.update({
    where: { id },
    data: {
      name: args.name,
      description: args.description,
      startDate: args.startDate,
      endDate: args.endDate,
      timezone: args.timezone || "America/Chicago",
      venueId: args.venueId,
      seriesId: args.seriesId,
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
  const tenantId = await requireEventTenantId(args.eventId);
  return prisma.$transaction(async (tx) => {
    const contact = await tx.contact.create({
      data: {
        tenantId,
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
