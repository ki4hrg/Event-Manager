"use server";

import { withUserErrors } from "@/lib/userErrors";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ProvidedBy } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { parseDateTimeInTimezone } from "@/lib/timezones";
import { compareFunctionNumbers, formatFunctionLabel } from "@/lib/functionNumbers";
import {
  createBoothEquipmentItemCore,
  createBoothGroupCore,
  createExhibitBoothCore,
  deleteBoothEquipmentItemCore,
  deleteBoothGroupCore,
  deleteExhibitBoothCore,
  updateBoothEquipmentItemCore,
  updateBoothGroupCore,
  updateExhibitBoothCore,
  type BoothEquipmentItemWriteArgs,
  type BoothSharedArgs,
  type BoothWriteArgs,
} from "./core";
import { formEnum, formId, formInt, formName, formNote, formValue } from "@/lib/validation";

const equipmentItemsInclude = {
  include: { providerVendor: true, providerContact: true, operatorVendor: true, operatorContact: true, equipment: true },
  orderBy: { sortOrder: "asc" },
} as const;

const boothInclude = {
  group: true,
  function: { select: { id: true, name: true, functionNumber: true, breakoutGroup: { select: { name: true } } } },
  contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, organization: true } },
  updatedBy: { select: { name: true, email: true } },
} as const;

export async function getExhibitBooths(eventId: string) {
  await requirePermission("FUNCTIONS", "VIEW", eventId);
  return prisma.exhibitBooth.findMany({
    where: { eventId },
    include: { ...boothInclude, _count: { select: { equipmentItems: true } } },
    orderBy: [{ sortOrder: "asc" }],
  });
}

export async function getExhibitBooth(id: string, eventId: string) {
  await requirePermission("FUNCTIONS", "VIEW", eventId);
  return prisma.exhibitBooth.findFirst({
    where: { id, eventId },
    include: {
      ...boothInclude,
      group: { include: { equipmentItems: equipmentItemsInclude } },
      equipmentItems: equipmentItemsInclude,
    },
  });
}

export async function getBoothGroups(eventId: string) {
  await requirePermission("FUNCTIONS", "VIEW", eventId);
  return prisma.exhibitBoothGroup.findMany({
    where: { eventId },
    include: {
      function: boothInclude.function,
      _count: { select: { booths: true, equipmentItems: true } },
    },
    orderBy: [{ sortOrder: "asc" }],
  });
}

export async function getBoothGroup(id: string, eventId: string) {
  await requirePermission("FUNCTIONS", "VIEW", eventId);
  return prisma.exhibitBoothGroup.findFirst({
    where: { id, eventId },
    include: {
      function: boothInclude.function,
      updatedBy: boothInclude.updatedBy,
      equipmentItems: equipmentItemsInclude,
      booths: { select: { id: true, boothNumber: true, name: true, companyName: true } },
    },
  });
}

async function eventTimezone(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { timezone: true } });
  return event?.timezone || "America/Chicago";
}

function readShared(formData: FormData, timezone: string): BoothSharedArgs {
  const str = (k: string) => formNote(formData, k);
  const dt = (k: string) => {
    const v = formNote(formData, k, 40);
    return v ? parseDateTimeInTimezone(v, timezone) : null;
  };
  const bool = (k: string) => (formData.get(k) === "true" ? true : formData.get(k) === "false" ? false : null);
  // Blank is not stated; anything else must be a ProvidedBy value.
  const provided = (k: string) => (formData.get(k) ? formEnum(formData, k, ProvidedBy, ProvidedBy.NOT_REQUIRED) : null);
  return {
    functionId: formId(formData, "functionId"),
    location: str("location"),
    boothType: str("boothType"),
    startAt: dt("startAt"),
    endAt: dt("endAt"),
    setupBy: dt("setupBy"),
    teardownBy: dt("teardownBy"),
    specialRequirements: str("specialRequirements"),
    setupNotes: str("setupNotes"),
    avProvider: provided("avProvider"),
    avNotes: str("avNotes"),
    fbNotes: str("fbNotes"),
    decorNotes: str("decorNotes"),
    securityNotes: str("securityNotes"),
    signageNotes: str("signageNotes"),
    shippingRequired: bool("shippingRequired"),
    customsRequired: bool("customsRequired"),
    materialHandlingNotes: str("materialHandlingNotes"),
    electricalProvider: provided("electricalProvider"),
    electricalNotes: str("electricalNotes"),
    utilitiesNotes: str("utilitiesNotes"),
    taxExempt: bool("taxExempt"),
    taxExemptId: str("taxExemptId"),
    costCenter: str("costCenter"),
    billingNotes: str("billingNotes"),
  };
}

