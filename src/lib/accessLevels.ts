// Per-event access caps on EventStaff. No "use server" directive, so client
// components can import the labels (same arrangement as vendors/model-types.ts).
//
// A cap narrows the user's role-derived ASSIGNED level for one event; it can
// never widen it. `__blank__` is the absence sentinel per CLAUDE.md — here it
// means "no cap, use whatever the role allows".

export const UNCAPPED = "__blank__";

export const ACCESS_CAP_OPTIONS = [
  { value: "VIEW", label: "View" },
  { value: "WRITE", label: "Edit" },
  { value: "DELETE", label: "Full" },
  { value: UNCAPPED, label: "Role default" },
] as const;

export function accessCapLabel(level: string | null): string {
  if (level == null) return "Role default";
  return ACCESS_CAP_OPTIONS.find((o) => o.value === level)?.label ?? level;
}
