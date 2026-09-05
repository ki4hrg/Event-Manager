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

// Reading someone's assignments is part of administering the user, so it rides
// on USERS VIEW. Every mutation below still checks EVENTS WRITE on the specific
// event through the shared core — being able to see the panel doesn't grant the
// ability to change any particular row.
export async function getUserEventAccess(userId: string) {
  const { tenantId } = await requirePermission(PermissionResource.USERS, "VIEW");
  return prisma.eventStaff.findMany({
    where: { userId, event: { tenantId } },
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

export async function getSeriesGrantOptions() {
  const { tenantId } = await requirePermission(PermissionResource.USERS, "VIEW");
  return prisma.eventSeries.findMany({
    where: { tenantId },
    select: { id: true, name: true, _count: { select: { events: true } } },
    orderBy: { name: "asc" },
  });
}

export async function searchEventsForUserAccess(userId: string, query: string) {
  const { tenantId } = await requirePermission(PermissionResource.USERS, "VIEW");
  if (!query || query.length < 2) return [];
  return prisma.event.findMany({
    where: {
      AND: [
        { tenantId },
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
