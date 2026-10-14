// Pure cores for exhibit booths and booth groups (APEX ESG Part IIIb, Booth
// Set-up Orders).
// NOT a "use server" file — see src/app/contacts/core.ts for the rationale.
// Booths hang off an event's exhibit function, so they gate on FUNCTIONS.

import type { Prisma, ProvidedBy } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PermissionError, requireEventTenantId, requirePermissionForUser } from "@/lib/permissions";
import { resolveEquipmentName } from "@/lib/equipment-utils";
import { BOOTH_SHARED_KEYS } from "@/lib/boothGroups";

// Settings a booth group shares with its booths (BOOTH_SHARED_KEYS).
export type BoothSharedArgs = {
  functionId?: string | null;
  boothNumber?: string | null;
  location?: string | null;
  boothType?: string | null;
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

export type BoothWriteArgs = BoothSharedArgs & {
  name: string;
  groupId?: string | null;
  boothNumber?: string | null;
  companyName?: string | null;
  contactId?: string | null;
};

export type BoothGroupWriteArgs = BoothSharedArgs & { name: string };

const BOOTH_KEYS = [
  "name", "groupId", "boothNumber", "companyName", "contactId", ...BOOTH_SHARED_KEYS,
] as const satisfies readonly (keyof BoothWriteArgs)[];

const GROUP_KEYS = ["name", ...BOOTH_SHARED_KEYS] as const satisfies readonly (keyof BoothGroupWriteArgs)[];

// A foreign function, group or contact id reads as not-found, never a
// cross-event link.
async function assertBoothRefs(eventId: string, args: Partial<BoothWriteArgs>) {
  if (args.groupId) await assertGroupInEvent(args.groupId, eventId);
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

function pick<A extends object>(args: Partial<A>, keys: readonly (keyof A)[]): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const k of keys) if (args[k] !== undefined) data[k as string] = args[k];
  return data;
}

function boothData(args: Partial<BoothWriteArgs>): Partial<Prisma.ExhibitBoothUncheckedCreateInput> {
  return pick(args, BOOTH_KEYS);
}

async function assertBoothInEvent(boothId: string, eventId: string) {
  const b = await prisma.exhibitBooth.findFirst({ where: { id: boothId, eventId }, select: { id: true } });
  if (!b) throw new PermissionError("NOT_FOUND");
}

async function assertGroupInEvent(groupId: string, eventId: string) {
  const g = await prisma.exhibitBoothGroup.findFirst({ where: { id: groupId, eventId }, select: { id: true } });
  if (!g) throw new PermissionError("NOT_FOUND", "Booth group not found");
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
// Booth groups

export async function createBoothGroupCore(eventId: string, args: BoothGroupWriteArgs, userId: string) {
  await requirePermissionForUser(userId, "FUNCTIONS", "WRITE", eventId);
  if (!args.name?.trim()) throw new Error("Group name is required");
  await assertBoothRefs(eventId, args);
  const max = await prisma.exhibitBoothGroup.aggregate({ where: { eventId }, _max: { sortOrder: true } });
  return prisma.exhibitBoothGroup.create({
    data: { ...pick(args, GROUP_KEYS), name: args.name, eventId, sortOrder: (max._max.sortOrder ?? -1) + 1, updatedById: userId },
  });
}

// Partial update: omitted keys are unchanged.
export async function updateBoothGroupCore(id: string, eventId: string, args: Partial<BoothGroupWriteArgs>, userId: string) {
  await requirePermissionForUser(userId, "FUNCTIONS", "WRITE", eventId);
  if (args.name !== undefined && !args.name.trim()) throw new Error("Group name is required");
  await assertBoothRefs(eventId, args);
  return prisma.exhibitBoothGroup.update({ where: { id, eventId }, data: { ...pick(args, GROUP_KEYS), updatedById: userId } });
}

// Booths stay; they lose the group's defaults (groupId is set null).
export async function deleteBoothGroupCore(id: string, eventId: string, userId: string) {
  await requirePermissionForUser(userId, "FUNCTIONS", "DELETE", eventId);
  await prisma.exhibitBoothGroup.delete({ where: { id, eventId } });
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

// Inventory hangs off one booth, or off a group (every booth in it gets it).
export type BoothEquipmentTarget = { boothId: string } | { groupId: string };

export async function createBoothEquipmentItemCore(
  target: BoothEquipmentTarget,
  eventId: string,
  args: BoothEquipmentItemWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "FUNCTIONS", "WRITE", eventId);
  if ("boothId" in target) await assertBoothInEvent(target.boothId, eventId);
  else await assertGroupInEvent(target.groupId, eventId);
  await assertEquipmentRefs(eventId, args);
  const item = await resolveEquipmentName(args.equipmentId, args.item);
  const owner = "boothId" in target ? { exhibitBoothId: target.boothId } : { exhibitBoothGroupId: target.groupId };
  const { _max } = await prisma.equipmentItem.aggregate({ where: owner, _max: { sortOrder: true } });
  return prisma.equipmentItem.create({
    data: { ...args, item, ...owner, sortOrder: (_max.sortOrder ?? -1) + 1 },
  });
}

const inEventBooths = (eventId: string) => ({
  OR: [{ exhibitBooth: { eventId } }, { exhibitBoothGroup: { eventId } }],
});

export async function updateBoothEquipmentItemCore(
  id: string,
  eventId: string,
  args: BoothEquipmentItemWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "FUNCTIONS", "WRITE", eventId);
  await assertEquipmentRefs(eventId, args);
  const item = await resolveEquipmentName(args.equipmentId, args.item);
  return prisma.equipmentItem.update({ where: { id, ...inEventBooths(eventId) }, data: { ...args, item } });
}

export async function deleteBoothEquipmentItemCore(id: string, eventId: string, userId: string) {
  await requirePermissionForUser(userId, "FUNCTIONS", "WRITE", eventId);
  await prisma.equipmentItem.delete({ where: { id, ...inEventBooths(eventId) } });
}
