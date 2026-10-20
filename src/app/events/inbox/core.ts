import path from "path";
import { randomUUID } from "crypto";
import { mkdirSync, rmSync, writeFileSync, copyFileSync } from "fs";
import { Prisma, type InboundStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireEventTenantId, requirePermissionForUser } from "@/lib/permissions";
import { getUploadDir, getUploadPath, MAX_UPLOAD_BYTES } from "@/lib/uploads";
import { EMAIL_SOURCE_FILE_TYPE } from "./views";
import { buildDedupKey, formatSender, parseInboxAddress, readMessage, slugifyInboxSlug } from "@/lib/inboundMail";

// Event inboxes (docs/proposals/email-ingest.md). No "use server": the ingest
// is called by the signed /api/inbound-email route, and the person-facing
// cores take a userId the caller has already authenticated.

export const PURGE_AFTER_DAYS = 90;
const PURGE_BATCH = 50;

// ─── Sender matching ─────────────────────────────────────────────────────────

export type SenderMatch = "MEMBER" | "CONTACT";

// MEMBER: an account in this tenant. CONTACT: a contact of this tenant tied to
// the event — at one of its venues, a hotel it has a proposal from or sent an
// RFP to, one of its vendors, or its key staff. Anything else is unknown, and
// so is every sender of mail that named no event.
export async function matchSender(
  address: string | null,
  tenantId: string,
  eventId: string | null,
): Promise<SenderMatch | null> {
  if (!address) return null;
  const email = { equals: address, mode: "insensitive" as const };
  const member = await prisma.user.findFirst({
    where: { email, memberships: { some: { tenantId } } },
    select: { id: true },
  });
  if (member) return "MEMBER";
  if (!eventId) return null;
  const contact = await prisma.contact.findFirst({
    where: {
      tenantId,
      email,
      OR: [
        {
          venues: {
            some: {
              venue: {
                OR: [
                  { events: { some: { eventId } } },
                  { hotelProposals: { some: { eventId } } },
                  { rfpRecipients: { some: { rfp: { eventId } } } },
                ],
              },
            },
          },
        },
        { vendorContacts: { some: { vendor: { eventVendors: { some: { eventId } } } } } },
        { eventKeyStaff: { some: { eventId } } },
      ],
    },
    select: { id: true },
  });
  return contact ? "CONTACT" : null;
}

export function arrivalStatus(eventId: string | null, match: SenderMatch | null): InboundStatus {
  return eventId && match ? "RECEIVED" : "HELD";
}

// ─── Ingest ──────────────────────────────────────────────────────────────────

export type IngestResult =
  | { outcome: "rejected" } // no such tenant: the Worker bounces the mail
  | { outcome: "duplicate"; id: string }
  | { outcome: "stored"; id: string; status: InboundStatus; routed: boolean };

function storedNameFor(fileName: string): string {
  const ext = path.extname(fileName).replace(/[^a-zA-Z0-9.]/g, "").slice(0, 10);
  return `${randomUUID()}${ext}`;
}

function sourceFileName(subject: string | null): string {
  const base = (subject ?? "message").replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "message";
  return `${base}.eml`;
}

