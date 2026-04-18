export type SortDir = "asc" | "desc";

export function sortIndicator(active: boolean, dir: SortDir): string {
  return active ? (dir === "asc" ? " ↑" : " ↓") : "";
}

export function compareValues(
  a: string | number | Date | null,
  b: string | number | Date | null,
  dir: SortDir
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;

  let result: number;
  if (a instanceof Date && b instanceof Date) {
    result = a.getTime() - b.getTime();
  } else if (typeof a === "number" && typeof b === "number") {
    result = a - b;
  } else {
    result = String(a).toLowerCase().localeCompare(String(b).toLowerCase());
  }

  return dir === "asc" ? result : -result;
}
