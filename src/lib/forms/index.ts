// Form-type dispatch. Each FormType's module owns its projection, parsing,
// diff and apply; this file routes to it so the public surface and the
// review queue stay form-agnostic. Server-only.

import type { FormType } from "@prisma/client";
import {
  functionReviewBaseline,
  functionReviewSections,
  functionReviewVersions,
  parseFunctionReviewPayload,
} from "./functionReview";
import { FUNCTION_REVIEW_SECTION_KEYS, readFormLinkConfig, type FormLinkConfig, type FunctionReviewBaseline, type FunctionReviewPayload, type FunctionReviewSection } from "./meta";
import type { ActiveFormLink } from "./links";

type LinkTarget = Pick<ActiveFormLink, "formType" | "functionId" | "eventId" | "config"> & {
  event: { timezone: string | null };
};

export function formSectionKeys(formType: FormType): Set<string> {
  switch (formType) {
    case "FUNCTION_REVIEW":
      return FUNCTION_REVIEW_SECTION_KEYS;
    default: {
      const _exhaustive: never = formType;
      throw new Error(`Unhandled form type: ${_exhaustive}`);
    }
  }
}

export function formConfig(link: Pick<ActiveFormLink, "formType" | "config">): FormLinkConfig {
  return readFormLinkConfig(link.config, formSectionKeys(link.formType));
}

export type FormSnapshot = {
  baseline: FunctionReviewBaseline;
  sections: string[];
  // Changes whenever a field the form can write changes. The public form
  // posts back the version it rendered; a mismatch means the submitter was
  // looking at stale values.
  version: string;
};

// The target as the public may see it, or null when it's gone.
export async function loadFormSnapshot(link: LinkTarget): Promise<FormSnapshot | null> {
  switch (link.formType) {
    case "FUNCTION_REVIEW": {
      if (!link.functionId) return null;
      const timezone = link.event.timezone || "America/Chicago";
      const [baseline, versions] = await Promise.all([
        functionReviewBaseline(link.functionId, link.eventId, timezone),
        functionReviewVersions(link.functionId, link.eventId),
      ]);
      if (!baseline || !versions) return null;
      return {
        baseline,
        sections: functionReviewSections(formConfig(link).sections, baseline),
        version: `${versions.function}|${versions.catering ?? ""}`,
      };
    }
    default: {
      const _exhaustive: never = link.formType;
      throw new Error(`Unhandled form type: ${_exhaustive}`);
    }
  }
}

export async function parseFormPayload(
  link: LinkTarget,
  formData: FormData,
  snapshot: FormSnapshot,
): Promise<FunctionReviewPayload> {
  switch (link.formType) {
    case "FUNCTION_REVIEW":
      return parseFunctionReviewPayload(formData, snapshot.sections as FunctionReviewSection[], link.eventId);
    default: {
      const _exhaustive: never = link.formType;
      throw new Error(`Unhandled form type: ${_exhaustive}`);
    }
  }
}

// A saved draft whose target changed since: fields the submitter left as they
// saw them follow the record; fields they edited keep their answer.
export function rebaseDraftPayload(
  payload: FunctionReviewPayload,
  oldBaseline: FunctionReviewBaseline | null,
  newBaseline: FunctionReviewBaseline,
): FunctionReviewPayload {
  if (!oldBaseline) return payload;
  const pairs: [keyof FunctionReviewPayload, (b: FunctionReviewBaseline) => unknown][] = [
    ["description", (b) => b.description],
    ["expectedAttendance", (b) => b.expectedAttendance],
    ["defaultSetup", (b) => b.defaultSetup],
    ["cateringExpectedCount", (b) => b.catering?.expectedCount ?? null],
    ["dietaryNotes", (b) => b.catering?.dietaryNotes ?? null],
    ["signageNotes", (b) => b.signageNotes],
    ["decorNotes", (b) => b.decorNotes],
  ];
  const next: FunctionReviewPayload = { ...payload };
  for (const [field, read] of pairs) {
    if (next[field] !== undefined && next[field] === read(oldBaseline)) {
      (next as Record<string, unknown>)[field] = read(newBaseline);
    }
  }
  return next;
}
