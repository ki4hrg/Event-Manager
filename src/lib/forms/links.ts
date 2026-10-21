// Server-side helpers for the public form surface (src/app/f/). Plain module:
// nothing here is callable from the browser. The public actions resolve the
// token through getActiveFormLink before touching anything, and take tenant,
// event and target from the returned link — never from the request.

import { rmSync } from "fs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { generateShareToken } from "@/lib/shareLinks";
import { getUploadDir } from "@/lib/uploads";
import { SECURE_COOKIES } from "@/lib/auth";

export const DRAFT_COOKIE = "form_draft";

// Scoped to the one link's path, so a draft key never travels to another
// link (or anywhere else in the app).
export function draftCookieOptions(token: string) {
  return { httpOnly: true, sameSite: "lax" as const, secure: SECURE_COOKIES, path: `/f/${token}`, maxAge: 14 * 86_400 };
}

// Rows (drafts plus submissions) one link may create per rolling hour, and
// drafts it may hold open at once. Open links are the exposure: anyone with
// the URL gets a fresh draft per browser.
export const FORM_ROWS_PER_HOUR = 20;
export const FORM_OPEN_DRAFTS_PER_LINK = 50;

const DRAFT_PURGE_DAYS = 14;
const CLOSED_PURGE_DAYS = 90;
const PURGE_BATCH = 50;

export function generateDraftKey(): string {
  return generateShareToken();
}

export async function getActiveFormLink(token: string) {
  if (!token || token.length > 100) return null;
  const link = await prisma.formLink.findUnique({
    where: { token },
    include: { event: { select: { id: true, name: true, timezone: true, tenantId: true } } },
  });
  if (!link) return null;
  if (link.revokedAt) return null;
  if (link.expiresAt < new Date()) return null;
  return link;
}

export type ActiveFormLink = NonNullable<Awaited<ReturnType<typeof getActiveFormLink>>>;

export function formLinkIsFull(link: Pick<ActiveFormLink, "maxSubmissions" | "submittedCount">): boolean {
  return link.maxSubmissions != null && link.submittedCount >= link.maxSubmissions;
}

// At most one write a minute per link, so a reload loop can't turn page views
// into a write storm.
export function recordFormLinkAccess(id: string): void {
  prisma.formLink
    .updateMany({
      where: {
        id,
        OR: [{ lastAccessedAt: null }, { lastAccessedAt: { lt: new Date(Date.now() - 60_000) } }],
      },
      data: { lastAccessedAt: new Date(), accessCount: { increment: 1 } },
    })
    .catch(() => {});
}

// The draft this browser holds on this link, or null. The link id and DRAFT
// state are part of the lookup, so a key replayed against another link (or a
// draft already submitted) finds nothing.
export async function findDraft(linkId: string, draftKey: string | undefined | null) {
  if (!draftKey || draftKey.length > 100) return null;
  return prisma.formSubmission.findFirst({
    where: { draftKey, formLinkId: linkId, state: "DRAFT" },
    include: { files: { select: { id: true, fileName: true, fileSize: true }, orderBy: { createdAt: "asc" } } },
  });
}

// Throws "busy" when the link is over its hourly row budget or holds too many
// open drafts. Called before any row is created from the public side.
export async function assertLinkHasCapacity(linkId: string) {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const [recent, openDrafts] = await Promise.all([
    prisma.formSubmission.count({ where: { formLinkId: linkId, createdAt: { gt: since } } }),
    prisma.formSubmission.count({ where: { formLinkId: linkId, state: "DRAFT" } }),
  ]);
  if (recent >= FORM_ROWS_PER_HOUR || openDrafts >= FORM_OPEN_DRAFTS_PER_LINK) {
    throw new PublicFormError("busy");
  }
}

// A public-side failure carrying one of the FORM_ERROR_COPY codes. The public
// actions turn it into ?error=<code>; anything else is a bug and propagates.
export class PublicFormError extends Error {
  constructor(public code: "invalid" | "closed" | "busy" | "upload" | "stale") {
    super(code);
  }
}

// Counts one submission against the link's limit, atomically. Postgres
// compares the two columns in one statement, so concurrent submits can't both
// take the last slot. Runs inside the submit transaction.
export async function claimSubmissionSlot(tx: Prisma.TransactionClient, linkId: string): Promise<boolean> {
  const updated = await tx.$executeRaw`
    UPDATE "FormLink" SET "submittedCount" = "submittedCount" + 1
    WHERE "id" = ${linkId}
      AND "revokedAt" IS NULL
      AND "expiresAt" > NOW()
      AND ("maxSubmissions" IS NULL OR "submittedCount" < "maxSubmissions")`;
  return updated === 1;
}

// Old drafts, and rejected or withdrawn submissions, carry submitter details
// and files nobody will use: delete them (files on disk too). There is no
// scheduler, so this runs opportunistically on public submits and on the
// forms page; the batch cap keeps one call cheap.
export async function purgeStaleFormSubmissions(): Promise<number> {
  const now = Date.now();
  const stale = await prisma.formSubmission.findMany({
    where: {
      OR: [
        { state: "DRAFT", updatedAt: { lt: new Date(now - DRAFT_PURGE_DAYS * 86_400_000) } },
        { state: { in: ["REJECTED", "WITHDRAWN"] }, updatedAt: { lt: new Date(now - CLOSED_PURGE_DAYS * 86_400_000) } },
      ],
    },
    select: { id: true },
    take: PURGE_BATCH,
  });
  for (const { id } of stale) {
    rmSync(getUploadDir("formSubmission", id), { recursive: true, force: true });
    await prisma.formSubmission.delete({ where: { id } });
  }
  return stale.length;
}

// Removes a draft's files from disk when the draft itself is discarded.
export function removeSubmissionFiles(id: string) {
  rmSync(getUploadDir("formSubmission", id), { recursive: true, force: true });
}
