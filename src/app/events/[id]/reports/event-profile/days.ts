import { formatDateHeading } from "@/lib/agendaUtils";

export type DayOption = { value: string; label: string };

export function enumerateEventDays(
  start: Date,
  end: Date,
  timezone: string,
  extraDayKeys: Iterable<string> = []
): DayOption[] {
  // start/end are calendar dates stored as UTC midnight (the form posts YYYY-MM-DD).
  // Slice the ISO date portion directly — converting through the event timezone would
  // shift western timezones back by one day and drop the last day of the event.
  const startKey = start.toISOString().slice(0, 10);
  const endKey = end.toISOString().slice(0, 10);
  const keys = new Set<string>();
  let cursor = startKey;
  for (let i = 0; i < 60 && cursor <= endKey; i++) {
    keys.add(cursor);
    const d = new Date(`${cursor}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    cursor = d.toISOString().slice(0, 10);
  }
  // Include days with content outside the event range (pre-event setup, post-event teardown).
  Array.from(extraDayKeys).forEach((key) => keys.add(key));
  return Array.from(keys)
    .sort()
    .map((value) => ({ value, label: formatDateHeading(value, timezone) }));
}
