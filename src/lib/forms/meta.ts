// Client-safe vocabulary for public forms: labels, sections, payload and
// baseline shapes. No prisma and no "use server", so the public form, the
// link dialog and the review page can all import it.

import type { FormSubmissionState, FormType } from "@prisma/client";

export const FORM_TYPE_LABEL: Record<FormType, string> = {
  FUNCTION_REVIEW: "Function Review",
  ITEM_REQUEST: "Item Request",
  EXHIBIT_REQUEST: "Exhibit Request",
  PRESENTATION_DELIVERABLES: "Presentation Deliverables",
  SPEAKER_PROFILE: "Speaker Profile",
};

export const FORM_STATE_LABEL: Record<FormSubmissionState, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  APPLIED: "Applied",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

// ─── Function Review ────────────────────────────────────────────────────────

export const FUNCTION_REVIEW_SECTIONS = [
  { key: "overview", label: "Overview" },
  { key: "schedule", label: "Schedule" },
  { key: "setup", label: "Room & Setup" },
  { key: "catering", label: "Catering" },
  { key: "av", label: "Audio Visual" },
  { key: "materials", label: "Printed Materials & Supplies" },
  { key: "signage", label: "Signage & Decor" },
  { key: "contact", label: "On-site Contact" },
] as const;

export type FunctionReviewSection = (typeof FUNCTION_REVIEW_SECTIONS)[number]["key"];

export const FUNCTION_REVIEW_SECTION_KEYS = new Set<string>(FUNCTION_REVIEW_SECTIONS.map((s) => s.key));

export function functionReviewSectionLabel(key: string): string {
  return FUNCTION_REVIEW_SECTIONS.find((s) => s.key === key)?.label ?? key;
}

export type SectionVerdict = "ok" | "changes";

export type SectionResponse = { verdict: SectionVerdict | null; note: string | null };

export type FunctionReviewPayload = {
  responses: Partial<Record<FunctionReviewSection, SectionResponse>>;
  description?: string | null;
  expectedAttendance?: number | null;
  defaultSetup?: string | null;
  cateringExpectedCount?: number | null;
  dietaryNotes?: string | null;
  signageNotes?: string | null;
  decorNotes?: string | null;
  contact?: { firstName: string; lastName: string | null; email: string | null; phone: string | null } | null;
};

// What the public may see of a function: an explicit allow-list. Billing,
// cost center, internal notes, vendors, pricing and every contact's details
// are left out by construction — see publicProjection in functionReview.ts.
export type FunctionReviewBaseline = {
  functionLabel: string;
  description: string | null;
  expectedAttendance: number | null;
  defaultSetup: string | null;
  decorNotes: string | null;
  signageNotes: string | null;
  rooms: string[];
  schedules: { type: string; time: string }[];
  catering: {
    mealType: string | null;
    serviceStyle: string | null;
    expectedCount: number | null;
    dietaryNotes: string | null;
  } | null;
  av: { order: string; items: { item: string; quantity: number | null }[] }[];
  setup: { order: string; setupType: string | null; tables: string[] }[];
  materials: { order: string; items: { description: string; quantity: number | null }[] }[];
};

// The form config a link stores. `sections` is always a subset of the form
// type's section keys; `intro` renders as plain text. `mediaUploadUrl` is a
// folder staff host (a Dropbox file request, say): when set, the form sends
// presenters there and takes no uploads itself.
export type FormLinkConfig = { sections: string[]; intro?: string | null; mediaUploadUrl?: string | null };

// An https URL as typed, normalized, or null when it isn't one.
export function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim() || value.length > 500) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function readFormLinkConfig(raw: unknown, validKeys: Set<string>): FormLinkConfig {
  const obj = (raw && typeof raw === "object" ? raw : {}) as { sections?: unknown; intro?: unknown; mediaUploadUrl?: unknown };
  const sections = Array.isArray(obj.sections)
    ? obj.sections.filter((s): s is string => typeof s === "string" && validKeys.has(s))
    : [];
  return { sections, intro: typeof obj.intro === "string" ? obj.intro : null, mediaUploadUrl: httpsUrl(obj.mediaUploadUrl) };
}

