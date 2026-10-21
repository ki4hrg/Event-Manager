import path from "path";
import type { FileUpload } from "@prisma/client";
import { prisma } from "./prisma";

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "/data/uploads";

const DEFAULT_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const parsedMax = process.env.MAX_UPLOAD_BYTES ? parseInt(process.env.MAX_UPLOAD_BYTES, 10) : NaN;
export const MAX_UPLOAD_BYTES = Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : DEFAULT_MAX_UPLOAD_BYTES;

export const ALLOWED_UPLOAD_MIME_TYPES = new Set<string>([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // Hotel contracts and proposals often arrive as forwarded email or text.
  "text/plain",
  "text/csv",
  "message/rfc822",
  "application/vnd.ms-outlook",
]);

const SAFE_ENTITY_ID = /^[a-zA-Z0-9_-]+$/;
export function isValidEntityId(value: string): boolean {
  return SAFE_ENTITY_ID.test(value);
}

const ENTITY_DIRS = {
  event: "events",
  cateringOrder: "catering-orders",
  avOrder: "av-orders",
  printOrder: "print-orders",
  setupOrder: "setup-orders",
  supplyOrder: "supply-orders",
  mediaDeliverable: "media-deliverables",
  venue: "venues",
  hotelProposal: "hotel-proposals",
  rfp: "rfps",
  vendorQuote: "vendor-quotes",
  inboundEmail: "inbound-emails",
  formSubmission: "form-submissions",
} as const;

export type EntityType = keyof typeof ENTITY_DIRS;

// What /api/upload accepts. Inbound-email files arrive only by mail, and
// form-submission files only through the public form's own upload route.
export const VALID_ENTITY_TYPES: EntityType[] = (Object.keys(ENTITY_DIRS) as EntityType[]).filter(
  (t) => t !== "inboundEmail" && t !== "formSubmission",
);

export const ENTITY_FK_FIELD: Record<EntityType, string> = {
  event: "eventId",
  cateringOrder: "cateringOrderId",
  avOrder: "avOrderId",
  printOrder: "printOrderId",
  setupOrder: "setupOrderId",
  supplyOrder: "supplyOrderId",
  mediaDeliverable: "mediaDeliverableId",
  venue: "venueId",
  hotelProposal: "hotelProposalId",
  rfp: "rfpId",
  vendorQuote: "vendorQuoteId",
  inboundEmail: "inboundEmailId",
  formSubmission: "formSubmissionId",
};

type FileOwner = Pick<FileUpload, "eventId" | "cateringOrderId" | "avOrderId" | "printOrderId" | "setupOrderId" | "supplyOrderId" | "mediaDeliverableId" | "venueId" | "hotelProposalId" | "rfpId" | "vendorQuoteId" | "inboundEmailId" | "formSubmissionId">;

export function getEntityTypeFromRecord(record: FileOwner): EntityType {
  if (record.eventId) return "event";
  if (record.cateringOrderId) return "cateringOrder";
  if (record.avOrderId) return "avOrder";
  if (record.printOrderId) return "printOrder";
  if (record.setupOrderId) return "setupOrder";
  if (record.supplyOrderId) return "supplyOrder";
  if (record.mediaDeliverableId) return "mediaDeliverable";
  if (record.hotelProposalId) return "hotelProposal";
  if (record.rfpId) return "rfp";
  if (record.vendorQuoteId) return "vendorQuote";
  if (record.venueId) return "venue";
  if (record.formSubmissionId) return "formSubmission";
  return "inboundEmail";
}

export function getEntityIdFromRecord(record: FileOwner): string {
  return (record.eventId ?? record.cateringOrderId ?? record.avOrderId ?? record.printOrderId ?? record.setupOrderId ?? record.supplyOrderId ?? record.mediaDeliverableId ?? record.hotelProposalId ?? record.rfpId ?? record.vendorQuoteId ?? record.venueId ?? record.formSubmissionId ?? record.inboundEmailId)!;
}

export function getUploadDir(entityType: EntityType, entityId: string): string {
  return path.join(UPLOAD_DIR, ENTITY_DIRS[entityType], entityId);
}

export function getUploadPath(entityType: EntityType, entityId: string, storedName: string): string {
  return path.join(getUploadDir(entityType, entityId), storedName);
}

// Resolve the eventId that owns this file, walking through the parent entity.
// Returns null for venue-attached files (which have no event scope).
export async function resolveFileEventId(
  record: FileOwner,
): Promise<string | null> {
  return resolveEntityEventId(getEntityTypeFromRecord(record), getEntityIdFromRecord(record));
}

