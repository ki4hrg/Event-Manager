/**
 * Parse a datetime-local input value (YYYY-MM-DDTHH:MM[:SS]) as if it's in the given
 * timezone and return a UTC Date object. Iterates to converge across DST transitions.
 */
export function parseDateTimeInTimezone(dateTimeLocal: string, timezone: string): Date {
  const [datePart, timePart = "00:00"] = dateTimeLocal.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);

  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute));

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  for (let i = 0; i < 3; i++) {
    const formatted = formatter.format(guess);
    const parts = formatted.replace(/, /, "T").split(/[-T:]/);
    const guessYear = parseInt(parts[0]);
    const guessMonth = parseInt(parts[1]);
    const guessDay = parseInt(parts[2]);
    const guessHour = parseInt(parts[3]);
    const guessMinute = parseInt(parts[4]);

    const targetMs = Date.UTC(year, month - 1, day, hour, minute);
    const guessLocalMs = Date.UTC(guessYear, guessMonth - 1, guessDay, guessHour, guessMinute);
    const diffMs = targetMs - guessLocalMs;

    if (diffMs === 0) break;
    guess = new Date(guess.getTime() + diffMs);
  }

  return guess;
}
