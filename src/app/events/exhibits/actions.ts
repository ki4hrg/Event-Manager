"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ProvidedBy } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { parseDateTimeInTimezone } from "@/lib/timezones";
import { compareFunctionNumbers, formatFunctionLabel } from "@/lib/functionNumbers";
import {
  createBoothEquipmentItemCore,
  createExhibitBoothCore,
  deleteBoothEquipmentItemCore,
  deleteExhibitBoothCore,
  updateBoothEquipmentItemCore,
  updateExhibitBoothCore,
  type BoothEquipmentItemWriteArgs,
  type BoothWriteArgs,
} from "./core";

const boothInclude = {
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
      equipmentItems: {
        include: { providerVendor: true, providerContact: true, operatorVendor: true, operatorContact: true, equipment: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
}

async function eventTimezone(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { timezone: true } });
  return event?.timezone || "America/Chicago";
}

function readBooth(formData: FormData, timezone: string): BoothWriteArgs {
  const str = (k: string) => (formData.get(k) as string) || null;
  const dt = (k: string) => (formData.get(k) ? parseDateTimeInTimezone(formData.get(k) as string, timezone) : null);
  const bool = (k: string) => (formData.get(k) === "true" ? true : formData.get(k) === "false" ? false : null);
  const provided = (k: string) => (str(k) as ProvidedBy | null);
  return {
    name: formData.get("name") as string,
    functionId: str("functionId"),
    boothNumber: str("boothNumber"),
    location: str("location"),
    boothType: str("boothType"),
    companyName: str("companyName"),
    contactId: str("contactId"),
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
    equipmentId: (formData.get("equipmentId") as string) || null,
    item: (formData.get("item") as string) || "",
    quantity: formData.get("quantity") ? parseInt(formData.get("quantity") as string) : null,
    providerVendorId: (formData.get("providerVendorId") as string) || null,
    providerContactId: (formData.get("providerContactId") as string) || null,
    operatorVendorId: (formData.get("operatorVendorId") as string) || null,
    operatorContactId: (formData.get("operatorContactId") as string) || null,
    notes: (formData.get("notes") as string) || null,
  };
}

export async function createBoothEquipmentItem(boothId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("FUNCTIONS", "WRITE", eventId);
  await createBoothEquipmentItemCore(boothId, eventId, readEquipment(formData), session.user.id);
  revalidatePath(`/events/${eventId}/exhibits/${boothId}`);
}

export async function updateBoothEquipmentItem(id: string, boothId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("FUNCTIONS", "WRITE", eventId);
  await updateBoothEquipmentItemCore(id, eventId, readEquipment(formData), session.user.id);
  revalidatePath(`/events/${eventId}/exhibits/${boothId}`);
}

export async function deleteBoothEquipmentItem(id: string, boothId: string, eventId: string) {
  const session = await requirePermission("FUNCTIONS", "WRITE", eventId);
  await deleteBoothEquipmentItemCore(id, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/exhibits/${boothId}`);
}

// Dropdown sources for BoothForm: the event's functions (exhibit-type first),
// the tenant's contacts and the booth_type options.
export async function getBoothFormChoices(eventId: string) {
  const session = await requirePermission("FUNCTIONS", "VIEW", eventId);
  const [functions, contacts, boothTypes] = await Promise.all([
    prisma.function.findMany({
      where: { eventId, type: { not: "BREAKOUT_BLOCK" } },
      select: { id: true, name: true, type: true, functionNumber: true, breakoutGroup: { select: { name: true } } },
    }),
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
    contacts: contacts.map((c) => ({
      id: c.id,
      label: [`${c.firstName} ${c.lastName}`.trim(), c.organization].filter(Boolean).join(" — "),
    })),
    boothTypes: boothTypes.map((o) => o.label),
  };
}
