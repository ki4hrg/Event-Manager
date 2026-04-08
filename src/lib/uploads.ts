import path from "path";
import type { FileUpload } from "@prisma/client";

export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? "/data/uploads";

const ENTITY_DIRS = {
  event: "events",
  cateringOrder: "catering-orders",
  avOrder: "av-orders",
  setupOrder: "setup-orders",
  venue: "venues",
} as const;

export type EntityType = keyof typeof ENTITY_DIRS;

export const VALID_ENTITY_TYPES = Object.keys(ENTITY_DIRS) as EntityType[];

export const ENTITY_FK_FIELD: Record<EntityType, string> = {
  event: "eventId",
  cateringOrder: "cateringOrderId",
  avOrder: "avOrderId",
  setupOrder: "setupOrderId",
  venue: "venueId",
};

export function getEntityTypeFromRecord(record: Pick<FileUpload, "eventId" | "cateringOrderId" | "avOrderId" | "setupOrderId" | "venueId">): EntityType {
  if (record.eventId) return "event";
  if (record.cateringOrderId) return "cateringOrder";
  if (record.avOrderId) return "avOrder";
  if (record.setupOrderId) return "setupOrder";
  return "venue";
}

export function getEntityIdFromRecord(record: Pick<FileUpload, "eventId" | "cateringOrderId" | "avOrderId" | "setupOrderId" | "venueId">): string {
  return (record.eventId ?? record.cateringOrderId ?? record.avOrderId ?? record.setupOrderId ?? record.venueId)!;
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
