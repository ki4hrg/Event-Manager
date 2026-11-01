import { z } from "zod";
import { UserFacingError } from "@/lib/userErrors";
import { PermissionError } from "@/lib/permissionError";

// Shared building blocks for parsing what a client sends. Area-specific
// schemas live beside the core that uses them (see QuoteLineSchema in
// src/app/events/quotes/core.ts), with the core's type derived from them.

/** An id from the client: a short string, never a Prisma filter object. */
export const idSchema = z.string().min(1).max(100);

/** Free text a person typed, bounded. */
export const text = (max = 10_000) => z.string().max(max);

/** A number the form parsed, or null for blank. JSON can't carry NaN. */
export const nullableNumber = z.number().finite().nullable();

/** A YYYY-MM-DD date key, as the date inputs post them. */
export const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");

// Lists a form posts as one hidden JSON field are written by the page's own
// script, so a refusal means a stale or tampered page, not a typing mistake.
const MALFORMED = "The form sent data this page can't read. Reload the page and try again.";

/**
 * A list posted as JSON in one form field (`<input type="hidden" value={JSON.stringify(rows)}>`),
 * each entry checked against `item`. Absent or empty means []. Malformed JSON,
 * a non-list or a bad entry is a UserFacingError, never a 500.
 */
export function readJsonList<T>(formData: FormData, key: string, item: z.ZodType<T>, max = 2_000): T[] {
  const raw = formData.get(key);
  if (typeof raw !== "string" || !raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new UserFacingError(MALFORMED);
  }
  const result = z.array(item).max(max).safeParse(parsed);
  if (!result.success) throw new UserFacingError(MALFORMED);
  return result.data;
}

/**
 * A Server Action's structured argument (an object or list the page's script
 * builds), checked against `schema`. A refusal is a UserFacingError.
 */
export function parseArgs<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new UserFacingError(MALFORMED);
  return result.data;
}

/** A list of ids from the client. */
export const idList = (max = 1_000) => z.array(idSchema).max(max);

// Server Action arguments travel in React's own encoding, which (unlike JSON)
// keeps NaN, Infinity and undefined. These read them the way the cores always
// have: a non-finite number as none, a missing optional string as null.
// (z.number() itself refuses NaN, so the type check is by hand.)
const anyNumber = z.custom<number>((v) => typeof v === "number", "Expected a number");
export const looseNumber = anyNumber.nullish().transform((n) => (n == null || !Number.isFinite(n) ? null : n));
/** A number where none means 0 (a count): NaN and Infinity read as 0. */
export const looseCount = anyNumber.transform((n) => (Number.isFinite(n) ? n : 0));
// Bounds stay loose: an editor resends its stored rows on every autosave, so a
// value stored before these checks must still pass (Server Action bodies are
// capped at 1MB anyway).
export const looseText = (max = 100_000) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((s) => s ?? null);

/**
 * Ids a caller passed, each a real id string. A Server Action's arguments come
 * from the client unchecked, and an object there is a Prisma filter: as the id
 * in `deleteMany({ where: { id } })`, `{ not: "" }` matches every row. Anything
 * that isn't an id reads as not found.
 */
export function assertIds(...values: unknown[]): void {
  if (values.length > 10_000) throw new PermissionError("NOT_FOUND");
  if (!values.every((v) => idSchema.safeParse(v).success)) throw new PermissionError("NOT_FOUND");
}

/**
 * A text field from a form, trimmed. Blank is null unless `required` (then a
 * UserFacingError naming `label`); longer than `max` is refused the same way.
 * Bounds are generous: a form may resend a value stored before they existed.
 */
export function formText(formData: FormData, key: string, opts: { label: string; max: number; required: true }): string;
export function formText(formData: FormData, key: string, opts: { label: string; max: number; required?: false }): string | null;
export function formText(formData: FormData, key: string, opts: { label: string; max: number; required?: boolean }) {
  const raw = formData.get(key);
  const value = (typeof raw === "string" ? raw : "").trim();
  if (!value) {
    if (opts.required) throw new UserFacingError(`${opts.label} is required`);
    return null;
  }
  if (value.length > opts.max) throw new UserFacingError(`${opts.label} must be at most ${opts.max} characters`);
  return value;
}
