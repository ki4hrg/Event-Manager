// Client-safe vocabulary for public forms: labels, sections, payload and
// baseline shapes. No prisma and no "use server", so the public form, the
// link dialog and the review page can all import it.

import type { FormSubmissionState, FormType } from "@prisma/client";

export const FORM_TYPE_LABEL: Record<FormType, string> = {
  FUNCTION_REVIEW: "Function Review",
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
// type's section keys; `intro` renders as plain text.
export type FormLinkConfig = { sections: string[]; intro?: string | null };

export function readFormLinkConfig(raw: unknown, validKeys: Set<string>): FormLinkConfig {
  const obj = (raw && typeof raw === "object" ? raw : {}) as { sections?: unknown; intro?: unknown };
  const sections = Array.isArray(obj.sections)
    ? obj.sections.filter((s): s is string => typeof s === "string" && validKeys.has(s))
    : [];
  return { sections, intro: typeof obj.intro === "string" ? obj.intro : null };
}

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