function readBooth(formData: FormData, timezone: string): BoothWriteArgs {
  const str = (k: string) => formNote(formData, k);
  return {
    ...readShared(formData, timezone),
    name: formName(formData, "name"),
    groupId: formId(formData, "groupId"),
    boothNumber: str("boothNumber"),
    companyName: str("companyName"),
    contactId: formId(formData, "contactId"),
  };
}

export async function createBoothGroup(eventId: string, formData: FormData) {
  const session = await requirePermission("FUNCTIONS", "WRITE", eventId);
  const group = await createBoothGroupCore(
    eventId,
    { ...readShared(formData, await eventTimezone(eventId)), name: formName(formData, "name") },
    session.user.id,
  );
  revalidatePath(`/events/${eventId}/exhibits`);
  redirect(`/events/${eventId}/exhibits/groups/${group.id}?success=Group created`);
}

export async function updateBoothGroup(id: string, eventId: string, formData: FormData) {
  const session = await requirePermission("FUNCTIONS", "WRITE", eventId);
  await updateBoothGroupCore(
    id,
    eventId,
    { ...readShared(formData, await eventTimezone(eventId)), name: formName(formData, "name") },
    session.user.id,
  );
  revalidatePath(`/events/${eventId}/exhibits`);
  revalidatePath(`/events/${eventId}/exhibits/groups/${id}`);
  redirect(`/events/${eventId}/exhibits/groups/${id}?success=Group updated`);
}

export async function deleteBoothGroup(id: string, eventId: string) {
  const session = await requirePermission("FUNCTIONS", "DELETE", eventId);
  await deleteBoothGroupCore(id, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/exhibits`);
  redirect(`/events/${eventId}/exhibits?success=Group deleted`);
}

export async function createExhibitBooth(eventId: string, formData: FormData) {
  const session = await requirePermission("FUNCTIONS", "WRITE", eventId);
  const booth = await createExhibitBoothCore(eventId, readBooth(formData, await eventTimezone(eventId)), session.user.id);
  revalidatePath(`/events/${eventId}/exhibits`);
  redirect(`/events/${eventId}/exhibits/${booth.id}?success=Booth created`);
}

export async function updateExhibitBooth(id: string, eventId: string, formData: FormData) {
  const session = await requirePermission("FUNCTIONS", "WRITE", eventId);
  await updateExhibitBoothCore(id, eventId, readBooth(formData, await eventTimezone(eventId)), session.user.id);
  revalidatePath(`/events/${eventId}/exhibits`);
  revalidatePath(`/events/${eventId}/exhibits/${id}`);
  redirect(`/events/${eventId}/exhibits/${id}?success=Booth updated`);
}

export async function deleteExhibitBooth(id: string, eventId: string) {
  const session = await requirePermission("FUNCTIONS", "DELETE", eventId);
  await deleteExhibitBoothCore(id, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/exhibits`);
  redirect(`/events/${eventId}/exhibits?success=Booth deleted`);
}

function readEquipment(formData: FormData): BoothEquipmentItemWriteArgs {
  return {
    equipmentId: formId(formData, "equipmentId"),
    item: formValue(formData, "item"),
    quantity: formInt(formData, "quantity", { min: 0 }),
    providerVendorId: formId(formData, "providerVendorId"),
    providerContactId: formId(formData, "providerContactId"),
    operatorVendorId: formId(formData, "operatorVendorId"),
    operatorContactId: formId(formData, "operatorContactId"),
    notes: formNote(formData, "notes"),
  };
}

