import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export type ShareLinkFilters = {
  vendorIds?: string[];
  modelTypes?: string[];
  vendorId?: string;
};

export function generateShareToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export async function getActiveShareLink(token: string) {
  const link = await prisma.shareLink.findUnique({
    where: { token },
    include: { event: { select: { id: true, name: true, timezone: true } } },
  });
  if (!link) return null;
  if (link.revokedAt) return null;
  if (link.expiresAt && link.expiresAt < new Date()) return null;
  return link;
}

export function recordShareLinkAccess(id: string): void {
  prisma.shareLink
    .update({
      where: { id },
      data: { lastAccessedAt: new Date(), accessCount: { increment: 1 } },
    })
    .catch(() => {});
}
