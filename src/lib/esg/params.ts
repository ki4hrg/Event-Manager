// URL ⇄ ESG filters, shared by the report page, its print route and the share
// views. Parts are validated here; days and function ids are validated by
// getEsgData against the event's own options (it returns what it applied).

import { ESG_PARTS, type EsgPart } from "@/lib/esg/types";

export type EsgSearchParams = Record<string, string | string[] | undefined>;

export type EsgUrlFilters = {
  parts: EsgPart[];
  days: string[];
  functionIds: string[];
  showBlank: boolean;
  includeBilling: boolean;
};

function str(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function list(v: string | string[] | undefined): string[] {
  return (str(v) ?? "").split(",").filter(Boolean);
}

export function parseEsgSearchParams(sp: EsgSearchParams, prefix = ""): EsgUrlFilters {
  const parts = list(sp[`${prefix}parts`]).filter((p): p is EsgPart => (ESG_PARTS as string[]).includes(p));
  return {
    parts: parts.length ? parts : ESG_PARTS,
    days: list(sp[`${prefix}days`]),
    functionIds: list(sp[`${prefix}functions`]),
    showBlank: str(sp[`${prefix}blank`]) === "1",
    includeBilling: str(sp[`${prefix}billing`]) !== "0",
  };
}

export function esgFiltersToQuery(f: EsgUrlFilters): string {
  const p = new URLSearchParams();
  if (f.parts.length < ESG_PARTS.length) p.set("parts", f.parts.join(","));
  if (f.days.length) p.set("days", f.days.join(","));
  if (f.functionIds.length) p.set("functions", f.functionIds.join(","));
  if (f.showBlank) p.set("blank", "1");
  if (!f.includeBilling) p.set("billing", "0");
  return p.toString();
}

// Share views: locked links use the stored filters; unlocked links let the URL
// override parts / days / functions / blank. Billing (tax ID, bill-to,
// signatories) only ever comes from the link itself — a viewer can't turn it on.
export function resolveSharedEsgFilters(
  locked: boolean,
  stored: { parts?: string[]; days?: string[]; functionIds?: string[]; showBlank?: boolean; includeBilling?: boolean },
  sp: EsgSearchParams,
  prefix = "",
): EsgUrlFilters {
  const fromStored = parseEsgSearchParams({
    parts: stored.parts?.join(","),
    days: stored.days?.join(","),
    functions: stored.functionIds?.join(","),
    blank: stored.showBlank ? "1" : undefined,
  });
  const includeBilling = stored.includeBilling === true;
  if (locked) return { ...fromStored, includeBilling };
  const url = parseEsgSearchParams(sp, prefix);
  const has = (k: string) => typeof sp[`${prefix}${k}`] === "string";
  return {
    parts: has("parts") ? url.parts : fromStored.parts,
    days: has("days") ? url.days : fromStored.days,
    functionIds: has("functions") ? url.functionIds : fromStored.functionIds,
    showBlank: has("blank") ? url.showBlank : fromStored.showBlank,
    includeBilling,
  };
}