export async function createBoothEquipmentItem(boothId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("FUNCTIONS", "WRITE", eventId);
  return withUserErrors(async () => {
    await createBoothEquipmentItemCore({ boothId }, eventId, readEquipment(formData), session.user.id);
    revalidatePath(`/events/${eventId}/exhibits/${boothId}`);
  });
}

export async function updateBoothEquipmentItem(id: string, boothId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("FUNCTIONS", "WRITE", eventId);
  return withUserErrors(async () => {
    await updateBoothEquipmentItemCore(id, eventId, readEquipment(formData), session.user.id);
    revalidatePath(`/events/${eventId}/exhibits/${boothId}`);
  });
}

export async function deleteBoothEquipmentItem(id: string, boothId: string, eventId: string) {
  const session = await requirePermission("FUNCTIONS", "WRITE", eventId);
  await deleteBoothEquipmentItemCore(id, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/exhibits/${boothId}`);
}

// Dropdown sources for BoothForm: the event's functions (exhibit-type first),
// booth groups, the tenant's contacts and the booth_type and cost_center options.
export async function getBoothFormChoices(eventId: string) {
  const session = await requirePermission("FUNCTIONS", "VIEW", eventId);
  const [functions, groups, contacts, boothTypes, costCenters] = await Promise.all([
    prisma.function.findMany({
      where: { eventId, type: { not: "BREAKOUT_BLOCK" } },
      select: { id: true, name: true, type: true, functionNumber: true, breakoutGroup: { select: { name: true } } },
    }),
    prisma.exhibitBoothGroup.findMany({ where: { eventId }, orderBy: { sortOrder: "asc" } }),
    prisma.contact.findMany({
      where: { tenantId: session.tenantId },
      select: { id: true, firstName: true, lastName: true, organization: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.customOption.findMany({
      where: { tenantId: session.tenantId, category: "booth_type" },
      select: { label: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.customOption.findMany({
      where: { tenantId: session.tenantId, category: "cost_center" },
      select: { label: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  const isExhibit = (t: string) => /exhibit/i.test(t);
  return {
    functions: functions
      .sort(
        (a, b) =>
          Number(isExhibit(b.type)) - Number(isExhibit(a.type)) ||
          compareFunctionNumbers(a.functionNumber, b.functionNumber) ||
          a.name.localeCompare(b.name),
      )
      .map((f) => ({ id: f.id, label: formatFunctionLabel(f) })),
    groups,
    contacts: contacts.map((c) => ({
      id: c.id,
      label: [`${c.firstName} ${c.lastName}`.trim(), c.organization].filter(Boolean).join(" — "),
    })),
    boothTypes: boothTypes.map((o) => o.label),
    costCenters: costCenters.map((o) => o.label),
  };
}

export async function createBoothGroupEquipmentItem(groupId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("FUNCTIONS", "WRITE", eventId);
  return withUserErrors(async () => {
    await createBoothEquipmentItemCore({ groupId }, eventId, readEquipment(formData), session.user.id);
    revalidatePath(`/events/${eventId}/exhibits/groups/${groupId}`);
  });
}

export async function updateBoothGroupEquipmentItem(id: string, groupId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("FUNCTIONS", "WRITE", eventId);
  return withUserErrors(async () => {
    await updateBoothEquipmentItemCore(id, eventId, readEquipment(formData), session.user.id);
    revalidatePath(`/events/${eventId}/exhibits/groups/${groupId}`);
  });
}

export async function deleteBoothGroupEquipmentItem(id: string, groupId: string, eventId: string) {
  const session = await requirePermission("FUNCTIONS", "WRITE", eventId);
  await deleteBoothEquipmentItemCore(id, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/exhibits/groups/${groupId}`);
}
