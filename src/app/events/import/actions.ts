"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { eventScopeWhere } from "../core";
import {
  importFromEventCore,
  getDefaultImportSource,
  type ImportSelection,
  type ImportResult,
} from "./core";

/** Events that can be imported FROM, newest first, scoped to what the user may see. */
export async function getImportSourceOptions(targetEventId: string) {
  const session = await requirePermission("EVENTS", "VIEW", targetEventId);
  const scopeWhere = await eventScopeWhere(session.user.id);
  return prisma.event.findMany({
    where: { ...scopeWhere, id: { not: targetEventId } },
    select: {
      id: true,
      name: true,
      startDate: true,
      timezone: true,
      series: { select: { id: true, name: true } },
    },
    orderBy: { startDate: "desc" },
    take: 50,
  });
}

export async function getDefaultSource(targetEventId: string) {
  await requirePermission("EVENTS", "VIEW", targetEventId);
  return getDefaultImportSource(targetEventId);
}

/**
 * What's available to pick in the source event, and which of it already has a
 * name-match in the target.
 *
 * Gated per entity type, not just on EVENTS VIEW — a user capped to VIEW on an
 * event may still lack FUNCTIONS or PRESENTATIONS there, and this must not
 * become a way to enumerate what /events/[id]/functions would refuse to show.
 * A type the caller can't read comes back empty rather than failing the page,
 * so they can still import the half they are allowed to.
 */
export async function getImportableContent(
  sourceEventId: string,
  targetEventId: string,
) {
  await requirePermission("EVENTS", "VIEW", sourceEventId);
  await requirePermission("EVENTS", "WRITE", targetEventId);

  const [canFunctions, canPresentations] = await Promise.all([
    hasPermission("FUNCTIONS", "VIEW", sourceEventId),
    hasPermission("PRESENTATIONS", "VIEW", sourceEventId),
  ]);

  const [functions, presentations, targetFunctions, targetPresentations] =
    await Promise.all([
      canFunctions
        ? prisma.function.findMany({
            where: { eventId: sourceEventId },
            select: {
              id: true,
              name: true,
              type: true,
              breakoutGroup: { select: { name: true } },
              schedules: {
                select: { startTime: true },
                orderBy: { startTime: "asc" },
                take: 1,
              },
            },
            orderBy: { name: "asc" },
          })
        : [],
      canPresentations
        ? prisma.presentation.findMany({
            where: { eventId: sourceEventId },
            select: {
              id: true,
              title: true,
              type: true,
              track: { select: { name: true } },
            },
            orderBy: { title: "asc" },
          })
        : [],
      prisma.function.findMany({
        where: { eventId: targetEventId },
        select: { name: true },
      }),
      prisma.presentation.findMany({
        where: { eventId: targetEventId },
        select: { title: true },
      }),
    ]);

  // Name collision is a heuristic, but it's the signal a person would use, and
  // it's what stands in for the per-row provenance link this feature does not keep.
  const fnNames = new Set(targetFunctions.map((f) => f.name));
  const presTitles = new Set(targetPresentations.map((p) => p.title));

  return {
    functions: functions.map((f) => ({
      ...f,
      alreadyPresent: fnNames.has(f.name),
    })),
    presentations: presentations.map((p) => ({
      ...p,
      alreadyPresent: presTitles.has(p.title),
    })),
  };
}

export async function importFromEvent(
  targetEventId: string,
  args: Omit<ImportSelection, "targetEventId">,
): Promise<ImportResult> {
  const session = await requirePermission("EVENTS", "WRITE", targetEventId);
  const result = await importFromEventCore(
    { ...args, targetEventId },
    session.user.id,
  );

  revalidatePath(`/events/${targetEventId}`);
  revalidatePath(`/events/${targetEventId}/functions`);
  revalidatePath(`/events/${targetEventId}/presentations`);
  return result;
}
