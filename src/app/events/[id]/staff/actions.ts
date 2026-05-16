"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { revalidatePath } from "next/cache";

export async function getEventStaff(eventId: string) {
  await requirePermission("EVENTS", "VIEW", eventId);
  return prisma.eventStaff.findMany({
    where: { eventId },
    select: {
      id: true,
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

export async function addEventStaff(eventId: string, formData: FormData) {
  await requirePermission("EVENTS", "WRITE", eventId);
  const userId = formData.get("userId") as string;
  if (!userId) throw new Error("User is required");

  await prisma.eventStaff.upsert({
    where: { userId_eventId: { userId, eventId } },
    create: { userId, eventId },
    update: {},
  });
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/staff`);
}

export async function removeEventStaff(staffId: string, eventId: string) {
  await requirePermission("EVENTS", "WRITE", eventId);
  await prisma.eventStaff.delete({ where: { id: staffId, eventId } });
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/staff`);
}
