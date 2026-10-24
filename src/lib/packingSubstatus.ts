// Packing sub-states: the tenant's packing_substatus list, each option grouped
// under one PackingStatus (Packed under Needed, Shipped under In Transit). A
// row's sub-state belongs to its status, so a write that moves a row to another
// status without naming a sub-state clears it. Server-only.

import type { PackingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { optionsWhereForEvent } from "@/lib/options";
import { PACKING_STATUS_LABEL } from "@/lib/statusConstants";

// A named sub-state must be on the event's tenant's list under `status`.
export async function assertPackingSubstatus(eventId: string, status: PackingStatus | null, substatus: string | null | undefined) {
  if (!substatus) return;
  const found =
    status &&
    (await prisma.customOption.findFirst({
      where: { ...optionsWhereForEvent(eventId, "packing_substatus"), label: substatus, group: status },
      select: { id: true },
    }));
  if (!found) throw new Error(`"${substatus}" isn't a ${status ? PACKING_STATUS_LABEL[status] : "packing"} sub-state`);
}

type Stored = { packingStatus: PackingStatus | null; packingSubstatus: string | null } | null;

// The sub-state a one-row write stores: the one given (checked), else the
// stored one while the status stays put.
export async function packingSubstatusFor(
  eventId: string,
  status: PackingStatus | null,
  given: string | null | undefined,
  stored: Stored,
): Promise<string | null> {
  if (given !== undefined) {
    // Resaving what's stored needs no check (a label since dropped from the list).
    const unchanged = stored && status === stored.packingStatus && given === stored.packingSubstatus;
    if (!unchanged) await assertPackingSubstatus(eventId, status, given);
    return status ? given : null;
  }
  return stored && status && stored.packingStatus === status ? stored.packingSubstatus : null;
}

// An item-level updateMany (items' status is never null): with no sub-state
// given, only rows that change status are written, and theirs clears. Check a
// given sub-state with assertPackingSubstatus first.
export function packingItemsWrite(status: PackingStatus, substatus: string | null | undefined) {
  return substatus === undefined
    ? { where: { packingStatus: { not: status } }, data: { packingStatus: status, packingSubstatus: null } }
    : { where: {}, data: { packingStatus: status, packingSubstatus: substatus } };
}
