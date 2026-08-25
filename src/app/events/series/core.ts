// Pure cores for event series mutations. NOT a "use server" file.
// See src/app/events/core.ts for the security rationale.

import { PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermissionForUser } from "@/lib/permissions";

export async function createEventSeriesCore(name: string, userId: string) {
  await requirePermissionForUser(userId, PermissionResource.EVENTS, "WRITE");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Series name is required");

  const existing = await prisma.eventSeries.findUnique({ where: { name: trimmed } });
  if (existing) throw new Error("A series with this name already exists");

  return prisma.eventSeries.create({ data: { name: trimmed } });
}

export async function updateEventSeriesCore(id: string, name: string, userId: string) {
  await requirePermissionForUser(userId, PermissionResource.EVENTS, "WRITE");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Series name is required");

  const existing = await prisma.eventSeries.findUnique({ where: { name: trimmed } });
  if (existing && existing.id !== id) {
    throw new Error("A series with this name already exists");
  }

  return prisma.eventSeries.update({ where: { id }, data: { name: trimmed } });
}

export async function deleteEventSeriesCore(id: string, userId: string) {
  await requirePermissionForUser(userId, PermissionResource.EVENTS, "DELETE");

  // Deleting would SetNull the seriesId on every member event, silently
  // un-grouping them. Make the caller move them first.
  const count = await prisma.event.count({ where: { seriesId: id } });
  if (count > 0) {
    throw new Error(
      `This series still has ${count} event${count === 1 ? "" : "s"}. Move them to another series first.`,
    );
  }

  await prisma.eventSeries.delete({ where: { id } });
}