export async function ingestInboundEmail(
  raw: Buffer,
  envelope: { to: string; from: string | null },
  domain: string,
): Promise<IngestResult> {
  const address = parseInboxAddress(envelope.to, domain);
  if (!address) return { outcome: "rejected" };
  const tenant = await prisma.tenant.findUnique({ where: { slug: address.tenantSlug }, select: { id: true } });
  if (!tenant) return { outcome: "rejected" };
  const event = await prisma.event.findFirst({
    where: { tenantId: tenant.id, inboxSlug: address.eventSlug },
    select: { id: true },
  });
  const eventId = event?.id ?? null;

  const msg = await readMessage(raw);
  const dedupKey = buildDedupKey(msg.parsed, envelope.to, msg.receivedAt);
  const existing = await prisma.inboundEmail.findUnique({ where: { dedupKey }, select: { id: true } });
  if (existing) return { outcome: "duplicate", id: existing.id };

  const senderMatch = await matchSender(msg.senderAddress, tenant.id, eventId);
  const status = arrivalStatus(eventId, senderMatch);

  let row: { id: string };
  try {
    row = await prisma.inboundEmail.create({
      data: {
        tenantId: tenant.id,
        eventId,
        dedupKey,
        envelopeTo: envelope.to.trim().toLowerCase(),
        envelopeFrom: envelope.from?.trim().toLowerCase() || null,
        sender: msg.sender,
        senderAddress: msg.senderAddress,
        forwardedFrom: formatSender(msg.forwardedFrom),
        subject: msg.subject,
        receivedAt: msg.receivedAt,
        textBody: msg.textBody,
        authResults: msg.authResults,
        senderMatch,
        status,
      },
      select: { id: true },
    });
  } catch (err) {
    // A retry racing the first delivery.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const again = await prisma.inboundEmail.findUnique({ where: { dedupKey }, select: { id: true } });
      if (again) return { outcome: "duplicate", id: again.id };
    }
    throw err;
  }

  // Files after the row (their directory is keyed by its id). On failure the
  // row goes too, so the Worker's retry starts clean rather than deduping
  // against a message with no files.
  const dir = getUploadDir("inboundEmail", row.id);
  try {
    mkdirSync(dir, { recursive: true });
    const files: Prisma.FileUploadCreateManyInput[] = [];
    const sourceName = storedNameFor("message.eml");
    writeFileSync(path.join(dir, sourceName), raw);
    files.push({
      fileName: sourceFileName(msg.subject),
      storedName: sourceName,
      mimeType: "message/rfc822",
      fileSize: raw.length,
      fileType: EMAIL_SOURCE_FILE_TYPE,
      inboundEmailId: row.id,
    });
    for (const a of msg.attachments) {
      if (a.content.length > MAX_UPLOAD_BYTES) continue; // still in the .eml
      const storedName = storedNameFor(a.fileName);
      writeFileSync(path.join(dir, storedName), a.content);
      files.push({
        fileName: a.fileName,
        storedName,
        mimeType: a.mimeType,
        fileSize: a.content.length,
        inboundEmailId: row.id,
      });
    }
    await prisma.fileUpload.createMany({ data: files });
  } catch (err) {
    await prisma.inboundEmail.delete({ where: { id: row.id } }).catch(() => {});
    rmSync(dir, { recursive: true, force: true });
    throw err;
  }

  return { outcome: "stored", id: row.id, status, routed: eventId !== null };
}

// ─── Purge ───────────────────────────────────────────────────────────────────

// Dismissed items older than PURGE_AFTER_DAYS: files on disk, then the row
// (its FileUploads cascade). Filed copies live under the event, untouched.
// The app has no scheduler, so this runs opportunistically on ingest and on
// inbox page loads; the batch cap keeps one call cheap.
export async function purgeDismissedInboundEmails(tenantId?: string): Promise<number> {
  const cutoff = new Date(Date.now() - PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const stale = await prisma.inboundEmail.findMany({
    where: { status: "DISMISSED", handledAt: { lt: cutoff }, ...(tenantId ? { tenantId } : {}) },
    select: { id: true },
    take: PURGE_BATCH,
  });
  for (const { id } of stale) {
    rmSync(getUploadDir("inboundEmail", id), { recursive: true, force: true });
    await prisma.inboundEmail.delete({ where: { id } });
  }
  return stale.length;
}

// ─── Person-facing cores ─────────────────────────────────────────────────────

async function inboxItem(id: string, tenantId: string, eventId: string | null) {
  const item = await prisma.inboundEmail.findFirst({ where: { id, tenantId, eventId } });
  if (!item) throw new Error("Inbox item not found");
  return item;
}

// HELD → RECEIVED. Only routed mail: Unrouted mail is routed first.
export async function releaseInboundEmailCore(id: string, eventId: string, userId: string) {
  await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId);
  const tenantId = await requireEventTenantId(eventId);
  const item = await inboxItem(id, tenantId, eventId);
  if (item.status !== "HELD") return;
  await prisma.inboundEmail.update({
    where: { id, tenantId },
    data: { status: "RECEIVED", handledById: userId, handledAt: new Date() },
  });
}

// eventId null: an Unrouted item, checked against the tenant.
export async function dismissInboundEmailCore(id: string, eventId: string | null, tenantId: string, userId: string) {
  await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId ?? { tenantId });
  const item = await inboxItem(id, tenantId, eventId);
  if (item.status === "APPLIED" || item.status === "DISMISSED") return;
  await prisma.inboundEmail.update({
    where: { id, tenantId },
    data: { status: "DISMISSED", handledById: userId, handledAt: new Date() },
  });
}

