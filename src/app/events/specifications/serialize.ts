// Stored ESG / PER values → what the entry cards' inputs take. Plain module so
// both entry pages (server) share it.

import { toDateInput } from "@/lib/esg/format";
import { SPEC_GRID_COLUMNS, type EsgFieldDef, type SpecGrid } from "@/lib/esg/fields";
import type { SpecValue } from "./SpecFieldInput";
import type { SpecGridRow } from "./SpecGridTable";

export function serializeSpecValue(kind: string, value: unknown): SpecValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return kind === "date" ? toDateInput(value) : value.toISOString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

// Columns come from `columns`, narrative fields from the `narrative` JSON.
export function serializeFields(
  fields: EsgFieldDef[],
  columns: Record<string, unknown> | null,
  narrative: Record<string, unknown>,
): Record<string, SpecValue> {
  return Object.fromEntries(
    fields.map((f) => [f.key, serializeSpecValue(f.kind, f.storage === "narrative" ? narrative[f.key] : columns?.[f.key])]),
  );
}

export function serializeGridRows(grid: SpecGrid, rows: unknown[]): SpecGridRow[] {
  return (rows as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    values: Object.fromEntries(SPEC_GRID_COLUMNS[grid].map((c) => [c.key, serializeSpecValue(c.kind, row[c.key])])),
  }));
}
