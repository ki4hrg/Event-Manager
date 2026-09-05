// Pure cores for event staff mutations. NOT a "use server" file.
// Colocated with the actions that wrap them (see CLAUDE.md § Project structure);
// other features keep their core at the feature root because that's where their
// actions.ts lives — staff's lives under [id]/.

import { PermissionLevel, PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PermissionError, requirePermissionForUser } from "@/lib/permissions";
import { UNCAPPED } from "@/lib/accessLevels";

// A cap of NONE would leave someone on the staff list — and therefore in their
// own events list — while denying them the event entirely. Removing the staff
// row is how access is revoked; the cap only ever narrows a level they have.
export type AccessCap = Extract<PermissionLevel, "VIEW" | "WRITE" | "DELETE">;

export function parseAccessCap(value: unknown): AccessCap | null {
  if (value == null || value === "" || value === UNCAPPED) return null;
  if (value === "VIEW" || value === "WRITE" || value === "DELETE") return value;
  throw new Error(
    `Invalid access level: ${JSON.stringify(value)}. Use VIEW, WRITE, DELETE, or null for uncapped. Remove the staff assignment to revoke access.`,
  );
}

/**
 * Assign a user to an event, optionally capping what they can do there.
 *
 * `accessLevel` distinguishes three inputs: a cap, `null` for explicitly
 * uncapped, and `undefined` for "don't express an opinion". The last matters
 * because this upserts — re-adding someone who is already assigned must not
 * silently clear a cap the caller never mentioned, which would widen their
 * access. Prisma ignores `undefined` in `update`, so absent means unchanged.
 */
export async function addEventStaffCore(
  args: { eventId: string; userId: string; accessLevel?: AccessCap | null },
  actorUserId: string,
) {
  await requirePermissionForUser(
    actorUserId,
    PermissionResource.EVENTS,
    "WRITE",
    args.eventId,
  );
  if (!args.userId) throw new Error("User is required");

  // Staff must belong to the event's tenant; a user id from elsewhere reads as
  // not-found rather than granting an outsider a foothold on the event.
  const member = await prisma.tenantMembership.findFirst({
    where: { userId: args.userId, tenant: { events: { some: { id: args.eventId } } } },
    select: { id: true },
  });
  if (!member) throw new PermissionError("NOT_FOUND", "User is not a member of this tenant");

  return prisma.eventStaff.upsert({
    where: { userId_eventId: { userId: args.userId, eventId: args.eventId } },
    create: {
      userId: args.userId,
      eventId: args.eventId,
      accessLevel: args.accessLevel ?? null,
    },
    update: { accessLevel: args.accessLevel },
  });
}

export async function setEventStaffLevelCore(
  args: { staffId: string; eventId: string; accessLevel: AccessCap | null },
  actorUserId: string,
) {
  await requirePermissionForUser(
    actorUserId,
    PermissionResource.EVENTS,
    "WRITE",
    args.eventId,
  );

  const existing = await prisma.eventStaff.findFirst({
    where: { id: args.staffId, eventId: args.eventId },
    select: { id: true },
  });
  if (!existing) throw new PermissionError("NOT_FOUND");

  return prisma.eventStaff.update({
    where: { id: existing.id },
    data: { accessLevel: args.accessLevel },
  });
}

export async function removeEventStaffCore(
  staffId: string,
  eventId: string,
  actorUserId: string,
) {
  await requirePermissionForUser(actorUserId, PermissionResource.EVENTS, "WRITE", eventId);
  await prisma.eventStaff.deleteMany({ where: { id: staffId, eventId } });
}

/**
 * Grant one user access to every event in a series at a single cap.
 *
 * The provisioning move for someone joining mid-history — a venue rep who needs
 * to read the past years before they host one. Events the actor can't write are
 * skipped rather than failing the batch, and reported back so the caller can say
 * so.
 */
export async function grantSeriesAccessCore(
  args: { userId: string; seriesId: string; accessLevel: AccessCap | null },
  actorUserId: string,
) {
  // The series decides the tenant; a global gate there first, so a caller with
  // no event write at all gets a clean refusal instead of an empty "skipped
  // everything" result.
  const series = await prisma.eventSeries.findUnique({
    where: { id: args.seriesId },
    select: { tenantId: true },
  });
  if (!series) throw new PermissionError("NOT_FOUND");
  await requirePermissionForUser(actorUserId, PermissionResource.EVENTS, "WRITE", {
    tenantId: series.tenantId,
  });

  const events = await prisma.event.findMany({
    where: { seriesId: args.seriesId, tenantId: series.tenantId },
    select: { id: true, name: true },
    orderBy: { startDate: "desc" },
  });

  const granted: string[] = [];
  const skipped: string[] = [];

  for (const event of events) {
    try {
      await addEventStaffCore(
        { eventId: event.id, userId: args.userId, accessLevel: args.accessLevel },
        actorUserId,
      );
      granted.push(event.name);
    } catch (err) {
      if (err instanceof PermissionError) {
        skipped.push(event.name);
        continue;
      }
      throw err;
    }
  }

  return { granted, skipped };
}