// The hidden field bots fill. Its name must never be a real form field's
// (a speaker form posts "website"), or FormData.get returns the trap.
export const HONEYPOT_FIELD = "contact_fax_hp";

// Public error codes → fixed copy. The public actions redirect with ?error=<code>
// rather than surfacing raw messages.
export const FORM_ERROR_COPY: Record<string, string> = {
  invalid: "Some answers couldn't be read. Check the highlighted fields and try again.",
  closed: "This form is no longer accepting responses.",
  busy: "Too many responses were sent from this link recently. Try again in an hour.",
  upload: "That file couldn't be uploaded. Use a PDF, image, or Word, Excel or PowerPoint file under 20 MB.",
  stale: "The details on this page were updated while you had it open. Check them again and resubmit.",
};

// ─── Review diff ─────────────────────────────────────────────────────────────

// One editable field: what the submitter saw, what they sent, and what the
// record holds now. "conflict" means staff changed the field after the form
// was opened and the submitter changed it too.
export type FormDiffRow = {
  field: string;
  label: string;
  baseline: string | null;
  proposed: string | null;
  current: string | null;
  status: "unchanged" | "changed" | "conflict";
};

export type FormDiffSection = {
  key: string;
  label: string;
  // "update" compares against a record on file; "create" proposes a new one,
  // so there is no before/now and no verdict.
  mode: "update" | "create";
  verdict: SectionVerdict | null;
  note: string | null;
  rows: FormDiffRow[];
  // Applying it would write something: a changed field, or a change request
  // to record on the record's notes.
  applicable: boolean;
};

// A link's state for staff lists. Plain helper so server pages can call it.
export function formLinkStatus(link: { revokedAt: Date | null; expiresAt: Date; maxSubmissions: number | null; submittedCount: number }) {
  if (link.revokedAt) return { label: "Revoked", cls: "text-red-600 dark:text-red-400" };
  if (new Date(link.expiresAt) < new Date()) return { label: "Closed", cls: "text-amber-600 dark:text-amber-400" };
  if (link.maxSubmissions != null && link.submittedCount >= link.maxSubmissions) {
    return { label: "Submitted", cls: "text-gray-600 dark:text-gray-400" };
  }
  return { label: "Open", cls: "text-green-600 dark:text-green-400" };
}

// ─── Item Request ────────────────────────────────────────────────────────────
// An open link: whoever has it asks for items to be procured, or tells the
// team items are on their way. Apply turns each line into a print or supply
// order item.

export const ITEM_REQUEST_SECTION_KEYS = new Set<string>(["items"]);
export const ITEM_REQUEST_MAX_LINES = 30;

export const ITEM_REQUEST_MODES = [
  { value: "request", label: "Request items" },
  { value: "incoming", label: "Notify incoming items" },
] as const;

export const ITEM_KINDS = [
  { value: "print", label: "Printed piece" },
  { value: "supply", label: "Supply" },
] as const;

export const ITEM_SOURCES = [
  { value: "procure", label: "Procure it for me" },
  { value: "shipping", label: "I'm shipping it" },
  { value: "bringing", label: "I'm bringing it" },
] as const;

export type ItemRequestMode = (typeof ITEM_REQUEST_MODES)[number]["value"];
export type ItemKind = (typeof ITEM_KINDS)[number]["value"];
export type ItemSource = (typeof ITEM_SOURCES)[number]["value"];

export type ItemRequestLine = {
  description: string;
  quantity: number | null;
  kind: ItemKind;
  neededBy: string | null; // YYYY-MM-DD
  destination: string | null; // "function:<id>" | "room:<id>", from the baseline list
  source: ItemSource;
  carrier: string | null;
  tracking: string | null;
  notes: string | null;
};

export type ItemRequestPayload = { mode: ItemRequestMode; items: ItemRequestLine[] };

// Names and ids only: no times, attendance or room details.
export type ItemRequestBaseline = { destinations: { value: string; label: string }[] };

export function optionLabel(list: readonly { value: string; label: string }[], value: string | null): string | null {
  if (value == null) return null;
  return list.find((o) => o.value === value)?.label ?? value;
}

