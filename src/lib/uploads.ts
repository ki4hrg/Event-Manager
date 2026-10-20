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
} as const;

export type EntityType = keyof typeof ENTITY_DIRS;

export const VALID_ENTITY_TYPES = Object.keys(ENTITY_DIRS) as EntityType[];

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
};

export function getEntityTypeFromRecord(record: Pick<FileUpload, "eventId" | "cateringOrderId" | "avOrderId" | "printOrderId" | "setupOrderId" | "supplyOrderId" | "mediaDeliverableId" | "venueId" | "hotelProposalId" | "rfpId">): EntityType {
  if (record.eventId) return "event";
  if (record.cateringOrderId) return "cateringOrder";
  if (record.avOrderId) return "avOrder";
  if (record.printOrderId) return "printOrder";
  if (record.setupOrderId) return "setupOrder";
  if (record.supplyOrderId) return "supplyOrder";
  if (record.mediaDeliverableId) return "mediaDeliverable";
  if (record.hotelProposalId) return "hotelProposal";
  if (record.rfpId) return "rfp";
  return "venue";
}

export function getEntityIdFromRecord(record: Pick<FileUpload, "eventId" | "cateringOrderId" | "avOrderId" | "printOrderId" | "setupOrderId" | "supplyOrderId" | "mediaDeliverableId" | "venueId" | "hotelProposalId" | "rfpId">): string {
  return (record.eventId ?? record.cateringOrderId ?? record.avOrderId ?? record.printOrderId ?? record.setupOrderId ?? record.supplyOrderId ?? record.mediaDeliverableId ?? record.hotelProposalId ?? record.rfpId ?? record.venueId)!;
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
  record: Pick<FileUpload, "eventId" | "cateringOrderId" | "avOrderId" | "printOrderId" | "setupOrderId" | "supplyOrderId" | "mediaDeliverableId" | "venueId" | "hotelProposalId" | "rfpId">,
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
    case "venue":
      return null;
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