// Back from Dismissed (until it's purged). Lands in Held: a person looks again.
export async function restoreInboundEmailCore(id: string, eventId: string | null, tenantId: string, userId: string) {
  await requirePermissionForUser(userId, "HOTELS", "WRITE", eventId ?? { tenantId });
  const item = await inboxItem(id, tenantId, eventId);
  if (item.status !== "DISMISSED") return;
  await prisma.inboundEmail.update({
    where: { id, tenantId },
    data: { status: "HELD", handledById: userId, handledAt: new Date() },
  });
}

// Moves an item to another event of the same tenant (or routes an Unrouted
// one). Needs WRITE on the destination; the sender is re-matched against it,
// and the item starts over as Received or Held.
export async function routeInboundEmailCore(
  id: string,
  fromEventId: string | null,
  toEventId: string,
  tenantId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "HOTELS", "WRITE", fromEventId ?? { tenantId });
  await requirePermissionForUser(userId, "HOTELS", "WRITE", toEventId);
  if ((await requireEventTenantId(toEventId)) !== tenantId) throw new Error("Event not found");
  const item = await inboxItem(id, tenantId, fromEventId);
  if (item.status === "APPLIED") throw new Error("An applied item can't be moved");
  const match = await matchSender(item.senderAddress, tenantId, toEventId);
  await prisma.inboundEmail.update({
    where: { id, tenantId },
    data: {
      eventId: toEventId,
      senderMatch: match,
      status: arrivalStatus(toEventId, match),
      kind: null,
      proposal: Prisma.DbNull,
      model: null,
      error: null,
      handledById: userId,
      handledAt: new Date(),
    },
  });
}

// Files one attachment on the event's Files page: a copy under the event with
// the same storedName, which is how the item tells it's been filed.
export async function fileInboundAttachmentCore(fileId: string, id: string, eventId: string, userId: string) {
  await requirePermissionForUser(userId, "FILES", "WRITE", eventId);
  await inboxItem(id, await requireEventTenantId(eventId), eventId);
  const file = await prisma.fileUpload.findFirst({ where: { id: fileId, inboundEmailId: id } });
  if (!file) throw new Error("Attachment not found");
  const already = await prisma.fileUpload.findFirst({ where: { eventId, storedName: file.storedName }, select: { id: true } });
  if (already) return;
  mkdirSync(getUploadDir("event", eventId), { recursive: true });
  copyFileSync(getUploadPath("inboundEmail", id, file.storedName), getUploadPath("event", eventId, file.storedName));
  await prisma.fileUpload.create({
    data: {
      fileName: file.fileName,
      storedName: file.storedName,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
      eventId,
    },
  });
}

// ─── Inbox slug ──────────────────────────────────────────────────────────────

export async function setEventInboxSlugCore(eventId: string, raw: string | null, userId: string) {
  await requirePermissionForUser(userId, "EVENTS", "WRITE", eventId);
  const tenantId = await requireEventTenantId(eventId);
  const slug = raw ? slugifyInboxSlug(raw) : null;
  if (raw && !slug) throw new Error("The inbox name needs at least one letter or number");
  if (slug) {
    const clash = await prisma.event.findFirst({
      where: { tenantId, inboxSlug: slug, id: { not: eventId } },
      select: { name: true },
    });
    if (clash) throw new Error(`"${slug}" is already the inbox of ${clash.name}`);
  }
  await prisma.event.update({ where: { id: eventId, tenantId }, data: { inboxSlug: slug, updatedById: userId } });
}

// "Annual Gala" starting 2027-03-04 → "annual-gala-2027", unless the name
// already ends in the year; a taken slug gets -2, -3, …
export async function suggestInboxSlug(eventId: string, tenantId: string): Promise<string> {
  const event = await prisma.event.findFirst({ where: { id: eventId, tenantId }, select: { name: true, startDate: true } });
  if (!event) throw new Error("Event not found");
  const year = String(event.startDate.getUTCFullYear());
  const name = slugifyInboxSlug(event.name) || "event";
  const base = name.endsWith(year) ? name : slugifyInboxSlug(`${name}-${year}`);
  const taken = new Set(
    (
      await prisma.event.findMany({
        where: { tenantId, inboxSlug: { startsWith: base }, id: { not: eventId } },
        select: { inboxSlug: true },
      })
    ).map((e) => e.inboxSlug),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}
