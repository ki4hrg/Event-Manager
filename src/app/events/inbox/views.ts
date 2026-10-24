import type { InboundOrigin, InboundStatus } from "@prisma/client";

// How an item arrived, for the item's "To" row: an email's envelope address,
// otherwise how a person handed it in.
export function arrivalLabel(origin: InboundOrigin, envelopeTo: string): string {
  switch (origin) {
    case "EMAIL":
      return envelopeTo;
    case "MCP":
      return "Claude (MCP)";
    case "UPLOAD":
      return "Uploaded";
    default: {
      const _exhaustive: never = origin;
      throw new Error(`Unhandled origin: ${_exhaustive}`);
    }
  }
}

// Inbox tabs, as the `?view=` param. Shared by the event and Unrouted pages.
export const INBOX_VIEWS = ["inbox", "held", "done"] as const;
export type InboxView = (typeof INBOX_VIEWS)[number];

export const INBOX_VIEW_STATUSES: Record<InboxView, InboundStatus[]> = {
  inbox: ["RECEIVED", "PARSED", "FAILED"],
  held: ["HELD"],
  done: ["APPLIED", "DISMISSED"],
};

// Not yet applied or dismissed.
export const OPEN_STATUSES: InboundStatus[] = ["HELD", "RECEIVED", "PARSED", "FAILED"];

export function parseInboxView(raw: string | undefined): InboxView {
  return INBOX_VIEWS.includes(raw as InboxView) ? (raw as InboxView) : "inbox";
}

export const STATUS_LABELS: Record<InboundStatus, string> = {
  HELD: "Held",
  RECEIVED: "Received",
  PARSED: "Ready to review",
  APPLIED: "Applied",
  DISMISSED: "Dismissed",
  FAILED: "Failed",
};

export const SENDER_MATCH_LABELS: Record<string, string> = {
  MEMBER: "Member",
  CONTACT: "Known contact",
  ORG_CONTACT: "Org contact",
};

export const KIND_LABELS: Record<string, string> = {
  PICKUP_GUESTS: "Pickup guest list",
  PICKUP_COUNTS: "Pickup counts",
  RFP_PROPOSAL: "Hotel proposal",
  RFP_DECLINE: "Hotel declined",
  VENDOR_QUOTE: "Vendor quote",
  BEO: "BEO",
  CONTRACT: "Contract",
  OTHER: "Other",
};

// Attachments a person can hand in (MCP, the drop zone): the kinds the reader
// handles, with the type assumed when none is given.
export const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".csv": "text/csv",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".txt": "text/plain",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
export const INBOX_UPLOAD_ACCEPT = Object.keys(MIME_BY_EXT).join(",");
export const isInboxUploadable = (fileName: string) => {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 && fileName.slice(dot).toLowerCase() in MIME_BY_EXT;
};

// The quote review's vendor value for a vendor not on file yet.
export const NEW_VENDOR = "__new_vendor__";
