import { Prisma } from "@prisma/client";

// Walks a result tree and converts Prisma's non-JSON-native scalars into safe
// JSON shapes. Dates become ISO 8601 strings; Decimals become strings to
// preserve precision on financial fields (CateringOrderLineItem.unitPrice,
// CateringOrder.rentalMinimum/fbMinimum). Buffers / BigInts are not used in
// this schema, so we don't handle them.
export function serializeForMcp<T>(value: T): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Prisma.Decimal) return value.toString();
  if (Array.isArray(value)) return value.map(serializeForMcp);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serializeForMcp(v);
    }
    return out;
  }
  return value;
}
