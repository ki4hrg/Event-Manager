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

export async function getEventStaff(eventId: string) {
  await requirePermission("EVENTS", "VIEW", eventId);
  return prisma.eventStaff.findMany({
    where: { eventId },
    select: {
      id: true,
      accessLevel: true,
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          roleRef: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ user: { name: "asc" } }, { user: { email: "asc" } }],
  });
}

export async function searchUsersForStaff(eventId: string, query: string) {
  await requirePermission("EVENTS", "WRITE", eventId);
  if (!query || query.length < 2) return [];
  return prisma.user.findMany({
    where: {
      AND: [
        {
          OR: [
            { email: { contains: query, mode: "insensitive" } },
            { name: { contains: query, mode: "insensitive" } },
          ],
        },
        { staffAssignments: { none: { eventId } } },
      ],
    },
    select: {
      id: true,
      email: true,
      name: true,
      roleRef: { select: { name: true } },
    },
    take: 10,
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
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
