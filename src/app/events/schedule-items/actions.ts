"use server";

import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getScheduleItems(eventId: string) {
  await requireAuth();
  return prisma.functionSchedule.findMany({
    where: { function: { eventId } },
    include: {
      function: { select: { id: true, name: true, type: true } },
    },
    orderBy: { startTime: "asc" },
  });
}

export async function getScheduleTypes() {
  await requireAuth();
  return prisma.customOption.findMany({
    where: { category: "schedule_type" },
    orderBy: { sortOrder: "asc" },
  });
}

export async function deleteScheduleItem(id: string, eventId: string) {
  await requireAuth();
  await prisma.functionSchedule.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/schedule-items`);
}

export async function deleteScheduleItems(ids: string[], eventId: string) {
  await requireAuth();
  await prisma.functionSchedule.deleteMany({ where: { id: { in: ids } } });
  revalidatePath(`/events/${eventId}/schedule-items`);
}

export async function bulkUpdateScheduleItems(
  ids: string[],
  eventId: string,
  updates: { type?: string; isPublic?: boolean }
) {
  await requireAuth();
  const data: { type?: string; isPublic?: boolean } = {};
  if (updates.type !== undefined) data.type = updates.type;
  if (updates.isPublic !== undefined) data.isPublic = updates.isPublic;
  if (Object.keys(data).length === 0) return;
  await prisma.functionSchedule.updateMany({ where: { id: { in: ids } }, data });
  revalidatePath(`/events/${eventId}/schedule-items`);
}
