// Formatting shared by the Specifications page and the ESG / PER renderers.
// Pure; every time is rendered in the event's timezone.

import { formatTime, getDateKeyInTimezone } from "@/lib/agendaUtils";

// The ESG asks for times in "US & Military": 2:30 PM (14:30).
export function formatTimeDual(date: Date, timezone: string): string {
  const military = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `${formatTime(date, timezone)} (${military})`;
}

// "Mon, Nov 2, 2026" for a timestamp, in the event timezone.
export function formatDayDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatDayDateTime(date: Date, timezone: string): string {
  return `${formatDayDate(date, timezone)}, ${formatTimeDual(date, timezone)}`;
}

// @db.Date columns arrive as UTC midnight; format them in UTC so the day
// never shifts.
export function formatDateOnly(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}

// Value for <input type="datetime-local"> in the event timezone.
export function toDateTimeLocal(date: Date | string | null | undefined, timezone: string): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return `${getDateKeyInTimezone(d, timezone)}T${parts.replace("24:", "00:")}`;
}

// Value for <input type="date"> from a @db.Date column.
export function toDateInput(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().slice(0, 10);
}

export function formatYesNo(value: boolean | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value ? "Yes" : "No";
}

// Rich text is HTML from RichTextEditor; "<p></p>" counts as empty.
export function isBlankText(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== "string") return false;
  return value.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() === "";
}
