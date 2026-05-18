// Recursively nulls every `updatedBy` field in a Prisma result tree. Defense-in-depth for the
// unauthenticated /share/[token]/ route: even if a report body forgets to honor a hideUser flag,
// staff names and emails never leave the server. Mutates the input in place (request-scoped data).
export function stripUpdatedBy<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    for (const item of value) stripUpdatedBy(item);
    return value;
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (key === "updatedBy") obj[key] = null;
    else stripUpdatedBy(obj[key]);
  }
  return value;
}
