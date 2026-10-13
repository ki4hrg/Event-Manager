// Pure cores for exhibit booths (APEX ESG Part IIIb, Booth Set-up Orders).
// NOT a "use server" file — see src/app/contacts/core.ts for the rationale.
// Booths hang off an event's exhibit function, so they gate on FUNCTIONS.

import type { Prisma, ProvidedBy } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PermissionError, requireEventTenantId, requirePermissionForUser } from "@/lib/permissions";
import { resolveEquipmentName } from "@/lib/equipment-utils";

export type BoothWriteArgs = {
  name: string;
  functionId?: string | null;
  boothNumber?: string | null;
  location?: string | null;
  boothType?: string | null;
  companyName?: string | null;
  contactId?: string | null;
  startAt?: Date | null;
  endAt?: Date | null;
  setupBy?: Date | null;
  teardownBy?: Date | null;
  specialRequirements?: string | null;
  setupNotes?: string | null;
  avProvider?: ProvidedBy | null;
  avNotes?: string | null;
  fbNotes?: string | null;
  decorNotes?: string | null;
  securityNotes?: string | null;
  signageNotes?: string | null;
  shippingRequired?: boolean | null;
  customsRequired?: boolean | null;
  materialHandlingNotes?: string | null;
  electricalProvider?: ProvidedBy | null;
  electricalNotes?: string | null;
  utilitiesNotes?: string | null;
  taxExempt?: boolean | null;
  taxExemptId?: string | null;
  costCenter?: string | null;
  billingNotes?: string | null;
};

const BOOTH_KEYS = [
  "name", "functionId", "boothNumber", "location", "boothType", "companyName", "contactId",
  "startAt", "endAt", "setupBy", "teardownBy", "specialRequirements", "setupNotes", "avProvider", "avNotes",
  "fbNotes", "decorNotes", "securityNotes", "signageNotes", "shippingRequired", "customsRequired",
  "materialHandlingNotes", "electricalProvider", "electricalNotes", "utilitiesNotes", "taxExempt",
  "taxExemptId", "costCenter", "billingNotes",
] as const satisfies readonly (keyof BoothWriteArgs)[];

// A foreign function or contact id reads as not-found, never a cross-event link.
async function assertBoothRefs(eventId: string, args: Partial<BoothWriteArgs>) {
  if (args.functionId) {
    const fn = await prisma.function.findFirst({ where: { id: args.functionId, eventId }, select: { id: true } });
    if (!fn) throw new PermissionError("NOT_FOUND", "Function not found");
  }
  if (args.contactId) {
    const tenantId = await requireEventTenantId(eventId);
    const c = await prisma.contact.findFirst({ where: { id: args.contactId, tenantId }, select: { id: true } });
    if (!c) throw new PermissionError("NOT_FOUND", "Contact not found");
  }
}

function boothData(args: Partial<BoothWriteArgs>): Partial<Prisma.ExhibitBoothUncheckedCreateInput> {
  const data: Record<string, unknown> = {};
  for (const k of BOOTH_KEYS) if (args[k] !== undefined) data[k] = args[k];
  return data;
}

async function assertBoothInEvent(boothId: string, eventId: string) {
  const b = await prisma.exhibitBooth.findFirst({ where: { id: boothId, eventId }, select: { id: true } });
  if (!b) throw new PermissionError("NOT_FOUND");
}

export async function createExhibitBoothCore(eventId: string, args: BoothWriteArgs, userId: string) {
  await requirePermissionForUser(userId, "FUNCTIONS", "WRITE", eventId);
  if (!args.name?.trim()) throw new Error("Booth name is required");
  await assertBoothRefs(eventId, args);
  const max = await prisma.exhibitBooth.aggregate({ where: { eventId }, _max: { sortOrder: true } });
  return prisma.exhibitBooth.create({
    data: { ...boothData(args), name: args.name, eventId, sortOrder: (max._max.sortOrder ?? -1) + 1, updatedById: userId },
  });
}

// Partial update: omitted keys are unchanged.
export async function updateExhibitBoothCore(id: string, eventId: string, args: Partial<BoothWriteArgs>, userId: string) {
  await requirePermissionForUser(userId, "FUNCTIONS", "WRITE", eventId);
  if (args.name !== undefined && !args.name.trim()) throw new Error("Booth name is required");
  await assertBoothRefs(eventId, args);
  return prisma.exhibitBooth.update({ where: { id, eventId }, data: { ...boothData(args), updatedById: userId } });
}

export async function deleteExhibitBoothCore(id: string, eventId: string, userId: string) {
  await requirePermissionForUser(userId, "FUNCTIONS", "DELETE", eventId);
  await prisma.exhibitBooth.delete({ where: { id, eventId } });
}

// ---------------------------------------------------------------------------
// Inventory needed (EquipmentItem rows on the booth)

export type BoothEquipmentItemWriteArgs = {
  equipmentId: string | null;
  item: string;
  quantity: number | null;
  providerVendorId: string | null;
  providerContactId: string | null;
  operatorVendorId: string | null;
  operatorContactId: string | null;
  notes: string | null;
};

async function assertEquipmentRefs(eventId: string, args: BoothEquipmentItemWriteArgs) {
  const tenantId = await requireEventTenantId(eventId);
  const checks: Promise<unknown>[] = [];
  if (args.equipmentId) checks.push(prisma.equipment.findFirst({ where: { id: args.equipmentId, tenantId }, select: { id: true } }));
  for (const id of [args.providerVendorId, args.operatorVendorId]) {
    if (id) checks.push(prisma.vendor.findFirst({ where: { id, tenantId }, select: { id: true } }));
  }
  for (const id of [args.providerContactId, args.operatorContactId]) {
    if (id) checks.push(prisma.contact.findFirst({ where: { id, tenantId }, select: { id: true } }));
  }
  const results = await Promise.all(checks);
  if (results.some((r) => !r)) throw new PermissionError("NOT_FOUND", "Referenced record not found");
}

export async function createBoothEquipmentItemCore(
  boothId: string,
  eventId: string,
  args: BoothEquipmentItemWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "FUNCTIONS", "WRITE", eventId);
  await assertBoothInEvent(boothId, eventId);
  await assertEquipmentRefs(eventId, args);
  const item = await resolveEquipmentName(args.equipmentId, args.item);
  const { _max } = await prisma.equipmentItem.aggregate({ where: { exhibitBoothId: boothId }, _max: { sortOrder: true } });
  return prisma.equipmentItem.create({
    data: { ...args, item, exhibitBoothId: boothId, sortOrder: (_max.sortOrder ?? -1) + 1 },
  });
}

export async function updateBoothEquipmentItemCore(
  id: string,
  eventId: string,
  args: BoothEquipmentItemWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "FUNCTIONS", "WRITE", eventId);
  await assertEquipmentRefs(eventId, args);
  const item = await resolveEquipmentName(args.equipmentId, args.item);
  return prisma.equipmentItem.update({ where: { id, exhibitBooth: { eventId } }, data: { ...args, item } });
}

export async function deleteBoothEquipmentItemCore(id: string, eventId: string, userId: string) {
  await requirePermissionForUser(userId, "FUNCTIONS", "WRITE", eventId);
  await prisma.equipmentItem.delete({ where: { id, exhibitBooth: { eventId } } });
}
