"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { generateShareToken } from "@/lib/shareLinks";
import type { ShareLinkFilters } from "@/lib/shareLinks";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  shareLinkExpirySchema,
  shareLinkFiltersSchema,
  shareLinkIdSchema,
  shareLinkLabelSchema,
  shareReportTypeSchema,
} from "@/lib/shareLinkFilters";

// The UI never sends a bad value, so a refusal here is a tampered call: it
// throws, and the dashboard editor or share dialog shows its generic error.
const idSchema = shareLinkIdSchema;

const CreateGroupSchema = z.object({
  eventId: idSchema,
  label: shareLinkLabelSchema,
  expiresAt: shareLinkExpirySchema,
});

const GroupPatchSchema = z.object({
  label: shareLinkLabelSchema.optional(),
  expiresAt: shareLinkExpirySchema.optional(),
});

const AddItemSchema = z.object({
  reportType: shareReportTypeSchema,
  filters: z.unknown(),
  filtersLocked: z.boolean(),
  label: shareLinkLabelSchema,
});

const ItemPatchSchema = z.object({
  label: shareLinkLabelSchema.optional(),
  filtersLocked: z.boolean().optional(),
  filters: z.unknown().optional(),
});

export type CreateShareLinkGroupInput = {
  eventId: string;
  label?: string | null;
  expiresAt?: string | null;
};

export async function createShareLinkGroup(input: CreateShareLinkGroupInput) {
  const session = await requirePermission("SHARE_LINKS", "WRITE", input.eventId);
  const parsed = CreateGroupSchema.parse(input);
  const token = generateShareToken();
  const group = await prisma.shareLinkGroup.create({
    data: {
      token,
      eventId: parsed.eventId,
      label: parsed.label,
      createdById: session.user.id,
      expiresAt: parsed.expiresAt,
    },
  });
  revalidatePath(`/events/${parsed.eventId}/share-links`);
  return group;
}

export async function updateShareLinkGroup(
  id: string,
  patch: { label?: string | null; expiresAt?: string | null },
) {
  const existing = await prisma.shareLinkGroup.findUniqueOrThrow({
    where: { id: idSchema.parse(id) },
    select: { eventId: true },
  });
  await requirePermission("SHARE_LINKS", "WRITE", existing.eventId);
  const parsed = GroupPatchSchema.parse(patch);
  await prisma.shareLinkGroup.update({
    where: { id, eventId: existing.eventId },
    data: {
      ...(parsed.label !== undefined ? { label: parsed.label } : {}),
      ...(parsed.expiresAt !== undefined ? { expiresAt: parsed.expiresAt } : {}),
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
    where: { id: idSchema.parse(groupId) },
    select: { eventId: true },
  });
  await requirePermission("SHARE_LINKS", "WRITE", group.eventId);
  const parsed = AddItemSchema.parse(input);
  const filters = shareLinkFiltersSchema(parsed.reportType).parse(parsed.filters ?? {});
  const last = await prisma.shareLinkGroupItem.findFirst({
    where: { groupId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const nextSort = (last?.sortOrder ?? -10) + 10;
  const item = await prisma.shareLinkGroupItem.create({
    data: {
      groupId,
      reportType: parsed.reportType,
      filters,
      filtersLocked: parsed.filtersLocked,
      label: parsed.label,
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
    where: { id: idSchema.parse(itemId) },
    select: { groupId: true, reportType: true, group: { select: { eventId: true } } },
  });
  await requirePermission("SHARE_LINKS", "WRITE", item.group.eventId);
  const parsed = ItemPatchSchema.parse(patch);
  // Filters are checked against the report the item already shows.
  const filters =
    parsed.filters === undefined
      ? undefined
      : shareLinkFiltersSchema(shareReportTypeSchema.parse(item.reportType)).parse(parsed.filters ?? {});
  await prisma.shareLinkGroupItem.update({
    where: { id: itemId, group: { eventId: item.group.eventId } },
    data: {
      ...(parsed.label !== undefined ? { label: parsed.label } : {}),
      ...(parsed.filtersLocked !== undefined
        ? { filtersLocked: parsed.filtersLocked }
        : {}),
      ...(filters !== undefined ? { filters } : {}),
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
    where: { id: idSchema.parse(groupId) },
    select: { eventId: true },
  });
  await requirePermission("SHARE_LINKS", "WRITE", group.eventId);
  const ids = z.array(idSchema).max(500).parse(orderedIds);
  await prisma.$transaction(
    ids.map((id, idx) =>
      prisma.shareLinkGroupItem.update({
        where: { id, groupId },
        data: { sortOrder: (idx + 1) * 10 },
      }),
    ),
  );
  revalidatePath(`/events/${group.eventId}/share-links/dashboards/${groupId}`);
}
