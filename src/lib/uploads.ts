import path from "path";
import type { FileUpload } from "@prisma/client";

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
  venue: "venues",
} as const;

export type EntityType = keyof typeof ENTITY_DIRS;

export const VALID_ENTITY_TYPES = Object.keys(ENTITY_DIRS) as EntityType[];

export const ENTITY_FK_FIELD: Record<EntityType, string> = {
  event: "eventId",
  cateringOrder: "cateringOrderId",
  avOrder: "avOrderId",
  printOrder: "printOrderId",
  setupOrder: "setupOrderId",
  venue: "venueId",
};

export function getEntityTypeFromRecord(record: Pick<FileUpload, "eventId" | "cateringOrderId" | "avOrderId" | "printOrderId" | "setupOrderId" | "venueId">): EntityType {
  if (record.eventId) return "event";
  if (record.cateringOrderId) return "cateringOrder";
  if (record.avOrderId) return "avOrder";
  if (record.printOrderId) return "printOrder";
  if (record.setupOrderId) return "setupOrder";
  return "venue";
}

export function getEntityIdFromRecord(record: Pick<FileUpload, "eventId" | "cateringOrderId" | "avOrderId" | "printOrderId" | "setupOrderId" | "venueId">): string {
  return (record.eventId ?? record.cateringOrderId ?? record.avOrderId ?? record.printOrderId ?? record.setupOrderId ?? record.venueId)!;
}

export function getUploadDir(entityType: EntityType, entityId: string): string {
  return path.join(UPLOAD_DIR, ENTITY_DIRS[entityType], entityId);
}

export function getUploadPath(entityType: EntityType, entityId: string, storedName: string): string {
  return path.join(getUploadDir(entityType, entityId), storedName);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
