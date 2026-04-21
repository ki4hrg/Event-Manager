import type { EntityStatus } from "@prisma/client";

export const STATUS_LABEL: Record<EntityStatus, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  COMPLETE: "Complete",
  CANCELLED: "Cancelled",
};

export const STATUS_CLASS: Record<EntityStatus, string> = {
  PENDING: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  IN_PROGRESS: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  COMPLETE: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  CANCELLED: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
};

export const EDIT_STATUS_OPTIONS: { value: EntityStatus; label: string }[] = [
  { value: "PENDING", label: "Pending" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "COMPLETE", label: "Complete" },
];
