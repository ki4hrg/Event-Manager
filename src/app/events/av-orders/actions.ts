"use server";

import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ResponsiblePartyOptions } from "@/app/vendors/actions";
import { getResponsibleParties } from "@/lib/responsibleParties";
import {
  createAVOrderCore,
  updateAVOrderCore,
  deleteAVOrderCore,
  deleteAVOrdersCore,
  bulkUpdateAVOrdersCore,
  linkAVOrderToFunctionCore,
  unlinkAVOrderFromFunctionCore,
  linkAVOrderToPresentationCore,
  unlinkAVOrderFromPresentationCore,
  updateAudioSectionCore,
  createInputGroupCore,
  updateInputGroupCore,
  deleteInputGroupCore,
  createInputItemCore,
  updateInputItemCore,
  deleteInputItemCore,
  createMonitorMixCore,
  updateMonitorMixCore,
  deleteMonitorMixCore,
  createMonitorOutputCore,
  updateMonitorOutputCore,
  deleteMonitorOutputCore,
  updateVideoSectionCore,
  createVideoEquipmentItemCore,
  updateVideoEquipmentItemCore,
  deleteVideoEquipmentItemCore,
  createAVEquipmentItemCore,
  updateAVEquipmentItemCore,
  deleteAVEquipmentItemCore,
  type InputItemWriteArgs,
  type MonitorMixWriteArgs,
  type MonitorOutputWriteArgs,
  type AVEquipmentItemWriteArgs,
  type BulkAVOrderUpdates,
} from "./core";
import { formId, formInt, formNote, formValue } from "@/lib/validation";

