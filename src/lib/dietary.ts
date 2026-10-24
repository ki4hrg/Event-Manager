// A catering order's special-meal counts as one line: "Vegetarian 4 · Vegan 2".
export function formatDietaryCounts(counts: { label: string; count: number }[]): string | null {
  return counts.length ? counts.map((c) => `${c.label} ${c.count}`).join(" · ") : null;
}
