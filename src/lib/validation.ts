import { z } from "zod";
import { UserFacingError } from "@/lib/userErrors";

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
