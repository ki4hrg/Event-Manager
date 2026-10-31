"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { generateShareToken } from "@/lib/shareLinks";
import type { ShareLinkFilters } from "@/lib/shareLinks";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  shareLinkExpirySchema,
  shareLinkFiltersSchema,
  shareLinkLabelSchema,
  shareReportTypeSchema,
} from "@/lib/shareLinkFilters";

export type CreateShareLinkInput = {
  eventId: string;
  reportType: string;
  filters: ShareLinkFilters;
  filtersLocked: boolean;
  label?: string;
  expiresAt?: string | null;
};

const idSchema = z.string().min(1).max(100);

const CreateShareLinkSchema = z.object({
  eventId: idSchema,
  reportType: shareReportTypeSchema,
  filters: z.unknown(),
  filtersLocked: z.boolean(),
  label: shareLinkLabelSchema,
  expiresAt: shareLinkExpirySchema,
});

// The UI never sends a bad value, so a refusal here is a tampered call: it
// throws, and the share dialog shows its generic error.
export async function createShareLink(input: CreateShareLinkInput) {
  const parsed = CreateShareLinkSchema.parse(input);
  const session = await requirePermission("SHARE_LINKS", "WRITE", parsed.eventId);
  const filters = shareLinkFiltersSchema(parsed.reportType).parse(parsed.filters ?? {});
  const token = generateShareToken();
  const link = await prisma.shareLink.create({
    data: {
      token,
      eventId: parsed.eventId,
      reportType: parsed.reportType,
      filters,
      filtersLocked: parsed.filtersLocked,
      label: parsed.label,
      createdById: session.user.id,
      expiresAt: parsed.expiresAt,
    },
  });
  revalidatePath(`/events/${parsed.eventId}/share-links`);
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
