// Which permission resource guards each RFP kind, and how a kind reads. Pure.

import type { PermissionResource, RfpKind } from "@prisma/client";

export function resourceForKind(kind: RfpKind): PermissionResource {
  switch (kind) {
    case "HOTEL":
      return "HOTELS";
    case "AV":
      return "AV_ORDERS";
    case "CATERING":
      return "CATERING_ORDERS";
    case "PRINT":
      return "PRINT_ORDERS";
    // No order resource of its own; event work, not the vendor catalog.
    case "OTHER":
      return "EVENTS";
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unhandled RFP kind: ${_exhaustive}`);
    }
  }
}

export const RFP_KIND_LABELS: Record<RfpKind, string> = {
  HOTEL: "Hotel",
  AV: "AV",
  CATERING: "Catering",
  PRINT: "Print & signage",
  OTHER: "Other services",
};

// Kinds that go to vendors (hotels go to venues).
export const VENDOR_RFP_KINDS = ["AV", "CATERING", "PRINT", "OTHER"] as const satisfies readonly RfpKind[];
export type VendorRfpKind = (typeof VENDOR_RFP_KINDS)[number];
export const isVendorKind = (kind: RfpKind): kind is VendorRfpKind => kind !== "HOTEL";
