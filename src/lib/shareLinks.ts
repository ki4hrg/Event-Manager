import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export type ShareLinkFilters = {
  vendorIds?: string[];
  modelTypes?: string[];
  vendorId?: string;
  days?: string[];
  sections?: string[];
  types?: string[];
  rooms?: string[];
  usedOnly?: boolean;
  functionIds?: string[];
  breakoutGroupIds?: string[];
  includeNonPublic?: boolean;
};

export const SHARE_REPORT_LABELS: Record<string, string> = {
  EQUIPMENT_RESPONSIBILITY: "Equipment Responsibility",
  VENDOR_HANDOFF: "Vendor Handoff",
  EVENT_PROFILE: "Event Profile",
  EVENT_SCHEDULE: "Event Schedule",
  SCHEDULE_BY_DAY: "Schedule by Day",
  ROOM_SCHEDULE: "Room Schedule",
  FUNCTION_DETAIL: "Function Detail",
  BREAKOUT_GRID: "Breakout Grid",
  BREAKOUT_ASSIGNMENTS: "Breakout Assignments",
};

export function generateShareToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Resolve a boolean filter for a share-link surface. Locked links use the stored value;
 * unlocked links read the URL param ("true"/anything else) with the stored value as the
 * fallback when the param is absent.
 */
export function resolveSharedBoolean(
  locked: boolean,
  paramValue: string | undefined,
  storedValue: boolean | undefined
): boolean {
  if (locked) return storedValue === true;
  if (paramValue !== undefined) return paramValue === "true";
  return storedValue === true;
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

export async function getActiveShareLinkGroup(token: string) {
  const group = await prisma.shareLinkGroup.findUnique({
    where: { token },
    include: {
      event: { select: { id: true, name: true, timezone: true } },
      items: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!group) return null;
  if (group.revokedAt) return null;
  if (group.expiresAt && group.expiresAt < new Date()) return null;
  return group;
}

export function recordShareLinkGroupAccess(id: string): void {
  prisma.shareLinkGroup
    .update({
      where: { id },
      data: { lastAccessedAt: new Date(), accessCount: { increment: 1 } },
    })
    .catch(() => {});
}
