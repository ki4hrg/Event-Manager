import type { InboundStatus } from "@prisma/client";

// The raw .eml's FileUpload.fileType on an inbox item.
export const EMAIL_SOURCE_FILE_TYPE = "EMAIL_SOURCE";

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
  OTHER: "Other",
};
