// Normalizes a label to the legacy SCREAMING_SNAKE_CASE format used before
// CustomOption.value was dropped, so old DB records can still be resolved.
function normalize(label: string): string {
  return label.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

export function toTitleCase(str: string): string {
  return str
    .split(/[\s_]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function resolveOptionLabel(
  stored: string | null | undefined,
  options: { label: string }[]
): string {
  if (!stored) return "";
  const exact = options.find((o) => o.label === stored);
  if (exact) return toTitleCase(exact.label);
  const normalized = options.find((o) => normalize(o.label) === stored);
  return toTitleCase(normalized ? normalized.label : stored);
}

export function resolveOptionColor(
  stored: string | null | undefined,
  options: { label: string; color?: string | null }[]
): string {
  if (!stored) return "gray";
  const exact = options.find((o) => o.label === stored);
  if (exact) return exact.color || "gray";
  const normalized = options.find((o) => normalize(o.label) === stored);
  return normalized?.color || "gray";
}
