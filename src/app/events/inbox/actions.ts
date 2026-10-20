"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { InboundStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { getInboundEmailDomain } from "@/lib/email";
import { eventScopeWhere } from "@/app/events/core";
import {
  dismissInboundEmailCore,
  fileInboundAttachmentCore,
  purgeDismissedInboundEmails,
  releaseInboundEmailCore,
  restoreInboundEmailCore,
  routeInboundEmailCore,
  setEventInboxSlugCore,
  suggestInboxSlug,
} from "./core";
import { INBOX_VIEW_STATUSES, type InboxView } from "./views";

const listSelect = {
  id: true,
  sender: true,
  forwardedFrom: true,
  subject: true,
  receivedAt: true,
  status: true,
  senderMatch: true,
  envelopeTo: true,
  _count: { select: { files: { where: { fileType: null } } } },
} as const;

// ─── Event inbox ─────────────────────────────────────────────────────────────

export async function getEventInbox(eventId: string, view: InboxView) {
  const { tenantId } = await requirePermission("HOTELS", "VIEW", eventId);
  await purgeDismissedInboundEmails(tenantId).catch(() => {});
  const [items, counts] = await Promise.all([
    prisma.inboundEmail.findMany({
      where: { tenantId, eventId, status: { in: INBOX_VIEW_STATUSES[view] } },
      select: listSelect,
      orderBy: { receivedAt: "desc" },
    }),
    prisma.inboundEmail.groupBy({ by: ["status"], where: { tenantId, eventId }, _count: true }),
  ]);
  const count = (statuses: InboundStatus[]) =>
    counts.filter((c) => statuses.includes(c.status)).reduce((n, c) => n + c._count, 0);
  return {
    items,
    counts: { inbox: count(INBOX_VIEW_STATUSES.inbox), held: count(INBOX_VIEW_STATUSES.held) },
  };
}

// eventId null: an Unrouted item of the active tenant.
export async function getInboxItem(id: string, eventId: string | null) {
  const { tenantId } = await requirePermission("HOTELS", "VIEW", eventId);
  const item = await prisma.inboundEmail.findFirst({
    where: { id, tenantId, eventId },
    include: {
      files: { orderBy: { createdAt: "asc" } },
      handledBy: { select: { name: true, email: true } },
    },
  });
  if (!item) return null;
  // An attachment is filed when the event holds a copy with its storedName.
  const filed = eventId
    ? await prisma.fileUpload.findMany({
        where: { eventId, storedName: { in: item.files.map((f) => f.storedName) } },
        select: { storedName: true },
      })
    : [];
  return { ...item, filedStoredNames: filed.map((f) => f.storedName) };
}

export async function releaseInboundEmail(id: string, eventId: string) {
  const session = await requirePermission("HOTELS", "WRITE", eventId);
  await releaseInboundEmailCore(id, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/inbox`);
}

export async function dismissInboundEmail(id: string, eventId: string | null) {
  const session = await requirePermission("HOTELS", "WRITE", eventId);
  await dismissInboundEmailCore(id, eventId, session.tenantId, session.user.id);
  revalidatePath(eventId ? `/events/${eventId}/inbox` : "/inbox");
}

export async function restoreInboundEmail(id: string, eventId: string | null) {
  const session = await requirePermission("HOTELS", "WRITE", eventId);
  await restoreInboundEmailCore(id, eventId, session.tenantId, session.user.id);
  revalidatePath(eventId ? `/events/${eventId}/inbox` : "/inbox");
}

// Moves an item to another event, or routes an Unrouted one (fromEventId null).
export async function routeInboundEmail(id: string, fromEventId: string | null, toEventId: string) {
  const session = await requirePermission("HOTELS", "WRITE", fromEventId);
  await routeInboundEmailCore(id, fromEventId, toEventId, session.tenantId, session.user.id);
  revalidatePath(fromEventId ? `/events/${fromEventId}/inbox` : "/inbox");
  revalidatePath(`/events/${toEventId}/inbox`);
  redirect(`/events/${toEventId}/inbox/${id}?success=Moved`);
}

export async function fileInboundAttachment(fileId: string, id: string, eventId: string) {
  const session = await requirePermission("FILES", "WRITE", eventId);
  await fileInboundAttachmentCore(fileId, id, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/inbox/${id}`);
  revalidatePath(`/events/${eventId}/files`);
}

// Events an item can move to: ones the user can see in the active tenant.
// Each move still checks HOTELS WRITE on the destination.
export async function getInboxDestinationEvents(excludeEventId: string | null) {
  const session = await requirePermission("HOTELS", "WRITE", excludeEventId);
  return prisma.event.findMany({
    where: {
      AND: [await eventScopeWhere(session.user.id, session.tenantId), excludeEventId ? { id: { not: excludeEventId } } : {}],
    },
    select: { id: true, name: true, startDate: true },
    orderBy: { startDate: "desc" },
  });
}

// ─── Unrouted (org-level) ────────────────────────────────────────────────────

export async function getUnroutedInbox(view: InboxView) {
  const { tenantId } = await requirePermission("HOTELS", "VIEW");
  await purgeDismissedInboundEmails(tenantId).catch(() => {});
  return prisma.inboundEmail.findMany({
    where: { tenantId, eventId: null, status: { in: INBOX_VIEW_STATUSES[view] } },
    select: listSelect,
    orderBy: { receivedAt: "desc" },
  });
}

export async function countUnroutedInbox() {
  const { tenantId } = await requirePermission("HOTELS", "VIEW");
  return prisma.inboundEmail.count({ where: { tenantId, eventId: null, status: "HELD" } });
}

// ─── Inbox address ───────────────────────────────────────────────────────────

export async function getEventInboxAddress(eventId: string) {
  const { tenantId } = await requirePermission("EVENTS", "WRITE", eventId);
  const [event, tenant] = await Promise.all([
    prisma.event.findFirst({ where: { id: eventId, tenantId }, select: { inboxSlug: true } }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } }),
  ]);
  return {
    domain: getInboundEmailDomain(),
    tenantSlug: tenant?.slug ?? "",
    inboxSlug: event?.inboxSlug ?? null,
    suggestion: event?.inboxSlug ? null : await suggestInboxSlug(eventId, tenantId),
  };
}

export async function setEventInboxSlug(eventId: string, slug: string | null) {
  const session = await requirePermission("EVENTS", "WRITE", eventId);
  await setEventInboxSlugCore(eventId, slug, session.user.id);
  revalidatePath(`/events/${eventId}/settings`);
  revalidatePath(`/events/${eventId}/inbox`);
}
