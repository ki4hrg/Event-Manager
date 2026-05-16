export type PresenceFilter = "" | "yes" | "none";

export function asPresence(v: string | undefined): PresenceFilter {
  return v === "yes" || v === "none" ? v : "";
}
