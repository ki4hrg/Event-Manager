// Pure helpers for ESG function numbers ("12", "4a", breakout rooms "12b").
// Client-safe: no Prisma. The assignment engine lives in functionNumbering.ts.

import { formatBreakoutSessionName } from "@/lib/breakoutLabels";

// Split "12", "4a", "4a.2" into comparable parts.
function parts(n: string): [number, string, number] {
  const m = /^(\d+)([a-z]*)(?:\.(\d+))?$/i.exec(n.trim());
  if (!m) return [Number.MAX_SAFE_INTEGER, n.toLowerCase(), 0];
  return [parseInt(m[1], 10), m[2].toLowerCase(), m[3] ? parseInt(m[3], 10) : 0];
}

// Natural order: 1, 2, 2a, 2b, 3, 10. Unnumbered sorts last.
export function compareFunctionNumbers(a: string | null | undefined, b: string | null | undefined): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const [an, as, ad] = parts(a);
  const [bn, bs, bd] = parts(b);
  if (an !== bn) return an - bn;
  if (as.length !== bs.length) return as.length - bs.length;
  if (as !== bs) return as < bs ? -1 : 1;
  return ad - bd;
}

// Leading integer of a number ("4a" → 4), or null for free-form overrides.
export function baseInteger(n: string): number | null {
  const m = /^(\d+)/.exec(n.trim());
  return m ? parseInt(m[1], 10) : null;
}

// a, b, … z, aa, ab, … — the ESG's "intermediate number" suffixes.
export function letterSuffix(index: number): string {
  let s = "";
  let i = index;
  do {
    s = String.fromCharCode(97 + (i % 26)) + s;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return s;
}

function suffixIndex(suffix: string): number {
  let i = 0;
  for (const ch of suffix.toLowerCase()) i = i * 26 + (ch.charCodeAt(0) - 96);
  return i - 1;
}

// A breakout room's number: "12" + "b" → "12b". When the block's own number
// already ends in a letter ("4a"), rooms read "4a.1", "4a.2" instead.
export function roomFunctionNumber(base: string, suffix: string): string {
  if (/[a-z]$/i.test(base)) return `${base}.${suffixIndex(suffix) + 1}`;
  return `${base}${suffix}`;
}

export function formatFunctionNumber(n: string | null | undefined): string {
  return n ? `#${n}` : "";
}

// "#12 · Learn & Lead Session 1" — the function's display name everywhere a
// number should travel with it (lists, orders, reports, pickers).
export function formatFunctionLabel(fn: {
  name: string;
  functionNumber?: string | null;
  breakoutGroup?: { name: string } | null;
}): string {
  const name = formatBreakoutSessionName(fn.name, fn.breakoutGroup?.name);
  return fn.functionNumber ? `#${fn.functionNumber} · ${name}` : name;
}

// Search helper: does the query match the number ("12", "#4a") or the label?
export function matchesFunctionQuery(
  fn: { name: string; functionNumber?: string | null; breakoutGroup?: { name: string } | null },
  query: string,
): boolean {
  const q = query.trim().toLowerCase().replace(/^#/, "");
  if (!q) return true;
  if (fn.functionNumber && fn.functionNumber.toLowerCase() === q) return true;
  return formatFunctionLabel(fn).toLowerCase().includes(q);
}
