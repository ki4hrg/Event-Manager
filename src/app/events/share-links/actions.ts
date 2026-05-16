"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { generateShareToken } from "@/lib/shareLinks";
import type { ShareLinkFilters } from "@/lib/shareLinks";
import { revalidatePath } from "next/cache";

export type CreateShareLinkInput = {
  eventId: string;
  reportType: string;
  filters: ShareLinkFilters;
  filtersLocked: boolean;
  label?: string;
  expiresAt?: string | null;
};

export async function createShareLink(input: CreateShareLinkInput) {
  const session = await requirePermission("SHARE_LINKS", "WRITE", input.eventId);
  const token = generateShareToken();
  const link = await prisma.shareLink.create({
    data: {
      token,
      eventId: input.eventId,
      reportType: input.reportType,
      filters: input.filters,
      filtersLocked: input.filtersLocked,
      label: input.label || null,
      createdById: session.user.id,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
  });
  revalidatePath(`/events/${input.eventId}/share-links`);
  return link;
}

export async function revokeShareLink(id: string) {
  const link = await prisma.shareLink.findUniqueOrThrow({
    where: { id },
    select: { eventId: true },
  });
  await requirePermission("SHARE_LINKS", "WRITE", link.eventId);
  await prisma.shareLink.update({
    where: { id, eventId: link.eventId },
    data: { revokedAt: new Date() },
  });
  revalidatePath(`/events/${link.eventId}/share-links`);
}

export async function listShareLinksForEvent(eventId: string) {
  await requirePermission("SHARE_LINKS", "VIEW", eventId);
  return prisma.shareLink.findMany({
    where: { eventId },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true, email: true } } },
  });
}

export async function listShareLinksForReport(eventId: string, reportType: string) {
  await requirePermission("SHARE_LINKS", "VIEW", eventId);
  return prisma.shareLink.findMany({
    where: { eventId, reportType },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true, email: true } } },
  });
}
