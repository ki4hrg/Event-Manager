"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import {
  addEventStaffCore,
  setEventStaffLevelCore,
  removeEventStaffCore,
  parseAccessCap,
} from "./core";

// A user's role is per tenant now, so the badge shows their role in the
// event's tenant — the one that governs what they can do on this event.
const membershipRoleSelect = (tenantId: string) =>
  ({
    memberships: {
      where: { tenantId },
      select: { role: { select: { id: true, name: true } } },
      take: 1,
    },
  }) as const;

export async function getEventStaff(eventId: string) {
  const { tenantId } = await requirePermission("EVENTS", "VIEW", eventId);
  const rows = await prisma.eventStaff.findMany({
    where: { eventId },
    select: {
      id: true,
      accessLevel: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          ...membershipRoleSelect(tenantId),
        },
      },
    },
    orderBy: [{ user: { name: "asc" } }, { user: { email: "asc" } }],
  });
  return rows.map(({ user: { memberships, ...user }, ...row }) => ({
    ...row,
    user: { ...user, roleRef: memberships[0]?.role ?? null },
  }));
}

// Only members of the event's tenant can be staff on it.
export async function searchUsersForStaff(eventId: string, query: string) {
  const { tenantId } = await requirePermission("EVENTS", "WRITE", eventId);
  if (!query || query.length < 2) return [];
  const users = await prisma.user.findMany({
    where: {
      AND: [
        {
          OR: [
            { email: { contains: query, mode: "insensitive" } },
            { name: { contains: query, mode: "insensitive" } },
          ],
        },
        { staffAssignments: { none: { eventId } } },
        { memberships: { some: { tenantId } } },
      ],
    },
    select: {
      id: true,
      email: true,
      name: true,
      ...membershipRoleSelect(tenantId),
    },
    take: 10,
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
  return users.map(({ memberships, ...user }) => ({
    ...user,
    roleRef: memberships[0]?.role ?? null,
  }));
}

function revalidateStaff(eventId: string) {
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/staff`);
}

export async function addEventStaff(eventId: string, formData: FormData) {
  const session = await requirePermission("EVENTS", "WRITE", eventId);
  await addEventStaffCore(
    {
      eventId,
      userId: formData.get("userId") as string,
      // New assignments default to View — the safe end of the range, and the
      // common case for someone being added to an event they don't run.
      accessLevel: parseAccessCap(formData.get("accessLevel") ?? "VIEW"),
    },
    session.user.id,
  );
  revalidateStaff(eventId);
}

export async function setEventStaffLevel(
  staffId: string,
  eventId: string,
  accessLevel: string | null,
) {
  const session = await requirePermission("EVENTS", "WRITE", eventId);
  await setEventStaffLevelCore(
    { staffId, eventId, accessLevel: parseAccessCap(accessLevel) },
    session.user.id,
  );
  revalidateStaff(eventId);
}

export async function removeEventStaff(staffId: string, eventId: string) {
  const session = await requirePermission("EVENTS", "WRITE", eventId);
  await removeEventStaffCore(staffId, eventId, session.user.id);
  revalidateStaff(eventId);
}
