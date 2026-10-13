// FormData → typed values for ESG fields and grid columns, following the
// project's FormData conventions (strings `|| null`, nullable ints, tri-state
// booleans from a select). Pure; the core validates and whitelists.

import { parseDateTimeInTimezone } from "@/lib/timezones";
import type { EsgFieldKind } from "@/lib/esg/fields";
import { isBlankText } from "@/lib/esg/format";

export function parseEsgValue(kind: EsgFieldKind, raw: FormDataEntryValue | null, timezone: string): unknown {
  const value = typeof raw === "string" ? raw : "";
  switch (kind) {
    case "richtext":
      return isBlankText(value) ? null : value;
    case "text":
    case "textarea":
    case "option":
    case "vendor":
    case "contact":
    case "function":
    case "providedBy":
      return value.trim() ? value : null;
    case "int":
      return value ? parseInt(value) : null;
    case "bool":
      return value === "true" ? true : value === "false" ? false : null;
    case "date":
      return value ? new Date(`${value}T00:00:00Z`) : null;
    case "datetime":
      return value ? parseDateTimeInTimezone(value, timezone) : null;
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unhandled ESG field kind: ${_exhaustive}`);
    }
  }
}

export function parseEsgForm(
  fields: { key: string; kind: EsgFieldKind }[],
  formData: FormData,
  timezone: string,
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const f of fields) {
    // Checkbox-style booleans in grids post nothing when unchecked.
    if (!formData.has(f.key) && f.kind !== "bool") continue;
    values[f.key] = parseEsgValue(f.kind, formData.get(f.key), timezone);
  }
  return values;
}
