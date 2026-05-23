// Pure cores for av-order + all its nested sub-resources (audio section, input
// groups + items, monitor mixes + outputs, video section + equipment items,
// AV-order-level equipment items, and link junctions).
// NOT a "use server" file — see src/app/contacts/core.ts for the security rationale.

import type { EntityStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermissionForUser, PermissionError } from "@/lib/permissions";
import { resolveEquipmentName } from "@/lib/equipment-utils";
import { resolveCreateStatus } from "@/lib/statusDefaults";
import { autoAssignDefaultWorkflowsCore } from "@/app/events/workflows/core";

async function assertAVOrderInEvent(avOrderId: string, eventId: string) {
  const found = await prisma.aVOrder.findUnique({
    where: { id: avOrderId, eventId },
    select: { id: true },
  });
  if (!found) throw new PermissionError("NOT_FOUND");
}

async function bumpAVOrder(avOrderId: string, userId: string) {
  await prisma.aVOrder.update({ where: { id: avOrderId }, data: { updatedById: userId } });
}

// ---------------------------------------------------------------------------
// AVOrder

export type CreateAVOrderArgs = {
  name: string;
  notes: string | null;
  // Optional initial M:M links + vendor pin (falls back to event default).
  functionId: string | null;
  presentationId: string | null;
  vendorId: string | null;
};

export async function createAVOrderCore(
  eventId: string,
  args: CreateAVOrderArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "AV_ORDERS", "WRITE", eventId);
  const defaults = await resolveCreateStatus(eventId, "AV_ORDER");

  const avOrder = await prisma.aVOrder.create({
    data: {
      name: args.name,
      eventId,
      notes: args.notes,
      status: defaults.status,
      substatus: defaults.substatus,
      updatedById: userId,
    },
  });

  // Auto-create AudioSection (with a default InputGroup) and VideoSection so
  // the UI's "tabs" exist immediately.
  const audioSection = await prisma.audioSection.create({
    data: { avOrderId: avOrder.id },
  });
  await Promise.all([
    prisma.inputGroup.create({ data: { audioSectionId: audioSection.id, name: "Default" } }),
    prisma.videoSection.create({ data: { avOrderId: avOrder.id } }),
  ]);

  if (args.functionId) {
    await prisma.aVOrderFunction.create({
      data: { avOrderId: avOrder.id, functionId: args.functionId },
    });
  }
  if (args.presentationId) {
    await prisma.aVOrderPresentation.create({
      data: { avOrderId: avOrder.id, presentationId: args.presentationId },
    });
  }

  const fallback = !args.vendorId
    ? await prisma.eventVendor.findFirst({
        where: { eventId, defaultFor: { has: "AV_ORDER" } },
        select: { vendorId: true },
      })
    : null;
  const vendorIdToAssign = args.vendorId ?? fallback?.vendorId ?? null;
  if (vendorIdToAssign) {
    await prisma.aVOrderVendor.create({
      data: { avOrderId: avOrder.id, vendorId: vendorIdToAssign },
    });
  }

  await autoAssignDefaultWorkflowsCore("av_order", avOrder.id);
  return avOrder;
}

export type UpdateAVOrderArgs = { name: string; notes: string | null };

export async function updateAVOrderCore(
  id: string,
  eventId: string,
  args: UpdateAVOrderArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "AV_ORDERS", "WRITE", eventId);
  return prisma.aVOrder.update({
    where: { id, eventId },
    data: { name: args.name, notes: args.notes, updatedById: userId },
  });
}

export async function deleteAVOrderCore(id: string, eventId: string, userId: string) {
  await requirePermissionForUser(userId, "AV_ORDERS", "DELETE", eventId);
  await prisma.aVOrder.delete({ where: { id, eventId } });
}

export async function deleteAVOrdersCore(ids: string[], eventId: string, userId: string) {
  await requirePermissionForUser(userId, "AV_ORDERS", "DELETE", eventId);
  const r = await prisma.aVOrder.deleteMany({ where: { id: { in: ids }, eventId } });
  return { count: r.count };
}

