"use server";

import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function getScheduleItems(eventId: string) {
  await requirePermission("FUNCTIONS", "VIEW", eventId);
  return prisma.functionSchedule.findMany({
    where: { function: { eventId } },
    include: {
      function: { select: { id: true, name: true, type: true } },
    },
    orderBy: { startTime: "asc" },
  });
}

export async function getScheduleTypes() {
  // schedule_type CustomOption is reused by every event-scoped schedule form;
  // gate on FUNCTIONS:VIEW (GLOBAL) so non-admin Users can render the type picker.
  const session = await requirePermission("FUNCTIONS", "VIEW");
  return prisma.customOption.findMany({
    where: { tenantId: session.tenantId, category: "schedule_type" },
    orderBy: { sortOrder: "asc" },
  });
}

export async function deleteScheduleItem(id: string, eventId: string) {
  await requirePermission("FUNCTIONS", "DELETE", eventId);
  await prisma.functionSchedule.delete({ where: { id, function: { eventId } } });
  revalidatePath(`/events/${eventId}/schedule-items`);
}

export async function deleteScheduleItems(ids: string[], eventId: string) {
  await requirePermission("FUNCTIONS", "DELETE", eventId);
  await prisma.functionSchedule.deleteMany({ where: { id: { in: ids }, function: { eventId } } });
  revalidatePath(`/events/${eventId}/schedule-items`);
}

export async function bulkUpdateScheduleItems(
  ids: string[],
  eventId: string,
  updates: { type?: string; isPublic?: boolean }
) {
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  const data: { type?: string; isPublic?: boolean } = {};
  if (updates.type !== undefined) data.type = updates.type;
  if (updates.isPublic !== undefined) data.isPublic = updates.isPublic;
  if (Object.keys(data).length === 0) return;
  await prisma.functionSchedule.updateMany({ where: { id: { in: ids }, function: { eventId } }, data });
  revalidatePath(`/events/${eventId}/schedule-items`);
}
