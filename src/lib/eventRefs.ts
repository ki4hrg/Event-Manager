// Every id a caller hands an event-scoped write, proven before it lands in a
// foreign-key column or a junction row: functions, presentations, breakout
// groups and tracks must be the event's own; vendors, contacts, equipment,
// rooms and storage the event's tenant's. A foreign id is a not-found, never
// a cross-event or cross-tenant link. Null / undefined / empty entries are
// skipped, so optional fields pass straight through.

import { prisma } from "@/lib/prisma";
import { PermissionError, requireEventTenantId } from "@/lib/permissions";

type Ids = (string | null | undefined)[];

export type EventRefs = {
  functionIds?: Ids;
  presentationIds?: Ids;
  breakoutGroupIds?: Ids;
  trackIds?: Ids;
  vendorIds?: Ids;
  contactIds?: Ids;
  equipmentIds?: Ids;
  roomIds?: Ids;
  storageLocationIds?: Ids;
  inventoryItemIds?: Ids;
};

const distinct = (ids: Ids | undefined) => Array.from(new Set((ids ?? []).filter((id): id is string => !!id)));

export async function assertEventRefs(eventId: string, refs: EventRefs): Promise<void> {
  const fn = distinct(refs.functionIds);
  const pres = distinct(refs.presentationIds);
  const groups = distinct(refs.breakoutGroupIds);
  const tracks = distinct(refs.trackIds);
  const vendors = distinct(refs.vendorIds);
  const contacts = distinct(refs.contactIds);
  const equipment = distinct(refs.equipmentIds);
  const rooms = distinct(refs.roomIds);
  const locations = distinct(refs.storageLocationIds);
  const items = distinct(refs.inventoryItemIds);
  const tenantScoped = vendors.length + contacts.length + equipment.length + rooms.length + locations.length + items.length;
  const tenantId = tenantScoped ? await requireEventTenantId(eventId) : null;
  const none = Promise.resolve(0);
  const checks: [string, string[], Promise<number>][] = [
    ["Function", fn, fn.length ? prisma.function.count({ where: { id: { in: fn }, eventId } }) : none],
    ["Presentation", pres, pres.length ? prisma.presentation.count({ where: { id: { in: pres }, eventId } }) : none],
    ["Breakout group", groups, groups.length ? prisma.breakoutGroup.count({ where: { id: { in: groups }, eventId } }) : none],
    ["Track", tracks, tracks.length ? prisma.presentationTrack.count({ where: { id: { in: tracks }, eventId } }) : none],
    ["Vendor", vendors, vendors.length ? prisma.vendor.count({ where: { id: { in: vendors }, tenantId: tenantId! } }) : none],
    ["Contact", contacts, contacts.length ? prisma.contact.count({ where: { id: { in: contacts }, tenantId: tenantId! } }) : none],
    ["Equipment", equipment, equipment.length ? prisma.equipment.count({ where: { id: { in: equipment }, tenantId: tenantId! } }) : none],
    ["Room", rooms, rooms.length ? prisma.room.count({ where: { id: { in: rooms }, venue: { tenantId: tenantId! } } }) : none],
    [
      "Storage location",
      locations,
      locations.length ? prisma.storageLocation.count({ where: { id: { in: locations }, tenantId: tenantId! } }) : none,
    ],
    ["Inventory item", items, items.length ? prisma.inventoryItem.count({ where: { id: { in: items }, tenantId: tenantId! } }) : none],
  ];
  const counts = await Promise.all(checks.map(([, , count]) => count));
  checks.forEach(([label, ids], i) => {
    if (counts[i] !== ids.length) throw new PermissionError("NOT_FOUND", `${label} not found`);
  });
}

// The party columns an equipment-style row carries (provider / operator, each
// a vendor or a contact), plus its catalog item.
export type PartyRefArgs = {
  equipmentId?: string | null;
  providerVendorId?: string | null;
  providerContactId?: string | null;
  operatorVendorId?: string | null;
  operatorContactId?: string | null;
};

export function partyRefs(args: PartyRefArgs): EventRefs {
  return {
    equipmentIds: [args.equipmentId],
    vendorIds: [args.providerVendorId, args.operatorVendorId],
    contactIds: [args.providerContactId, args.operatorContactId],
  };
}