// ─── Exhibit Request ─────────────────────────────────────────────────────────
// An open link (optionally scoped to one booth group) for exhibitors to ask
// for a booth. Apply creates the booth, its contact and its equipment.

export const EXHIBIT_REQUEST_SECTION_KEYS = new Set<string>(["booth"]);
export const EXHIBIT_MAX_EQUIPMENT = 20;

// ProvidedBy values an exhibitor may pick. GROUP ("we provide it") is the
// organizer's call, not the exhibitor's.
export const EXHIBIT_PROVIDERS = [
  { value: "NOT_REQUIRED", label: "Not needed" },
  { value: "VENUE", label: "From the venue" },
  { value: "OUTSIDE_VENDOR", label: "My own vendor" },
] as const;

export type ExhibitProvider = (typeof EXHIBIT_PROVIDERS)[number]["value"];

export type ExhibitRequestPayload = {
  company: string | null;
  boothType: string | null;
  location: string | null;
  contact: { firstName: string; lastName: string | null; email: string | null; phone: string | null } | null;
  shippingRequired: boolean;
  customsRequired: boolean;
  electricalProvider: ExhibitProvider | null;
  electricalNotes: string | null;
  avProvider: ExhibitProvider | null;
  avNotes: string | null;
  specialRequirements: string | null;
  equipment: { item: string; quantity: number | null }[];
};

export type ExhibitRequestBaseline = { groupName: string | null; boothTypes: string[] };

// ─── Presentation Deliverables ───────────────────────────────────────────────
// A presenter confirms the session's public details and sends what the team
// needs: AV needs, media (files under the upload cap, or a link), handouts.

export const DELIVERABLES_SECTIONS = [
  { key: "details", label: "Session details" },
  { key: "av", label: "Audio visual needs" },
  { key: "media", label: "Media" },
  { key: "handouts", label: "Handouts" },
] as const;

export type DeliverablesSection = (typeof DELIVERABLES_SECTIONS)[number]["key"];
export const DELIVERABLES_SECTION_KEYS = new Set<string>(DELIVERABLES_SECTIONS.map((s) => s.key));

export type DeliverablesPayload = {
  title?: string | null;
  description?: string | null;
  avNeeds?: string | null;
  // `uploaded`: the presenter says they used the link staff gave them.
  media?: { mediaType: string | null; link: string | null; notes: string | null; uploaded: boolean } | null;
  handouts?: { description: string; quantity: number | null } | null;
};

export type DeliverablesBaseline = {
  title: string;
  description: string | null;
  speakerName: string | null;
  mediaTypes: string[];
};

// ─── Speaker Profile ─────────────────────────────────────────────────────────
// A speaker sends their bio and photo (durable, on Contact) and this event's
// travel and needs (SpeakerProfile). The one form that updates an existing
// contact, and only the speaker columns of the contact the link names.

export const SPEAKER_PROFILE_SECTIONS = [
  { key: "bio", label: "Bio & photo" },
  { key: "travel", label: "Travel" },
  { key: "needs", label: "Needs" },
] as const;

export type SpeakerProfileSection = (typeof SPEAKER_PROFILE_SECTIONS)[number]["key"];
export const SPEAKER_PROFILE_SECTION_KEYS = new Set<string>(SPEAKER_PROFILE_SECTIONS.map((s) => s.key));

export type SpeakerProfilePayload = {
  bio?: string | null;
  jobTitle?: string | null;
  pronouns?: string | null;
  website?: string | null;
  // datetime-local strings in the event's time zone. Travel and needs start
  // blank on the form (a forwarded link must not reveal where a speaker is
  // staying); blank means "no change".
  arrivalAt?: string | null;
  departureAt?: string | null;
  hotel?: string | null;
  travelNotes?: string | null;
  dietary?: string | null;
  avNeeds?: string | null;
  shirtSize?: string | null;
};

// Bio fields only: the public form prefills these. Travel and needs are
// read for the review diff, never shown on the public page.
export type SpeakerProfileBaseline = {
  speakerName: string;
  presentationTitle: string;
  bio: string | null;
  jobTitle: string | null;
  pronouns: string | null;
  website: string | null;
  hasHeadshot: boolean;
};