export type BulkAVOrderUpdates = {
  status?: EntityStatus;
  substatus?: string | null;
  vendorId?: string;
};

export async function bulkUpdateAVOrdersCore(
  ids: string[],
  eventId: string,
  updates: BulkAVOrderUpdates,
  userId: string,
) {
  await requirePermissionForUser(userId, "AV_ORDERS", "WRITE", eventId);
  const { status, substatus, vendorId } = updates;
  if (status !== undefined || substatus !== undefined) {
    await prisma.aVOrder.updateMany({
      where: { id: { in: ids }, eventId },
      data: {
        ...(status !== undefined ? { status } : {}),
        ...(substatus !== undefined ? { substatus } : {}),
        updatedById: userId,
      },
    });
  }
  if (vendorId) {
    await prisma.aVOrderVendor.deleteMany({
      where: { avOrderId: { in: ids }, avOrder: { eventId } },
    });
    await prisma.aVOrderVendor.createMany({
      data: ids.map((id) => ({ avOrderId: id, vendorId })),
    });
    await prisma.aVOrder.updateMany({
      where: { id: { in: ids }, eventId },
      data: { updatedById: userId },
    });
  }
}

// ---------------------------------------------------------------------------
// Links

export async function linkAVOrderToFunctionCore(
  avOrderId: string,
  functionId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "AV_ORDERS", "WRITE", eventId);
  await assertAVOrderInEvent(avOrderId, eventId);
  const link = await prisma.aVOrderFunction.upsert({
    where: { avOrderId_functionId: { avOrderId, functionId } },
    create: { avOrderId, functionId },
    update: {},
  });
  await bumpAVOrder(avOrderId, userId);
  return link;
}

export async function unlinkAVOrderFromFunctionCore(
  avOrderId: string,
  functionId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "AV_ORDERS", "WRITE", eventId);
  await assertAVOrderInEvent(avOrderId, eventId);
  const r = await prisma.aVOrderFunction.deleteMany({
    where: { avOrderId, functionId, avOrder: { eventId } },
  });
  await bumpAVOrder(avOrderId, userId);
  return { count: r.count };
}

export async function linkAVOrderToPresentationCore(
  avOrderId: string,
  presentationId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "AV_ORDERS", "WRITE", eventId);
  await assertAVOrderInEvent(avOrderId, eventId);
  const link = await prisma.aVOrderPresentation.upsert({
    where: { avOrderId_presentationId: { avOrderId, presentationId } },
    create: { avOrderId, presentationId },
    update: {},
  });
  await bumpAVOrder(avOrderId, userId);
  return link;
}

export async function unlinkAVOrderFromPresentationCore(
  avOrderId: string,
  presentationId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "AV_ORDERS", "WRITE", eventId);
  await assertAVOrderInEvent(avOrderId, eventId);
  const r = await prisma.aVOrderPresentation.deleteMany({
    where: { avOrderId, presentationId, avOrder: { eventId } },
  });
  await bumpAVOrder(avOrderId, userId);
  return { count: r.count };
}

// ---------------------------------------------------------------------------
// AudioSection

export async function updateAudioSectionCore(
  id: string,
  avOrderId: string,
  eventId: string,
  notes: string | null,
  userId: string,
) {
  await requirePermissionForUser(userId, "AV_ORDERS", "WRITE", eventId);
  const row = await prisma.audioSection.update({
    where: { id, avOrder: { eventId } },
    data: { notes },
  });
  await bumpAVOrder(avOrderId, userId);
  return row;
}

// ---------------------------------------------------------------------------
// InputGroup

export type InputGroupCreateArgs = {
  name: string;
  notes: string | null;
};

export async function createInputGroupCore(
  audioSectionId: string,
  avOrderId: string,
  eventId: string,
  args: InputGroupCreateArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "AV_ORDERS", "WRITE", eventId);
  const parent = await prisma.audioSection.findUnique({
    where: { id: audioSectionId, avOrder: { eventId } },
    select: { id: true },
  });
  if (!parent) throw new PermissionError("NOT_FOUND");
  const { _max } = await prisma.inputGroup.aggregate({
    where: { audioSectionId },
    _max: { sortOrder: true },
  });
  const row = await prisma.inputGroup.create({
    data: {
      audioSectionId,
      name: args.name || "Default",
      notes: args.notes,
      sortOrder: (_max.sortOrder ?? -1) + 1,
    },
  });
  await bumpAVOrder(avOrderId, userId);
  return row;
}

