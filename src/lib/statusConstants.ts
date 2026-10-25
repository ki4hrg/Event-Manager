import type { AcquisitionState, EntityStatus, PackingStatus, StatusModelType } from "@prisma/client";

export type StatusCounts = {
  PENDING: number;
  IN_PROGRESS: number;
  COMPLETE: number;
  CANCELLED: number;
  noStatus: number;
};

export const STATUS_LABEL: Record<EntityStatus, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  COMPLETE: "Complete",
  CANCELLED: "Cancelled",
};

export const STATUS_CLASS: Record<EntityStatus, string> = {
  PENDING: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  IN_PROGRESS: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  COMPLETE: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  CANCELLED: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
};

export const EDIT_STATUS_OPTIONS: { value: EntityStatus; label: string }[] = [
  { value: "PENDING", label: "Pending" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "COMPLETE", label: "Complete" },
];

export const STATUS_MODEL_LABEL: Record<StatusModelType, string> = {
  FUNCTION: "Function",
  PRESENTATION: "Presentation",
  AV_ORDER: "AV Order",
  CATERING_ORDER: "Catering Order",
  SETUP_ORDER: "Setup Order",
  PRINT_ORDER: "Print Order",
  MEDIA_DELIVERABLE: "Media Deliverable",
  SUPPLY_ORDER: "Supply Order",
  FORM_SUBMISSION: "Form Submission",
};

export const PACKING_STATUS_LABEL: Record<PackingStatus, string> = {
  NEEDED: "Needed",
  IN_TRANSIT: "In Transit",
  DELIVERED: "Delivered",
};

export const PACKING_STATUS_CLASS: Record<PackingStatus, string> = {
  NEEDED: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  IN_TRANSIT: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  DELIVERED: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
};

// "In Transit · Shipped": the status with its sub-state, when it has one.
export function packingStatusText(status: PackingStatus, substatus: string | null | undefined): string {
  return substatus ? `${PACKING_STATUS_LABEL[status]} · ${substatus}` : PACKING_STATUS_LABEL[status];
}

export const PACKING_STATUS_OPTIONS: { value: PackingStatus; label: string }[] = [
  { value: "NEEDED", label: "Needed" },
  { value: "IN_TRANSIT", label: "In Transit" },
  { value: "DELIVERED", label: "Delivered" },
];

export const ACQUISITION_LABEL: Record<AcquisitionState, string> = {
  ON_HAND: "On Hand",
  TO_PROCURE: "To Procure",
  DROP_SHIP: "Drop Ship",
};

export const ACQUISITION_OPTIONS: { value: AcquisitionState; label: string }[] = [
  { value: "ON_HAND", label: "On Hand" },
  { value: "TO_PROCURE", label: "To Procure" },
  { value: "DROP_SHIP", label: "Drop Ship" },
];
