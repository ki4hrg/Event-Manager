"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { generateShareToken } from "@/lib/shareLinks";
import type { ShareLinkFilters } from "@/lib/shareLinks";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type CreateShareLinkGroupInput = {
  eventId: string;
  label?: string | null;
  expiresAt?: string | null;
};

export async function createShareLinkGroup(input: CreateShareLinkGroupInput) {
  const session = await requirePermission("SHARE_LINKS", "WRITE", input.eventId);
  const token = generateShareToken();
  const group = await prisma.shareLinkGroup.create({
    data: {
      token,
      eventId: input.eventId,
      label: input.label || null,
      createdById: session.user.id,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
  });
  revalidatePath(`/events/${input.eventId}/share-links`);
  return group;
}

export async function updateShareLinkGroup(
  id: string,
  patch: { label?: string | null; expiresAt?: string | null },
) {
  const existing = await prisma.shareLinkGroup.findUniqueOrThrow({
    where: { id },
    select: { eventId: true },
  });
  await requirePermission("SHARE_LINKS", "WRITE", existing.eventId);
  await prisma.shareLinkGroup.update({
    where: { id, eventId: existing.eventId },
    data: {
      ...(patch.label !== undefined ? { label: patch.label || null } : {}),
      ...(patch.expiresAt !== undefined
        ? { expiresAt: patch.expiresAt ? new Date(patch.expiresAt) : null }
        : {}),
    },
  });
  revalidatePath(`/events/${existing.eventId}/share-links`);
  revalidatePath(`/events/${existing.eventId}/share-links/dashboards/${id}`);
}

export async function revokeShareLinkGroup(id: string) {
  const group = await prisma.shareLinkGroup.findUniqueOrThrow({
    where: { id },
    select: { eventId: true },
  });
  await requirePermission("SHARE_LINKS", "WRITE", group.eventId);
  await prisma.shareLinkGroup.update({
    where: { id, eventId: group.eventId },
    data: { revokedAt: new Date() },
  });
  revalidatePath(`/events/${group.eventId}/share-links`);
  revalidatePath(`/events/${group.eventId}/share-links/dashboards/${id}`);
}

export async function deleteShareLinkGroup(id: string) {
  const group = await prisma.shareLinkGroup.findUniqueOrThrow({
    where: { id },
    select: { eventId: true },
  });
  await requirePermission("SHARE_LINKS", "DELETE", group.eventId);
  await prisma.shareLinkGroup.delete({ where: { id, eventId: group.eventId } });
  revalidatePath(`/events/${group.eventId}/share-links`);
  redirect(`/events/${group.eventId}/share-links?success=Dashboard+deleted`);
}

export async function listShareLinkGroupsForEvent(eventId: string) {
  await requirePermission("SHARE_LINKS", "VIEW", eventId);
  return prisma.shareLinkGroup.findMany({
    where: { eventId },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { name: true, email: true } },
      _count: { select: { items: true } },
    },
  });
}

export async function listShareLinkGroupChoicesForEvent(eventId: string) {
  await requirePermission("SHARE_LINKS", "VIEW", eventId);
  const groups = await prisma.shareLinkGroup.findMany({
    where: { eventId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      label: true,
      expiresAt: true,
      _count: { select: { items: true } },
    },
  });
  const now = new Date();
  return groups
    .filter((g) => !g.expiresAt || g.expiresAt >= now)
    .map((g) => ({ id: g.id, label: g.label, itemCount: g._count.items }));
}

export async function getShareLinkGroup(id: string) {
  const row = await prisma.shareLinkGroup.findUnique({
    where: { id },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      createdBy: { select: { name: true, email: true } },
    },
  });
  if (!row) return null;
  await requirePermission("SHARE_LINKS", "VIEW", row.eventId);
  return row;
}

export type AddShareLinkGroupItemInput = {
  reportType: string;
  filters: ShareLinkFilters;
  filtersLocked: boolean;
  label?: string | null;
};

export async function addShareLinkGroupItem(
  groupId: string,
  input: AddShareLinkGroupItemInput,
) {
  const group = await prisma.shareLinkGroup.findUniqueOrThrow({
    where: { id: groupId },
    select: { eventId: true },
  });
  await requirePermission("SHARE_LINKS", "WRITE", group.eventId);
  const last = await prisma.shareLinkGroupItem.findFirst({
    where: { groupId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const nextSort = (last?.sortOrder ?? -10) + 10;
  const item = await prisma.shareLinkGroupItem.create({
    data: {
      groupId,
      reportType: input.reportType,
      filters: input.filters,
      filtersLocked: input.filtersLocked,
      label: input.label || null,
      sortOrder: nextSort,
    },
  });
  revalidatePath(`/events/${group.eventId}/share-links/dashboards/${groupId}`);
  return item;
}

export async function updateShareLinkGroupItem(
  itemId: string,
  patch: {
    label?: string | null;
    filtersLocked?: boolean;
    filters?: ShareLinkFilters;
  },
) {
  const item = await prisma.shareLinkGroupItem.findUniqueOrThrow({
    where: { id: itemId },
    select: { groupId: true, group: { select: { eventId: true } } },
  });
  await requirePermission("SHARE_LINKS", "WRITE", item.group.eventId);
  await prisma.shareLinkGroupItem.update({
    where: { id: itemId, group: { eventId: item.group.eventId } },
    data: {
      ...(patch.label !== undefined ? { label: patch.label || null } : {}),
      ...(patch.filtersLocked !== undefined
        ? { filtersLocked: patch.filtersLocked }
        : {}),
      ...(patch.filters !== undefined ? { filters: patch.filters } : {}),
    },
  });
  revalidatePath(
    `/events/${item.group.eventId}/share-links/dashboards/${item.groupId}`,
  );
}

export async function removeShareLinkGroupItem(itemId: string) {
  const item = await prisma.shareLinkGroupItem.findUniqueOrThrow({
    where: { id: itemId },
    select: { groupId: true, group: { select: { eventId: true } } },
  });
  await requirePermission("SHARE_LINKS", "WRITE", item.group.eventId);
  await prisma.shareLinkGroupItem.delete({ where: { id: itemId, group: { eventId: item.group.eventId } } });
  revalidatePath(
    `/events/${item.group.eventId}/share-links/dashboards/${item.groupId}`,
  );
}

export async function reorderShareLinkGroupItems(
  groupId: string,
  orderedIds: string[],
) {
  const group = await prisma.shareLinkGroup.findUniqueOrThrow({
    where: { id: groupId },
    select: { eventId: true },
  });
  await requirePermission("SHARE_LINKS", "WRITE", group.eventId);
  await prisma.$transaction(
    orderedIds.map((id, idx) =>
      prisma.shareLinkGroupItem.update({
        where: { id, group: { eventId: group.eventId } },
        data: { sortOrder: (idx + 1) * 10 },
      }),
    ),
  );
  revalidatePath(`/events/${group.eventId}/share-links/dashboards/${groupId}`);
}