export type InputGroupUpdateArgs = {
  name: string;
  providerVendorId: string | null;
  providerContactId: string | null;
  operatorVendorId: string | null;
  operatorContactId: string | null;
  notes: string | null;
};

export async function updateInputGroupCore(
  id: string,
  avOrderId: string,
  eventId: string,
  args: InputGroupUpdateArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "AV_ORDERS", "WRITE", eventId);
  const row = await prisma.inputGroup.update({
    where: { id, audioSection: { avOrder: { eventId } } },
    data: args,
  });
  await bumpAVOrder(avOrderId, userId);
  return row;
}

export async function deleteInputGroupCore(
  id: string,
  avOrderId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "AV_ORDERS", "WRITE", eventId);
  await prisma.inputGroup.delete({
    where: { id, audioSection: { avOrder: { eventId } } },
  });
  await bumpAVOrder(avOrderId, userId);
}

// ---------------------------------------------------------------------------
// InputItem

export type InputItemWriteArgs = {
  description: string;
  quantity: number;
  equipmentId: string | null;
  providerVendorId: string | null;
  providerContactId: string | null;
  operatorVendorId: string | null;
  operatorContactId: string | null;
  notes: string | null;
};

export async function createInputItemCore(
  inputGroupId: string,
  avOrderId: string,
  eventId: string,
  args: InputItemWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "AV_ORDERS", "WRITE", eventId);
  const parent = await prisma.inputGroup.findUnique({
    where: { id: inputGroupId, audioSection: { avOrder: { eventId } } },
    select: { id: true },
  });
  if (!parent) throw new PermissionError("NOT_FOUND");
  const { _max } = await prisma.inputItem.aggregate({
    where: { inputGroupId },
    _max: { sortOrder: true },
  });
  const row = await prisma.inputItem.create({
    data: { inputGroupId, ...args, sortOrder: (_max.sortOrder ?? -1) + 1 },
  });
  await bumpAVOrder(avOrderId, userId);
  return row;
}

export async function updateInputItemCore(
  id: string,
  avOrderId: string,
  eventId: string,
  args: InputItemWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "AV_ORDERS", "WRITE", eventId);
  const row = await prisma.inputItem.update({
    where: { id, inputGroup: { audioSection: { avOrder: { eventId } } } },
    data: args,
  });
  await bumpAVOrder(avOrderId, userId);
  return row;
}

export async function deleteInputItemCore(
  id: string,
  avOrderId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "AV_ORDERS", "WRITE", eventId);
  await prisma.inputItem.delete({
    where: { id, inputGroup: { audioSection: { avOrder: { eventId } } } },
  });
  await bumpAVOrder(avOrderId, userId);
}

// ---------------------------------------------------------------------------
// MonitorMix

export type MonitorMixWriteArgs = {
  description: string;
  equipmentId: string | null;
  providerVendorId: string | null;
  providerContactId: string | null;
  operatorVendorId: string | null;
  operatorContactId: string | null;
  notes: string | null;
};

export async function createMonitorMixCore(
  audioSectionId: string,
  avOrderId: string,
  eventId: string,
  args: MonitorMixWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "AV_ORDERS", "WRITE", eventId);
  const parent = await prisma.audioSection.findUnique({
    where: { id: audioSectionId, avOrder: { eventId } },
    select: { id: true },
  });
  if (!parent) throw new PermissionError("NOT_FOUND");
  const { _max } = await prisma.monitorMix.aggregate({
    where: { audioSectionId },
    _max: { sortOrder: true },
  });
  const row = await prisma.monitorMix.create({
    data: { audioSectionId, ...args, sortOrder: (_max.sortOrder ?? -1) + 1 },
  });
  await bumpAVOrder(avOrderId, userId);
  return row;
}