export async function getAVOrders(eventId: string) {
  await requirePermission("AV_ORDERS", "VIEW", eventId);
  const rows = await prisma.aVOrder.findMany({
    where: { eventId },
    include: {
      functionLinks: { include: { function: { include: { breakoutGroup: { select: { name: true } } } } } },
      presentationLinks: { include: { presentation: { select: { id: true, title: true } } } },
      vendors: { include: { vendor: { select: { id: true, name: true } } } },
    },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({
    ...r,
    functions: r.functionLinks.map((l) => l.function),
    presentations: r.presentationLinks.map((l) => l.presentation),
  }));
}

export async function getAVOrder(id: string) {
  const row = await prisma.aVOrder.findUnique({
    where: { id },
    include: {
      functionLinks: { include: { function: { include: { schedules: { orderBy: { startTime: "asc" } }, breakoutGroup: { select: { name: true } } } } } },
      presentationLinks: { include: { presentation: true } },
      audioSection: {
        include: {
          inputGroups: {
            include: {
              providerVendor: true,
              providerContact: true,
              operatorVendor: true,
              operatorContact: true,
              inputItems: {
                include: {
                  equipment: true,
                  providerVendor: true,
                  providerContact: true,
                  operatorVendor: true,
                  operatorContact: true,
                },
                orderBy: { sortOrder: "asc" },
              },
            },
            orderBy: { sortOrder: "asc" },
          },
          monitorMixes: {
            include: {
              equipment: true,
              providerVendor: true,
              providerContact: true,
              operatorVendor: true,
              operatorContact: true,
              monitorOutputs: {
                include: {
                  equipment: true,
                  providerVendor: true,
                  providerContact: true,
                  operatorVendor: true,
                  operatorContact: true,
                },
                orderBy: { sortOrder: "asc" },
              },
            },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
      videoSection: {
        include: {
          equipmentItems: {
            include: {
              equipment: true,
              providerVendor: true,
              providerContact: true,
              operatorVendor: true,
              operatorContact: true,
            },
            orderBy: [{ sortOrder: "asc" }, { item: "asc" }],
          },
        },
      },
      equipmentItems: {
        include: { equipment: true, providerVendor: true, providerContact: true, operatorVendor: true, operatorContact: true },
        orderBy: [{ sortOrder: "asc" }, { item: "asc" }],
      },
      updatedBy: { select: { name: true, email: true } },
    },
  });
  if (!row) return null;
  await requirePermission("AV_ORDERS", "VIEW", row.eventId);
  return {
    ...row,
    functions: row.functionLinks.map((l) => l.function),
    presentations: row.presentationLinks.map((l) => l.presentation),
  };
}

export async function createAVOrder(eventId: string, formData: FormData) {
  const session = await requirePermission("AV_ORDERS", "WRITE", eventId);
  const avOrder = await createAVOrderCore(
    eventId,
    {
      name: formValue(formData, "name"),
      notes: formNote(formData, "notes"),
      functionId: formId(formData, "functionId"),
      presentationId: formId(formData, "presentationId"),
      vendorId: formId(formData, "vendorId"),
    },
    session.user.id,
  );
  revalidatePath(`/events/${eventId}/av-orders`);
  redirect(`/events/${eventId}/av-orders/${avOrder.id}`);
}

export async function updateAVOrder(id: string, eventId: string, formData: FormData) {
  const session = await requirePermission("AV_ORDERS", "WRITE", eventId);
  await updateAVOrderCore(
    id,
    eventId,
    {
      name: formValue(formData, "name"),
      notes: formNote(formData, "notes"),
    },
    session.user.id,
  );
  revalidatePath(`/events/${eventId}/av-orders`);
  revalidatePath(`/events/${eventId}/av-orders/${id}`);
  redirect(`/events/${eventId}/av-orders/${id}?success=AV Order updated`);
}

export async function deleteAVOrder(id: string, eventId: string) {
  const session = await requirePermission("AV_ORDERS", "DELETE", eventId);
  await deleteAVOrderCore(id, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/av-orders`);
  redirect(`/events/${eventId}/av-orders`);
}

// ============================================================================
// Function / Presentation linking (M:N via AVOrderFunction / AVOrderPresentation)
// ============================================================================

export async function linkAVOrderToFunction(avOrderId: string, functionId: string, eventId: string) {
  const session = await requirePermission("AV_ORDERS", "WRITE", eventId);
  await linkAVOrderToFunctionCore(avOrderId, functionId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function unlinkAVOrderFromFunction(avOrderId: string, functionId: string, eventId: string) {
  const session = await requirePermission("AV_ORDERS", "WRITE", eventId);
  await unlinkAVOrderFromFunctionCore(avOrderId, functionId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function linkAVOrderToPresentation(
  avOrderId: string,
  presentationId: string,
  eventId: string
) {
  const session = await requirePermission("AV_ORDERS", "WRITE", eventId);
  await linkAVOrderToPresentationCore(avOrderId, presentationId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

export async function unlinkAVOrderFromPresentation(avOrderId: string, presentationId: string, eventId: string) {
  const session = await requirePermission("AV_ORDERS", "WRITE", eventId);
  await unlinkAVOrderFromPresentationCore(avOrderId, presentationId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
  revalidatePath(`/events/${eventId}/presentations/${presentationId}`);
}

// AVOrders not yet linked to this function (for the function detail panel)
export async function getAvailableAVOrdersForFunction(eventId: string, functionId?: string) {
  await requirePermission("AV_ORDERS", "VIEW", eventId);
  return prisma.aVOrder.findMany({
    where: {
      eventId,
      ...(functionId ? { NOT: { functionLinks: { some: { functionId } } } } : {}),
    },
    orderBy: { name: "asc" },
  });
}

// AVOrders not yet linked to this presentation (for the presentation detail panel)
export async function getAvailableAVOrdersForPresentation(eventId: string, presentationId?: string) {
  await requirePermission("AV_ORDERS", "VIEW", eventId);
  return prisma.aVOrder.findMany({
    where: {
      eventId,
      ...(presentationId ? { NOT: { presentationLinks: { some: { presentationId } } } } : {}),
    },
    orderBy: { name: "asc" },
  });
}

// Aliases for callers from Function / Presentation detail pages
export async function linkAVOrderToFunctionFromFunction(
  avOrderId: string,
  functionId: string,
  eventId: string
) {
  await requirePermission("AV_ORDERS", "WRITE", eventId);
  return linkAVOrderToFunction(avOrderId, functionId, eventId);
}

export async function unlinkAVOrderFromFunctionPage(avOrderId: string, functionId: string, eventId: string) {
  await requirePermission("AV_ORDERS", "WRITE", eventId);
  return unlinkAVOrderFromFunction(avOrderId, functionId, eventId);
}

export async function linkAVOrderToPresentationFromPresentation(
  avOrderId: string,
  presentationId: string,
  eventId: string
) {
  await requirePermission("AV_ORDERS", "WRITE", eventId);
  return linkAVOrderToPresentation(avOrderId, presentationId, eventId);
}

export async function unlinkAVOrderFromPresentationPage(avOrderId: string, presentationId: string, eventId: string) {
  await requirePermission("AV_ORDERS", "WRITE", eventId);
  return unlinkAVOrderFromPresentation(avOrderId, presentationId, eventId);
}

// ============================================================================
// AudioSection
// ============================================================================

export async function updateAudioSection(id: string, avOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("AV_ORDERS", "WRITE", eventId);
  await updateAudioSectionCore(id, avOrderId, eventId, formNote(formData, "notes"), session.user.id);
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

// ============================================================================
// InputGroup CRUD
// ============================================================================

export async function createInputGroup(audioSectionId: string, avOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("AV_ORDERS", "WRITE", eventId);
  await createInputGroupCore(
    audioSectionId,
    avOrderId,
    eventId,
    {
      name: (formValue(formData, "name")) || "Default",
      notes: formNote(formData, "notes"),
    },
    session.user.id,
  );
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function updateInputGroup(id: string, avOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("AV_ORDERS", "WRITE", eventId);
  await updateInputGroupCore(
    id,
    avOrderId,
    eventId,
    {
      name: formValue(formData, "name"),
      providerVendorId: formId(formData, "providerVendorId"),
      providerContactId: formId(formData, "providerContactId"),
      operatorVendorId: formId(formData, "operatorVendorId"),
      operatorContactId: formId(formData, "operatorContactId"),
      notes: formNote(formData, "notes"),
    },
    session.user.id,
  );
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function deleteInputGroup(id: string, avOrderId: string, eventId: string) {
  const session = await requirePermission("AV_ORDERS", "WRITE", eventId);
  await deleteInputGroupCore(id, avOrderId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

// ============================================================================
// InputItem CRUD
// ============================================================================

function parseInputItemData(formData: FormData): InputItemWriteArgs {
  return {
    description: formValue(formData, "description"),
    quantity: formInt(formData, "quantity") ?? 1,
    equipmentId: formId(formData, "equipmentId"),
    providerVendorId: formId(formData, "providerVendorId"),
    providerContactId: formId(formData, "providerContactId"),
    operatorVendorId: formId(formData, "operatorVendorId"),
    operatorContactId: formId(formData, "operatorContactId"),
    notes: formNote(formData, "notes"),
  };
}

export async function createInputItem(inputGroupId: string, avOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("AV_ORDERS", "WRITE", eventId);
  await createInputItemCore(inputGroupId, avOrderId, eventId, parseInputItemData(formData), session.user.id);
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function updateInputItem(id: string, avOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("AV_ORDERS", "WRITE", eventId);
  await updateInputItemCore(id, avOrderId, eventId, parseInputItemData(formData), session.user.id);
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function deleteInputItem(id: string, avOrderId: string, eventId: string) {
  const session = await requirePermission("AV_ORDERS", "WRITE", eventId);
  await deleteInputItemCore(id, avOrderId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

// ============================================================================
// MonitorMix CRUD
// ============================================================================

function parseMonitorMixData(formData: FormData): MonitorMixWriteArgs {
  return {
    description: formValue(formData, "description"),
    equipmentId: formId(formData, "equipmentId"),
    providerVendorId: formId(formData, "providerVendorId"),
    providerContactId: formId(formData, "providerContactId"),
    operatorVendorId: formId(formData, "operatorVendorId"),
    operatorContactId: formId(formData, "operatorContactId"),
    notes: formNote(formData, "notes"),
  };
}

export async function createMonitorMix(audioSectionId: string, avOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("AV_ORDERS", "WRITE", eventId);
  await createMonitorMixCore(audioSectionId, avOrderId, eventId, parseMonitorMixData(formData), session.user.id);
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function updateMonitorMix(id: string, avOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("AV_ORDERS", "WRITE", eventId);
  await updateMonitorMixCore(id, avOrderId, eventId, parseMonitorMixData(formData), session.user.id);
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function deleteMonitorMix(id: string, avOrderId: string, eventId: string) {
  const session = await requirePermission("AV_ORDERS", "WRITE", eventId);
  await deleteMonitorMixCore(id, avOrderId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

function parseMonitorOutputData(formData: FormData): MonitorOutputWriteArgs {
  return {
    equipmentId: formId(formData, "equipmentId"),
    quantity: formInt(formData, "quantity") ?? 1,
    providerVendorId: formId(formData, "providerVendorId"),
    providerContactId: formId(formData, "providerContactId"),
    operatorVendorId: formId(formData, "operatorVendorId"),
    operatorContactId: formId(formData, "operatorContactId"),
    notes: formNote(formData, "notes"),
  };
}

export async function createMonitorOutput(monitorMixId: string, avOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("AV_ORDERS", "WRITE", eventId);
  await createMonitorOutputCore(monitorMixId, avOrderId, eventId, parseMonitorOutputData(formData), session.user.id);
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function updateMonitorOutput(id: string, avOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("AV_ORDERS", "WRITE", eventId);
  await updateMonitorOutputCore(id, avOrderId, eventId, parseMonitorOutputData(formData), session.user.id);
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function deleteMonitorOutput(id: string, avOrderId: string, eventId: string) {
  const session = await requirePermission("AV_ORDERS", "WRITE", eventId);
  await deleteMonitorOutputCore(id, avOrderId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

// ============================================================================
// VideoSection
// ============================================================================

export async function updateVideoSection(id: string, avOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("AV_ORDERS", "WRITE", eventId);
  await updateVideoSectionCore(id, avOrderId, eventId, formNote(formData, "notes"), session.user.id);
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

function parseAVEquipmentItemData(formData: FormData): AVEquipmentItemWriteArgs {
  return {
    equipmentId: formId(formData, "equipmentId"),
    item: (formValue(formData, "item")) || "",
    quantity: formInt(formData, "quantity"),
    providerVendorId: formId(formData, "providerVendorId"),
    providerContactId: formId(formData, "providerContactId"),
    operatorVendorId: formId(formData, "operatorVendorId"),
    operatorContactId: formId(formData, "operatorContactId"),
    notes: formNote(formData, "notes"),
  };
}

export async function createVideoEquipmentItem(videoSectionId: string, avOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("AV_ORDERS", "WRITE", eventId);
  await createVideoEquipmentItemCore(videoSectionId, avOrderId, eventId, parseAVEquipmentItemData(formData), session.user.id);
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function updateVideoEquipmentItem(id: string, avOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("AV_ORDERS", "WRITE", eventId);
  await updateVideoEquipmentItemCore(id, avOrderId, eventId, parseAVEquipmentItemData(formData), session.user.id);
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function deleteVideoEquipmentItem(id: string, avOrderId: string, eventId: string) {
  const session = await requirePermission("AV_ORDERS", "WRITE", eventId);
  await deleteVideoEquipmentItemCore(id, avOrderId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

// ============================================================================
// AV Order-level EquipmentItem CRUD
// ============================================================================

export async function createAVEquipmentItem(avOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("AV_ORDERS", "WRITE", eventId);
  await createAVEquipmentItemCore(avOrderId, eventId, parseAVEquipmentItemData(formData), session.user.id);
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function updateAVEquipmentItem(id: string, avOrderId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("AV_ORDERS", "WRITE", eventId);
  await updateAVEquipmentItemCore(id, avOrderId, eventId, parseAVEquipmentItemData(formData), session.user.id);
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

export async function deleteAVEquipmentItem(id: string, avOrderId: string, eventId: string) {
  const session = await requirePermission("AV_ORDERS", "WRITE", eventId);
  await deleteAVEquipmentItemCore(id, avOrderId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/av-orders/${avOrderId}`);
}

// ============================================================================
// Party options
// ============================================================================

async function getSpeakersForAVOrder(avOrderId: string, eventId: string) {
  const presentations = await prisma.aVOrderPresentation.findMany({
    where: { avOrderId, avOrder: { eventId } },
    select: {
      presentation: {
        select: {
          speakers: {
            include: { contact: true },
            orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
          },
        },
      },
    },
  });
  const seen = new Set<string>();
  const contacts: { id: string; firstName: string; lastName: string; organization: string | null }[] = [];
  for (const p of presentations) {
    for (const s of p.presentation.speakers) {
      if (seen.has(s.contact.id)) continue;
      seen.add(s.contact.id);
      contacts.push({
        id: s.contact.id,
        firstName: s.contact.firstName,
        lastName: s.contact.lastName,
        organization: s.contact.organization,
      });
    }
  }
  return contacts;
}

export async function getAVOrderPartyOptions(avOrderId: string, eventId: string) {
  await requirePermission("AV_ORDERS", "VIEW", eventId);
  const [avOrderVendors, contacts] = await Promise.all([
    prisma.aVOrderVendor.findMany({
      where: { avOrderId, avOrder: { eventId } },
      select: { vendor: { select: { id: true, name: true } } },
      orderBy: { vendor: { name: "asc" } },
    }),
    getSpeakersForAVOrder(avOrderId, eventId),
  ]);
  return { vendors: avOrderVendors.map((av) => av.vendor), contacts };
}

export async function getAVOrderResponsiblePartyOptions(
  avOrderId: string,
  eventId: string
): Promise<{
  responsiblePartyVendors: ResponsiblePartyOptions;
  contacts: { id: string; firstName: string; lastName: string; organization: string | null }[];
}> {
  await requirePermission("AV_ORDERS", "VIEW", eventId);
  const [functionLinks, presentationLinks] = await Promise.all([
    prisma.aVOrderFunction.findMany({ where: { avOrderId, avOrder: { eventId } }, select: { functionId: true } }),
    prisma.aVOrderPresentation.findMany({ where: { avOrderId, avOrder: { eventId } }, select: { presentationId: true } }),
  ]);
  const pool = await getResponsibleParties({
    eventId,
    modelType: "AV_ORDER",
    functionIds: functionLinks.map((l) => l.functionId),
    presentationIds: presentationLinks.map((l) => l.presentationId),
  });
  return { responsiblePartyVendors: pool.vendorGroups, contacts: pool.contacts };
}

export async function deleteAVOrders(ids: string[], eventId: string) {
  const session = await requirePermission("AV_ORDERS", "DELETE", eventId);
  await deleteAVOrdersCore(ids, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/av-orders`);
}

export async function bulkUpdateAVOrders(
  ids: string[],
  eventId: string,
  updates: BulkAVOrderUpdates,
) {
  const session = await requirePermission("AV_ORDERS", "WRITE", eventId);
  await bulkUpdateAVOrdersCore(ids, eventId, updates, session.user.id);
  revalidatePath(`/events/${eventId}/av-orders`);
}