export async function resolveEntityEventId(entityType: EntityType, entityId: string): Promise<string | null> {
  switch (entityType) {
    case "event":
      return entityId;
    case "cateringOrder": {
      const o = await prisma.cateringOrder.findUnique({ where: { id: entityId }, select: { eventId: true } });
      return o?.eventId ?? null;
    }
    case "avOrder": {
      const o = await prisma.aVOrder.findUnique({ where: { id: entityId }, select: { eventId: true } });
      return o?.eventId ?? null;
    }
    case "printOrder": {
      const o = await prisma.printOrder.findUnique({ where: { id: entityId }, select: { eventId: true } });
      return o?.eventId ?? null;
    }
    case "setupOrder": {
      const o = await prisma.setupOrder.findUnique({ where: { id: entityId }, select: { eventId: true } });
      return o?.eventId ?? null;
    }
    case "supplyOrder": {
      const o = await prisma.supplyOrder.findUnique({ where: { id: entityId }, select: { eventId: true } });
      return o?.eventId ?? null;
    }
    case "mediaDeliverable": {
      const o = await prisma.mediaDeliverable.findUnique({ where: { id: entityId }, select: { eventId: true } });
      return o?.eventId ?? null;
    }
    case "hotelProposal": {
      const o = await prisma.hotelProposal.findUnique({ where: { id: entityId }, select: { eventId: true } });
      return o?.eventId ?? null;
    }
    case "rfp": {
      const o = await prisma.rfp.findUnique({ where: { id: entityId }, select: { eventId: true } });
      return o?.eventId ?? null;
    }
    case "vendorQuote": {
      const o = await prisma.vendorQuote.findUnique({ where: { id: entityId }, select: { eventId: true } });
      return o?.eventId ?? null;
    }
    case "inboundEmail": {
      const o = await prisma.inboundEmail.findUnique({ where: { id: entityId }, select: { eventId: true } });
      return o?.eventId ?? null;
    }
    case "formSubmission": {
      const o = await prisma.formSubmission.findUnique({ where: { id: entityId }, select: { eventId: true } });
      return o?.eventId ?? null;
    }
    case "venue":
      return null;
  }
}

// The tenant of a file whose owner has no event: an Unrouted inbound email's.
// The permission check for such a file runs against the active tenant, so the
// caller must also match this. Null: not an inbound-email-only file.
export async function inboundFileTenantId(record: FileOwner): Promise<string | null> {
  if (getEntityTypeFromRecord(record) !== "inboundEmail" || !record.inboundEmailId) return null;
  const o = await prisma.inboundEmail.findUnique({ where: { id: record.inboundEmailId }, select: { tenantId: true } });
  return o?.tenantId ?? null;
}

// ─── Public form uploads ─────────────────────────────────────────────────────
// Anyone holding a form link can upload, so the limits are tighter than the
// staff route's and the type comes from the file's bytes, never the client.
export const PUBLIC_UPLOAD_MAX_BYTES = Math.min(20 * 1024 * 1024, MAX_UPLOAD_BYTES);
export const PUBLIC_UPLOAD_MAX_FILES = 10;
export const PUBLIC_UPLOAD_MAX_SUBMISSION_BYTES = 60 * 1024 * 1024;
export const PUBLIC_UPLOAD_MAX_LINK_BYTES_PER_HOUR = 200 * 1024 * 1024;

const OOXML: Record<string, string> = {
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  return bytes.every((b, i) => buf[offset + i] === b);
}

// The verified type and the extension to store it under, or null when the
// bytes aren't one of the accepted kinds. OOXML files are zip containers, so
// the zip signature plus an OOXML extension is as far as a check can go
// without unpacking.
export function sniffPublicUpload(buf: Buffer, fileName: string): { mimeType: string; ext: string } | null {
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { mimeType: "application/pdf", ext: ".pdf" };
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { mimeType: "image/jpeg", ext: ".jpg" };
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mimeType: "image/png", ext: ".png" };
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) {
    return { mimeType: "image/webp", ext: ".webp" };
  }
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) {
    const ext = path.extname(fileName).toLowerCase();
    if (OOXML[ext]) return { mimeType: OOXML[ext], ext };
  }
  return null;
}

// A display name safe to store: no path, no control characters, bounded.
export function cleanUploadFileName(name: string): string {
  const base = path.basename(name.replace(/\\/g, "/")).replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (base || "upload").slice(0, 200);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
