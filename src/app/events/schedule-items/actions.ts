"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getScheduleItems(eventId: string) {
  return prisma.functionSchedule.findMany({
    where: { function: { eventId } },
    include: {
      function: { select: { id: true, name: true, type: true } },
    },
    orderBy: { startTime: "asc" },
  });
}

export async function getScheduleTypes() {
  return prisma.customOption.findMany({
    where: { category: "schedule_type" },
    orderBy: { sortOrder: "asc" },
  });
}

export async function deleteScheduleItem(id: string, eventId: string) {
  await prisma.functionSchedule.delete({ where: { id } });
  revalidatePath(`/events/${eventId}/schedule-items`);
}

export async function deleteScheduleItems(ids: string[], eventId: string) {
  await prisma.functionSchedule.deleteMany({ where: { id: { in: ids } } });
  revalidatePath(`/events/${eventId}/schedule-items`);
}

export async function bulkUpdateScheduleItems(
  ids: string[],
  eventId: string,
  updates: { type?: string; isPublic?: boolean }
) {
  const data: { type?: string; isPublic?: boolean } = {};
  if (updates.type !== undefined) data.type = updates.type;
  if (updates.isPublic !== undefined) data.isPublic = updates.isPublic;
  if (Object.keys(data).length === 0) return;
  await prisma.functionSchedule.updateMany({ where: { id: { in: ids } }, data });
  revalidatePath(`/events/${eventId}/schedule-items`);
}