export async function updateMonitorMixCore(
  id: string,
  avOrderId: string,
  eventId: string,
  args: MonitorMixWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "AV_ORDERS", "WRITE", eventId);
  const row = await prisma.monitorMix.update({
    where: { id, audioSection: { avOrder: { eventId } } },
    data: args,
  });
  await bumpAVOrder(avOrderId, userId);
  return row;
}

export async function deleteMonitorMixCore(
  id: string,
  avOrderId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "AV_ORDERS", "WRITE", eventId);
  await prisma.monitorMix.delete({
    where: { id, audioSection: { avOrder: { eventId } } },
  });
  await bumpAVOrder(avOrderId, userId);
}

// ---------------------------------------------------------------------------
// MonitorOutput

export type MonitorOutputWriteArgs = {
  equipmentId: string | null;
  quantity: number;
  providerVendorId: string | null;
  providerContactId: string | null;
  operatorVendorId: string | null;
  operatorContactId: string | null;
  notes: string | null;
};

export async function createMonitorOutputCore(
  monitorMixId: string,
  avOrderId: string,
  eventId: string,
  args: MonitorOutputWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "AV_ORDERS", "WRITE", eventId);
  const parent = await prisma.monitorMix.findUnique({
    where: { id: monitorMixId, audioSection: { avOrder: { eventId } } },
    select: { id: true },
  });
  if (!parent) throw new PermissionError("NOT_FOUND");
  const { _max } = await prisma.monitorOutput.aggregate({
    where: { monitorMixId },
    _max: { sortOrder: true },
  });
  const row = await prisma.monitorOutput.create({
    data: { monitorMixId, ...args, sortOrder: (_max.sortOrder ?? -1) + 1 },
  });
  await bumpAVOrder(avOrderId, userId);
  return row;
}

export async function updateMonitorOutputCore(
  id: string,
  avOrderId: string,
  eventId: string,
  args: MonitorOutputWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "AV_ORDERS", "WRITE", eventId);
  const row = await prisma.monitorOutput.update({
    where: { id, monitorMix: { audioSection: { avOrder: { eventId } } } },
    data: args,
  });
  await bumpAVOrder(avOrderId, userId);
  return row;
}

export async function deleteMonitorOutputCore(
  id: string,
  avOrderId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "AV_ORDERS", "WRITE", eventId);
  await prisma.monitorOutput.delete({
    where: { id, monitorMix: { audioSection: { avOrder: { eventId } } } },
  });
  await bumpAVOrder(avOrderId, userId);
}

// ---------------------------------------------------------------------------
// VideoSection

export async function updateVideoSectionCore(
  id: string,
  avOrderId: string,
  eventId: string,
  notes: string | null,
  userId: string,
) {
  await requirePermissionForUser(userId, "AV_ORDERS", "WRITE", eventId);
  const row = await prisma.videoSection.update({
    where: { id, avOrder: { eventId } },
    data: { notes },
  });
  await bumpAVOrder(avOrderId, userId);
  return row;
}

// ---------------------------------------------------------------------------
// EquipmentItem (3 scopes: avOrder-direct, audioSection's videoSection, videoSection)
// Each variant looks structurally identical; the where-clause join path is
// what differs.

export type AVEquipmentItemWriteArgs = {
  equipmentId: string | null;
  item: string;
  quantity: number | null;
  providerVendorId: string | null;
  providerContactId: string | null;
  operatorVendorId: string | null;
  operatorContactId: string | null;
  notes: string | null;
};

// --- VideoSection equipment items ---

