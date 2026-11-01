"use server";

import { revalidatePath } from "next/cache";
import { PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import {
  addEventStaffCore,
  setEventStaffLevelCore,
  removeEventStaffCore,
  grantSeriesAccessCore,
  parseAccessCap,
} from "@/app/events/[id]/staff/core";
import { eventScopeWhere } from "@/app/events/core";
import { assertIds } from "@/lib/validation";

// Reading someone's assignments is part of administering the user, so it rides
// on USERS VIEW, but only over events the admin can open themselves ("Visible
// events"): the panel never names an event the admin couldn't see elsewhere.
// Every mutation below still checks EVENTS WRITE on the specific event through
// the shared core — seeing a row doesn't grant changing it.
export async function getUserEventAccess(userId: string) {
  const session = await requirePermission(PermissionResource.USERS, "VIEW");
  assertIds(userId);
  return prisma.eventStaff.findMany({
    where: { userId, event: await eventScopeWhere(session.user.id, session.tenantId) },
    select: {
      id: true,
      accessLevel: true,
      event: {
        select: {
          id: true,
          name: true,
          startDate: true,
          timezone: true,
          series: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { event: { startDate: "desc" } },
  });
}

// The event count is of events the admin can see.
export async function getSeriesGrantOptions() {
  const session = await requirePermission(PermissionResource.USERS, "VIEW");
  const visible = await eventScopeWhere(session.user.id, session.tenantId);
  return prisma.eventSeries.findMany({
    where: { tenantId: session.tenantId },
    select: { id: true, name: true, _count: { select: { events: { where: visible } } } },
    orderBy: { name: "asc" },
  });
}

export async function searchEventsForUserAccess(userId: string, query: string) {
  const session = await requirePermission(PermissionResource.USERS, "VIEW");
  assertIds(userId);
  if (typeof query !== "string" || query.length < 2 || query.length > 200) return [];
  return prisma.event.findMany({
    where: {
      AND: [
        // Only events the admin can see themselves; granting one still needs
        // EVENTS WRITE on it.
        await eventScopeWhere(session.user.id, session.tenantId),
        { name: { contains: query, mode: "insensitive" } },
        { staff: { none: { userId } } },
      ],
    },
    select: {
      id: true,
      name: true,
      startDate: true,
      timezone: true,
      series: { select: { name: true } },
    },
    take: 10,
    orderBy: { startDate: "desc" },
  });
}

function revalidateUserAccess(userId: string) {
  revalidatePath(`/users/${userId}`);
  revalidatePath("/events");
}

export async function grantUserEventAccess(
  userId: string,
  eventId: string,
  accessLevel: string,
) {
  const session = await requirePermission(PermissionResource.USERS, "VIEW");
  await addEventStaffCore(
    { eventId, userId, accessLevel: parseAccessCap(accessLevel) },
    session.user.id,
  );
  revalidateUserAccess(userId);
}

export async function setUserEventAccessLevel(
  userId: string,
  staffId: string,
  eventId: string,
  accessLevel: string,
) {
  const session = await requirePermission(PermissionResource.USERS, "VIEW");
  await setEventStaffLevelCore(
    { staffId, eventId, accessLevel: parseAccessCap(accessLevel) },
    session.user.id,
  );
  revalidateUserAccess(userId);
}

export async function revokeUserEventAccess(
  userId: string,
  staffId: string,
  eventId: string,
) {
  const session = await requirePermission(PermissionResource.USERS, "VIEW");
  await removeEventStaffCore(staffId, eventId, session.user.id);
  revalidateUserAccess(userId);
}

export async function grantUserSeriesAccess(
  userId: string,
  seriesId: string,
  accessLevel: string,
) {
  const session = await requirePermission(PermissionResource.USERS, "VIEW");
  const result = await grantSeriesAccessCore(
    { userId, seriesId, accessLevel: parseAccessCap(accessLevel) },
    session.user.id,
  );
  revalidateUserAccess(userId);
  return result;
}
