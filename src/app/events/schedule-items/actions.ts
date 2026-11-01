"use server";

import { z } from "zod";

import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { syncFunctionNumbers } from "@/lib/functionNumbering";
import { refreshWorkflowStatusForFunctions } from "@/app/events/workflows/core";
import { idList, parseArgs } from "@/lib/validation";

export async function getScheduleItems(eventId: string) {
  await requirePermission("FUNCTIONS", "VIEW", eventId);
  return prisma.functionSchedule.findMany({
    where: { function: { eventId } },
    include: {
      function: { select: { id: true, name: true, functionNumber: true, type: true } },
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
  const { functionId } = await prisma.functionSchedule.delete({ where: { id, function: { eventId } } });
  await syncFunctionNumbers(eventId);
  await refreshWorkflowStatusForFunctions([functionId], eventId);
  revalidatePath(`/events/${eventId}/schedule-items`);
}

export async function deleteScheduleItems(ids: string[], eventId: string) {
  await requirePermission("FUNCTIONS", "DELETE", eventId);
  ids = parseArgs(idList(5_000), ids);
  const affected = await prisma.functionSchedule.findMany({
    where: { id: { in: ids }, function: { eventId } },
    select: { functionId: true },
  });
  await prisma.functionSchedule.deleteMany({ where: { id: { in: ids }, function: { eventId } } });
  await syncFunctionNumbers(eventId);
  await refreshWorkflowStatusForFunctions(Array.from(new Set(affected.map((s) => s.functionId))), eventId);
  revalidatePath(`/events/${eventId}/schedule-items`);
}

export async function bulkUpdateScheduleItems(
  ids: string[],
  eventId: string,
  updates: { type?: string; isPublic?: boolean }
) {
  await requirePermission("FUNCTIONS", "WRITE", eventId);
  ids = parseArgs(idList(5_000), ids);
  updates = parseArgs(z.strictObject({ type: z.string().max(1_000).optional(), isPublic: z.boolean().optional() }), updates);
  const data: { type?: string; isPublic?: boolean } = {};
  if (updates.type !== undefined) data.type = updates.type;
  if (updates.isPublic !== undefined) data.isPublic = updates.isPublic;
  if (Object.keys(data).length === 0) return;
  await prisma.functionSchedule.updateMany({ where: { id: { in: ids }, function: { eventId } }, data });
  await syncFunctionNumbers(eventId);
  revalidatePath(`/events/${eventId}/schedule-items`);
}
