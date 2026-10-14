// Completeness against the ESG's required (*) fields. Sections marked N/A are
// exempt (the template accepts "Not Applicable"). Derived requirements are met
// by data the app already holds.

import {
  ESG_HEADER_FIELDS,
  ESG_SECTIONS,
  type EsgDerivedSource,
  type EsgFieldDef,
  type SpecGrid,
} from "@/lib/esg/fields";
import { isBlankText } from "@/lib/esg/format";

export type EsgCompletenessInput = {
  spec: (Record<string, unknown> & { narrative: Record<string, unknown>; naSections: string[] }) | null;
  derived: Record<EsgDerivedSource, boolean>;
  gridCounts: Record<SpecGrid, number>;
};

export type EsgCompleteness = {
  done: number;
  total: number;
  missing: { section: string; label: string }[];
};

export function fieldValue(spec: EsgCompletenessInput["spec"], field: EsgFieldDef): unknown {
  if (!spec) return null;
  return field.storage === "narrative" ? spec.narrative[field.key] : spec[field.key];
}

function filled(value: unknown): boolean {
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return true;
  if (value instanceof Date) return true;
  return !isBlankText(value);
}

export function computeEsgCompleteness(input: EsgCompletenessInput): EsgCompleteness {
  const na = new Set(input.spec?.naSections ?? []);
  const missing: EsgCompleteness["missing"] = [];
  let total = 0;
  let done = 0;
  const check = (section: string, label: string, ok: boolean) => {
    total++;
    if (ok) done++;
    else missing.push({ section, label });
  };

  for (const f of ESG_HEADER_FIELDS) {
    if (f.required) check("", f.label, filled(fieldValue(input.spec, f)));
  }
  for (const section of ESG_SECTIONS) {
    if (na.has(section.letter)) continue;
    for (const d of section.derived ?? []) {
      if (!d.required) continue;
      // An event without hotel blocks may describe its housing in the narrative instead.
      const ok =
        d.source === "housingBlocks"
          ? input.derived.housingBlocks || !isBlankText(input.spec?.narrative.housingNotes)
          : input.derived[d.source];
      check(section.letter, d.label, ok);
    }
    for (const f of section.fields) {
      if (f.required) check(section.letter, f.label, filled(fieldValue(input.spec, f)));
    }
    for (const g of section.grids ?? []) {
      if (g.required) check(section.letter, g.label, input.gridCounts[g.grid] > 0);
    }
  }
  return { done, total, missing };
}