export async function createVideoEquipmentItemCore(
  videoSectionId: string,
  avOrderId: string,
  eventId: string,
  rawArgs: AVEquipmentItemWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "AV_ORDERS", "WRITE", eventId);
  const parent = await prisma.videoSection.findUnique({
    where: { id: videoSectionId, avOrder: { eventId } },
    select: { id: true },
  });
  if (!parent) throw new PermissionError("NOT_FOUND");
  const item = await resolveEquipmentName(rawArgs.equipmentId, rawArgs.item);
  const { _max } = await prisma.equipmentItem.aggregate({
    where: { videoSectionId },
    _max: { sortOrder: true },
  });
  const row = await prisma.equipmentItem.create({
    data: {
      videoSectionId,
      equipmentId: rawArgs.equipmentId,
      item,
      quantity: rawArgs.quantity,
      providerVendorId: rawArgs.providerVendorId,
      providerContactId: rawArgs.providerContactId,
      operatorVendorId: rawArgs.operatorVendorId,
      operatorContactId: rawArgs.operatorContactId,
      notes: rawArgs.notes,
      sortOrder: (_max.sortOrder ?? -1) + 1,
    },
  });
  await bumpAVOrder(avOrderId, userId);
  return row;
}

export async function updateVideoEquipmentItemCore(
  id: string,
  avOrderId: string,
  eventId: string,
  rawArgs: AVEquipmentItemWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "AV_ORDERS", "WRITE", eventId);
  const item = await resolveEquipmentName(rawArgs.equipmentId, rawArgs.item);
  const row = await prisma.equipmentItem.update({
    where: { id, videoSection: { avOrder: { eventId } } },
    data: {
      equipmentId: rawArgs.equipmentId,
      item,
      quantity: rawArgs.quantity,
      providerVendorId: rawArgs.providerVendorId,
      providerContactId: rawArgs.providerContactId,
      operatorVendorId: rawArgs.operatorVendorId,
      operatorContactId: rawArgs.operatorContactId,
      notes: rawArgs.notes,
    },
  });
  await bumpAVOrder(avOrderId, userId);
  return row;
}

export async function deleteVideoEquipmentItemCore(
  id: string,
  avOrderId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "AV_ORDERS", "WRITE", eventId);
  await prisma.equipmentItem.delete({
    where: { id, videoSection: { avOrder: { eventId } } },
  });
  await bumpAVOrder(avOrderId, userId);
}

// --- AVOrder-direct equipment items ---

export async function createAVEquipmentItemCore(
  avOrderId: string,
  eventId: string,
  rawArgs: AVEquipmentItemWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "AV_ORDERS", "WRITE", eventId);
  await assertAVOrderInEvent(avOrderId, eventId);
  const item = await resolveEquipmentName(rawArgs.equipmentId, rawArgs.item);
  const { _max } = await prisma.equipmentItem.aggregate({
    where: { avOrderId },
    _max: { sortOrder: true },
  });
  const row = await prisma.equipmentItem.create({
    data: {
      avOrderId,
      equipmentId: rawArgs.equipmentId,
      item,
      quantity: rawArgs.quantity,
      providerVendorId: rawArgs.providerVendorId,
      providerContactId: rawArgs.providerContactId,
      operatorVendorId: rawArgs.operatorVendorId,
      operatorContactId: rawArgs.operatorContactId,
      notes: rawArgs.notes,
      sortOrder: (_max.sortOrder ?? -1) + 1,
    },
  });
  await bumpAVOrder(avOrderId, userId);
  return row;
}

export async function updateAVEquipmentItemCore(
  id: string,
  avOrderId: string,
  eventId: string,
  rawArgs: AVEquipmentItemWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "AV_ORDERS", "WRITE", eventId);
  const item = await resolveEquipmentName(rawArgs.equipmentId, rawArgs.item);
  const row = await prisma.equipmentItem.update({
    where: { id, avOrder: { eventId } },
    data: {
      equipmentId: rawArgs.equipmentId,
      item,
      quantity: rawArgs.quantity,
      providerVendorId: rawArgs.providerVendorId,
      providerContactId: rawArgs.providerContactId,
      operatorVendorId: rawArgs.operatorVendorId,
      operatorContactId: rawArgs.operatorContactId,
      notes: rawArgs.notes,
    },
  });
  await bumpAVOrder(avOrderId, userId);
  return row;
}

export async function deleteAVEquipmentItemCore(
  id: string,
  avOrderId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "AV_ORDERS", "WRITE", eventId);
  await prisma.equipmentItem.delete({ where: { id, avOrder: { eventId } } });
  await bumpAVOrder(avOrderId, userId);
}
