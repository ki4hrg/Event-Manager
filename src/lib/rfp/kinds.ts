// Which permission resource guards each RFP kind. Pure.

import type { PermissionResource, RfpKind } from "@prisma/client";

export function resourceForKind(kind: RfpKind): PermissionResource {
  switch (kind) {
    case "HOTEL":
      return "HOTELS";
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unhandled RFP kind: ${_exhaustive}`);
    }
  }
}
