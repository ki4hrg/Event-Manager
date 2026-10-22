import type { PermissionResource } from "@prisma/client";

// One entry per shareable report. `ShareLink.reportType` and
// `ShareLinkGroupItem.reportType` are plain strings holding one of these keys.
export const SHARE_REPORT_TYPES = [
  "EVENT_PROFILE",
  "EVENT_SCHEDULE",
  "ROOM_SCHEDULE",
  "FUNCTION_DETAIL",
  "BREAKOUT_GRID",
  "BREAKOUT_ASSIGNMENTS",
  "EQUIPMENT_RESPONSIBILITY",
  "PACKING_LIST",
  "VENDOR_HANDOFF",
  "ESG",
  "POST_EVENT",
  "HOTEL_INFO",
] as const;

export type ShareReportType = (typeof SHARE_REPORT_TYPES)[number];

export const REPORT_CATEGORIES = [
  "Overview & Schedule",
  "Breakouts",
  "Logistics",
  "Documentation",
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export type ReportDefinition = {
  label: string;
  /** Route segment under `/events/[id]/`, e.g. "reports/vendor-handoff". */
  path: string;
  category: ReportCategory;
  /** VIEW on this resource is required to open the report, beyond EVENTS VIEW. */
  resource?: PermissionResource;
  description: string;
};

export const REPORTS: Record<ShareReportType, ReportDefinition> = {
  EVENT_PROFILE: {
    label: "Event Profile",
    path: "reports/event-profile",
    category: "Overview & Schedule",
    description: "Dates, venues, key contacts and totals.",
  },
  EVENT_SCHEDULE: {
    label: "Event Schedule",
    path: "reports/event-schedule",
    category: "Overview & Schedule",
    description: "Every function by day.",
  },
  ROOM_SCHEDULE: {
    label: "Room Schedule",
    path: "reports/room-schedule",
    category: "Overview & Schedule",
    description: "Bookings by room.",
  },
  FUNCTION_DETAIL: {
    label: "Function Detail",
    path: "reports/function-detail",
    category: "Overview & Schedule",
    description: "Each function with its orders and contacts.",
  },
  BREAKOUT_GRID: {
    label: "Breakout Grid",
    path: "reports/breakout-grid",
    category: "Breakouts",
    description: "Sessions by room and time.",
  },
  BREAKOUT_ASSIGNMENTS: {
    label: "Breakout Assignments",
    path: "reports/breakout-assignments",
    category: "Breakouts",
    description: "Presentations by session.",
  },
  EQUIPMENT_RESPONSIBILITY: {
    label: "Equipment Responsibility",
    path: "reports/equipment-responsibility",
    category: "Logistics",
    description: "Who provides and operates each item.",
  },
  PACKING_LIST: {
    label: "Packing List",
    path: "reports/packing-list",
    category: "Logistics",
    description: "Supply and print items to pack.",
  },
  VENDOR_HANDOFF: {
    label: "Vendor Handoff",
    path: "reports/vendor-handoff",
    category: "Logistics",
    description: "Each vendor's orders in one place.",
  },
  ESG: {
    label: "Event Specifications Guide",
    path: "reports/esg",
    category: "Documentation",
    description: "Specifications for the venue.",
  },
  POST_EVENT: {
    label: "Post-Event Report",
    path: "reports/post-event",
    category: "Documentation",
    description: "Actuals after the event.",
  },
  HOTEL_INFO: {
    label: "Hotel Information",
    path: "reports/hotel-info",
    category: "Documentation",
    resource: "HOTELS",
    description: "Booking details for each hotel block.",
  },
};

export function isShareReportType(value: string): value is ShareReportType {
  return (SHARE_REPORT_TYPES as readonly string[]).includes(value);
}

export function reportLabel(reportType: string): string {
  return isShareReportType(reportType) ? REPORTS[reportType].label : reportType;
}
