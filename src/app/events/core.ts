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

// Venues and series are tenant-owned lookups; a foreign id is a not-found, not
// a cross-tenant link.
async function assertEventRefsInTenant(args: EventWriteArgs, tenantId: string) {
  const [venueCount, series] = await Promise.all([
    args.venueIds.length > 0
      ? prisma.venue.count({ where: { id: { in: args.venueIds }, tenantId } })
      : 0,
    args.seriesId
      ? prisma.eventSeries.findFirst({ where: { id: args.seriesId, tenantId }, select: { id: true } })
      : null,
  ]);
  if (venueCount !== args.venueIds.length) throw new PermissionError("NOT_FOUND", "Venue not found");
  if (args.seriesId && !series) throw new PermissionError("NOT_FOUND", "Series not found");
}

// Position in the list is the venue's sortOrder; the first is primary.
function eventVenueRows(venueIds: string[]) {
  return venueIds.map((venueId, sortOrder) => ({ venueId, sortOrder }));
}

// ---------------------------------------------------------------------------
// Event

export type EventWriteArgs = {
  name: string;
  description: string | null;
  startDate: Date;
  endDate: Date;
  timezone: string;
  // In event order — the first is the primary venue. Duplicates are dropped.
  venueIds: string[];
  seriesId: string | null;
  // Membership (eligible maximum) and attendance are separate measures; the
  // count is only meaningful when isMembershipBased. Optional for older callers.
  isMembershipBased?: boolean;
  membershipCount?: number | null;
  expectedAttendance?: number | null;
  actualAttendance?: number | null;
};

function assertEventDates(args: EventWriteArgs) {
  if (args.endDate < args.startDate) throw new Error("End date can't be before the start date");
}

function attendanceData(args: EventWriteArgs) {
  return {
    ...(args.isMembershipBased !== undefined ? { isMembershipBased: args.isMembershipBased } : {}),
    ...(args.membershipCount !== undefined ? { membershipCount: args.membershipCount } : {}),
    ...(args.expectedAttendance !== undefined ? { expectedAttendance: args.expectedAttendance } : {}),
    ...(args.actualAttendance !== undefined ? { actualAttendance: args.actualAttendance } : {}),
  };
}

export async function createEventCore(input: EventWriteArgs, userId: string, tenantId: string) {
  await requirePermissionForUser(userId, PermissionResource.EVENTS, "WRITE", { tenantId });
  const args = { ...input, venueIds: Array.from(new Set(input.venueIds)) };
  assertEventDates(args);
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
      seriesId: args.seriesId,
      ...attendanceData(args),
      venues: { create: eventVenueRows(args.venueIds) },
      staff: { create: { userId } },
    },
  });
}

export async function updateEventCore(id: string, input: EventWriteArgs, userId: string) {
  await requirePermissionForUser(userId, PermissionResource.EVENTS, "WRITE", id);
  const args = { ...input, venueIds: Array.from(new Set(input.venueIds)) };
  assertEventDates(args);
  await assertEventRefsInTenant(args, await requireEventTenantId(id));
  // Rooms of a venue removed here stay attached to any function/order already
  // using them — dropping a venue never silently rewrites the schedule.
  return prisma.event.update({
    where: { id },
    data: {
      name: args.name,
      description: args.description,
      startDate: args.startDate,
      endDate: args.endDate,
      timezone: args.timezone || "America/Chicago",
      seriesId: args.seriesId,
      ...attendanceData(args),
      venues: { deleteMany: {}, create: eventVenueRows(args.venueIds) },
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

// ESG Part I §C (responsibilities, on/off-site), §L (emergency contact) and
// §X (authorized signatory = has an approval authority). Optional so callers
// that predate them keep working; omitted keys are left alone on update.
export type KeyStaffEsgArgs = {
  responsibilities?: string | null;
  onSite?: boolean | null;
  isEmergencyContact?: boolean;
  approvalAuthority?: string | null;
};

function keyStaffEsgData(args: KeyStaffEsgArgs) {
  return {
    ...(args.responsibilities !== undefined ? { responsibilities: args.responsibilities } : {}),
    ...(args.onSite !== undefined ? { onSite: args.onSite } : {}),
    ...(args.isEmergencyContact !== undefined ? { isEmergencyContact: args.isEmergencyContact } : {}),
    ...(args.approvalAuthority !== undefined ? { approvalAuthority: args.approvalAuthority } : {}),
  };
}

export type AddEventKeyStaffArgs = KeyStaffEsgArgs & {
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
      ...keyStaffEsgData(args),
    },
  });
  await prisma.event.update({ where: { id: args.eventId }, data: { updatedById: userId } });
  return row;
}

export type UpdateEventKeyStaffArgs = KeyStaffEsgArgs & {
  keyStaffId: string;
  eventId: string;
  title: string | null;
  models: string[];
};

export async function updateEventKeyStaffCore(args: UpdateEventKeyStaffArgs, userId: string) {
  await requirePermissionForUser(userId, PermissionResource.EVENTS, "WRITE", args.eventId);
  const row = await prisma.eventKeyStaff.update({
    where: { id: args.keyStaffId, eventId: args.eventId },
    data: { title: args.title, models: args.models, ...keyStaffEsgData(args) },
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

export type CreateContactAndAddKeyStaffArgs = KeyStaffEsgArgs & {
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
        ...keyStaffEsgData(args),
      },
    });
    await tx.event.update({ where: { id: args.eventId }, data: { updatedById: userId } });
    return row;
  });
}
