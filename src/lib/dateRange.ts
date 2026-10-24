import { addDays } from "@/lib/hotels";

// Wall-clock arithmetic on datetime-local strings (YYYY-MM-DDTHH:MM): read as
// UTC so no timezone or DST shift creeps in. Only durations come out of this.
const wall = (v: string) => Date.parse(`${v}Z`);
const fromWall = (ms: number) => new Date(ms).toISOString().slice(0, 16);

type RangeOptions = {
  // Days the end must fall after the start (1 for check-out after check-in). Dates only.
  gapDays?: number;
  // Fill an empty end from the start. Off for optional ends, where empty means "not set".
  fillEmpty?: boolean;
  // Datetime-local: an end that's now too early keeps its old duration from the start.
  keepDuration?: boolean;
  // Datetime-local: the duration an empty end gets when filled.
  defaultMinutes?: number;
};

// Call from a start input's onChange (date, datetime-local or time). Points the
// end input (same form, by name) at the start: its `min` follows the start, and
// an end that's empty or now before the start moves to an allowed value. A
// still-valid end the user set is left alone. Works on uncontrolled inputs.
export function syncRangeEnd(start: HTMLInputElement, endName: string, options: RangeOptions = {}) {
  const { gapDays = 0, fillEmpty = true, keepDuration = false, defaultMinutes = 0 } = options;
  const end = start.form?.elements.namedItem(endName);
  if (!(end instanceof HTMLInputElement)) return;
  if (end.dataset.baseMin === undefined) end.dataset.baseMin = end.getAttribute("min") ?? "";
  const v = start.value;
  if (!v) {
    end.min = end.dataset.baseMin;
    return;
  }
  // The last complete start, so a half-typed value doesn't lose the duration.
  const prev = start.dataset.prev ?? start.defaultValue;
  start.dataset.prev = v;
  const min = gapDays ? addDays(v, gapDays) : v;
  end.min = min;
  if (end.value ? end.value >= min : !fillEmpty) return;
  if (keepDuration) {
    const kept = end.value && prev ? wall(end.value) - wall(prev) : NaN;
    const duration = kept >= 0 ? kept : defaultMinutes * 60_000;
    end.value = fromWall(wall(v) + duration);
  } else {
    end.value = min;
  }
}

// The `min` an end input renders with, before any change: the start (+ gap days).
export function rangeEndMin(start: string | null | undefined, gapDays = 0): string | undefined {
  if (!start) return undefined;
  return gapDays ? addDays(start, gapDays) : start;
}

// For a controlled pair: the end to hold once the start changes to `start`.
// An empty or too-early end moves to the start (+ gap days); a valid one stays.
export function rangeEndFor(start: string, end: string, gapDays = 0, fillEmpty = true): string {
  const min = rangeEndMin(start, gapDays);
  if (!min || (end ? end >= min : !fillEmpty)) return end;
  return min;
}

type Instant = Date | string | null | undefined;
// Date-only strings (YYYY-MM-DD) read as UTC midnight, matching @db.Date columns.
const instant = (v: Instant) => (v == null || v === "" ? null : v instanceof Date ? v.getTime() : Date.parse(v));

// Whether a save checks its range: always on create (nothing stored), and on an
// update only when it writes a start or end the row doesn't already hold. A row
// stored reversed before the check existed still saves its other edits.
export function rangeTouched(stored: { start: Instant; end: Instant } | null, start: Instant, end: Instant): boolean {
  if (!stored) return true;
  return instant(stored.start) !== instant(start) || instant(stored.end) !== instant(end);
}
