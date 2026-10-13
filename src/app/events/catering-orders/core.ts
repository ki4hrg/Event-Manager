// Pure cores for catering-order + all its sub-resources.
// NOT a "use server" file — see src/app/contacts/core.ts for the security rationale.

import type { EntityStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermissionForUser, PermissionError, requireEventTenantId } from "@/lib/permissions";
import { resolveEquipmentName } from "@/lib/equipment-utils";
import { parseDateTimeInTimezone } from "@/lib/timezones";
import { resolveCreateStatus } from "@/lib/statusDefaults";
import { autoAssignDefaultWorkflowsCore } from "@/app/events/workflows/core";

async function assertCateringOrderInEvent(cateringOrderId: string, eventId: string) {
  const found = await prisma.cateringOrder.findUnique({
    where: { id: cateringOrderId, eventId },
    select: { id: true },
  });
  if (!found) throw new PermissionError("NOT_FOUND");
}

async function bumpCateringOrder(cateringOrderId: string, userId: string) {
  await prisma.cateringOrder.update({
    where: { id: cateringOrderId },
    data: { updatedById: userId },
  });
}

async function eventTimezone(eventId: string): Promise<string> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { timezone: true },
  });
  if (!event) throw new Error("Event not found");
  return event.timezone;
}

// ---------------------------------------------------------------------------
// CateringOrder

export type CreateCateringOrderArgs = {
  name: string;
  functionId: string | null;
  serviceStyle: string | null;
  // meal_type label; its APEX bucket places the order in the ESG F&B grid.
  mealType?: string | null;
  expectedCount: number | null;
  confirmedCount: number | null;
  guaranteeCount: number | null;
  staffingNotes: string | null;
  rentalMinimum: number | null;
  fbMinimum: number | null;
  depositDeadline: Date | null;
  guaranteeDeadline: Date | null;
  paymentDeadline: Date | null;
  cancellationTerms: string | null;
  dietaryNotes: string | null;
  notes: string | null;
  // Optional vendor pin; falls back to event default CATERING_ORDER vendor.
  vendorId: string | null;
};

export async function createCateringOrderCore(
  eventId: string,
  args: CreateCateringOrderArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "CATERING_ORDERS", "WRITE", eventId);
  const defaults = await resolveCreateStatus(eventId, "CATERING_ORDER");

  const cateringOrder = await prisma.cateringOrder.create({
    data: {
      name: args.name,
      eventId,
      functionId: args.functionId,
      serviceStyle: args.serviceStyle,
      mealType: args.mealType ?? null,
      expectedCount: args.expectedCount,
      confirmedCount: args.confirmedCount,
      guaranteeCount: args.guaranteeCount,
      staffingNotes: args.staffingNotes,
      rentalMinimum: args.rentalMinimum,
      fbMinimum: args.fbMinimum,
      depositDeadline: args.depositDeadline,
      guaranteeDeadline: args.guaranteeDeadline,
      paymentDeadline: args.paymentDeadline,
      cancellationTerms: args.cancellationTerms,
      dietaryNotes: args.dietaryNotes,
      notes: args.notes,
      status: defaults.status,
      substatus: defaults.substatus,
      updatedById: userId,
    },
  });

  const fallback = !args.vendorId
    ? await prisma.eventVendor.findFirst({
        where: { eventId, defaultFor: { has: "CATERING_ORDER" } },
        select: { vendorId: true },
      })
    : null;
  const vendorIdToAssign = args.vendorId ?? fallback?.vendorId ?? null;
  if (vendorIdToAssign) {
    await prisma.cateringOrderVendor.create({
      data: { cateringOrderId: cateringOrder.id, vendorId: vendorIdToAssign },
    });
  }

  await autoAssignDefaultWorkflowsCore("catering_order", cateringOrder.id, cateringOrder.eventId);
  return cateringOrder;
}

// Partial update: every field is optional. Pass `undefined` to leave a column
// untouched, `null` to clear it (where the schema allows null). The UI calls
// four narrower wrappers (Details, GuestCounts, Service, Contract) that each
// supply only their tab's fields; MCP can pass any combination.
export type UpdateCateringOrderArgs = {
  name?: string;
  serviceStyle?: string | null;
  mealType?: string | null;
  expectedCount?: number | null;
  confirmedCount?: number | null;
  guaranteeCount?: number | null;
  staffingNotes?: string | null;
  rentalMinimum?: number | null;
  fbMinimum?: number | null;
  depositDeadline?: Date | null;
  guaranteeDeadline?: Date | null;
  paymentDeadline?: Date | null;
  cancellationTerms?: string | null;
  dietaryNotes?: string | null;
  notes?: string | null;
};

export async function updateCateringOrderCore(
  id: string,
  eventId: string,
  args: UpdateCateringOrderArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "CATERING_ORDERS", "WRITE", eventId);
  const data: Record<string, unknown> = { updatedById: userId };
  for (const [k, v] of Object.entries(args)) {
    if (v !== undefined) data[k] = v;
  }
  return prisma.cateringOrder.update({ where: { id, eventId }, data });
}

export async function deleteCateringOrderCore(id: string, eventId: string, userId: string) {
  await requirePermissionForUser(userId, "CATERING_ORDERS", "DELETE", eventId);
  await prisma.cateringOrder.delete({ where: { id, eventId } });
}

export async function deleteCateringOrdersCore(
  ids: string[],
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "CATERING_ORDERS", "DELETE", eventId);
  const r = await prisma.cateringOrder.deleteMany({ where: { id: { in: ids }, eventId } });
  return { count: r.count };
}

export type BulkCateringOrderUpdates = {
  status?: EntityStatus;
  substatus?: string | null;
  vendorId?: string;
};

export async function bulkUpdateCateringOrdersCore(
  ids: string[],
  eventId: string,
  updates: BulkCateringOrderUpdates,
  userId: string,
) {
  await requirePermissionForUser(userId, "CATERING_ORDERS", "WRITE", eventId);
  const { status, substatus, vendorId } = updates;

  if (status !== undefined || substatus !== undefined) {
    await prisma.cateringOrder.updateMany({
      where: { id: { in: ids }, eventId },
      data: {
        ...(status !== undefined ? { status } : {}),
        ...(substatus !== undefined ? { substatus } : {}),
        updatedById: userId,
      },
    });
  }

  if (vendorId) {
    await prisma.cateringOrderVendor.deleteMany({
      where: { cateringOrderId: { in: ids }, cateringOrder: { eventId } },
    });
    await prisma.cateringOrderVendor.createMany({
      data: ids.map((id) => ({ cateringOrderId: id, vendorId })),
    });
    await prisma.cateringOrder.updateMany({
      where: { id: { in: ids }, eventId },
      data: { updatedById: userId },
    });
  }
}

// ---------------------------------------------------------------------------
// Function link (1:1 FK on CateringOrder.functionId)

export async function linkCateringOrderToFunctionCore(
  cateringOrderId: string,
  functionId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "CATERING_ORDERS", "WRITE", eventId);
  await assertCateringOrderInEvent(cateringOrderId, eventId);
  return prisma.cateringOrder.update({
    where: { id: cateringOrderId, eventId },
    data: { functionId, updatedById: userId },
  });
}

// Returns the previously-linked functionId so the UI wrapper can revalidate
// that function's path.
export async function unlinkCateringOrderFromFunctionCore(
  cateringOrderId: string,
  eventId: string,
  userId: string,
): Promise<{ previousFunctionId: string | null }> {
  await requirePermissionForUser(userId, "CATERING_ORDERS", "WRITE", eventId);
  const cateringOrder = await prisma.cateringOrder.findUnique({
    where: { id: cateringOrderId, eventId },
    select: { functionId: true },
  });
  await prisma.cateringOrder.update({
    where: { id: cateringOrderId, eventId },
    data: { functionId: null, updatedById: userId },
  });
  return { previousFunctionId: cateringOrder?.functionId ?? null };
}

export async function unlinkCateringOrdersFromFunctionCore(
  functionId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "CATERING_ORDERS", "WRITE", eventId);
  const r = await prisma.cateringOrder.updateMany({
    where: { functionId, eventId },
    data: { functionId: null, updatedById: userId },
  });
  return { count: r.count };
}

// ---------------------------------------------------------------------------
// TimelineItem

export type TimelineItemWriteArgs = {
  label: string;
  // Times are in event-local format (YYYY-MM-DDTHH:MM) — converted to UTC
  // via the event's timezone inside the core.
  startTime: string;
  endTime: string | null;
  notes: string | null;
};

export async function createTimelineItemCore(
  cateringOrderId: string,
  eventId: string,
  args: TimelineItemWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "CATERING_ORDERS", "WRITE", eventId);
  await assertCateringOrderInEvent(cateringOrderId, eventId);
  const timezone = await eventTimezone(eventId);
  const { _max } = await prisma.timelineItem.aggregate({
    where: { cateringOrderId },
    _max: { sortOrder: true },
  });
  const row = await prisma.timelineItem.create({
    data: {
      cateringOrderId,
      label: args.label,
      startTime: parseDateTimeInTimezone(args.startTime, timezone),
      endTime: args.endTime ? parseDateTimeInTimezone(args.endTime, timezone) : null,
      notes: args.notes,
      sortOrder: (_max.sortOrder ?? -1) + 1,
    },
  });
  await bumpCateringOrder(cateringOrderId, userId);
  return row;
}

export async function updateTimelineItemCore(
  id: string,
  cateringOrderId: string,
  eventId: string,
  args: TimelineItemWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "CATERING_ORDERS", "WRITE", eventId);
  const timezone = await eventTimezone(eventId);
  const row = await prisma.timelineItem.update({
    where: { id, cateringOrder: { eventId } },
    data: {
      label: args.label,
      startTime: parseDateTimeInTimezone(args.startTime, timezone),
      endTime: args.endTime ? parseDateTimeInTimezone(args.endTime, timezone) : null,
      notes: args.notes,
    },
  });
  await bumpCateringOrder(cateringOrderId, userId);
  return row;
}

export async function deleteTimelineItemCore(
  id: string,
  cateringOrderId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "CATERING_ORDERS", "WRITE", eventId);
  await prisma.timelineItem.delete({ where: { id, cateringOrder: { eventId } } });
  await bumpCateringOrder(cateringOrderId, userId);
}

// ---------------------------------------------------------------------------
// EquipmentItem (catering-scoped)

export type CateringEquipmentItemWriteArgs = {
  equipmentId: string | null;
  item: string;
  quantity: number | null;
  providerVendorId: string | null;
  providerContactId: string | null;
  operatorVendorId: string | null;
  operatorContactId: string | null;
  notes: string | null;
};

export async function createCateringEquipmentItemCore(
  cateringOrderId: string,
  eventId: string,
  args: CateringEquipmentItemWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "CATERING_ORDERS", "WRITE", eventId);
  await assertCateringOrderInEvent(cateringOrderId, eventId);
  const item = await resolveEquipmentName(args.equipmentId, args.item);
  const { _max } = await prisma.equipmentItem.aggregate({
    where: { cateringOrderId },
    _max: { sortOrder: true },
  });
  const row = await prisma.equipmentItem.create({
    data: {
      cateringOrderId,
      equipmentId: args.equipmentId,
      item,
      quantity: args.quantity,
      providerVendorId: args.providerVendorId,
      providerContactId: args.providerContactId,
      operatorVendorId: args.operatorVendorId,
      operatorContactId: args.operatorContactId,
      notes: args.notes,
      sortOrder: (_max.sortOrder ?? -1) + 1,
    },
  });
  await bumpCateringOrder(cateringOrderId, userId);
  return row;
}

export async function updateCateringEquipmentItemCore(
  id: string,
  cateringOrderId: string,
  eventId: string,
  args: CateringEquipmentItemWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "CATERING_ORDERS", "WRITE", eventId);
  const item = await resolveEquipmentName(args.equipmentId, args.item);
  const row = await prisma.equipmentItem.update({
    where: { id, cateringOrder: { eventId } },
    data: {
      equipmentId: args.equipmentId,
      item,
      quantity: args.quantity,
      providerVendorId: args.providerVendorId,
      providerContactId: args.providerContactId,
      operatorVendorId: args.operatorVendorId,
      operatorContactId: args.operatorContactId,
      notes: args.notes,
    },
  });
  await bumpCateringOrder(cateringOrderId, userId);
  return row;
}

export async function deleteCateringEquipmentItemCore(
  id: string,
  cateringOrderId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "CATERING_ORDERS", "WRITE", eventId);
  await prisma.equipmentItem.delete({ where: { id, cateringOrder: { eventId } } });
  await bumpCateringOrder(cateringOrderId, userId);
}

// ---------------------------------------------------------------------------
// CateringOrderLineItem

export type LineItemWriteArgs = {
  description: string;
  unitType: string | null;
  unitPrice: number | null;
  quantity: number | null;
  notes: string | null;
};

export async function createCateringOrderLineItemCore(
  cateringOrderId: string,
  eventId: string,
  args: LineItemWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "CATERING_ORDERS", "WRITE", eventId);
  await assertCateringOrderInEvent(cateringOrderId, eventId);
  const { _max } = await prisma.cateringOrderLineItem.aggregate({
    where: { cateringOrderId },
    _max: { sortOrder: true },
  });
  const row = await prisma.cateringOrderLineItem.create({
    data: { cateringOrderId, ...args, sortOrder: (_max.sortOrder ?? -1) + 1 },
  });
  await bumpCateringOrder(cateringOrderId, userId);
  return row;
}

export async function updateCateringOrderLineItemCore(
  id: string,
  cateringOrderId: string,
  eventId: string,
  args: LineItemWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "CATERING_ORDERS", "WRITE", eventId);
  const row = await prisma.cateringOrderLineItem.update({
    where: { id, cateringOrder: { eventId } },
    data: args,
  });
  await bumpCateringOrder(cateringOrderId, userId);
  return row;
}

export async function deleteCateringOrderLineItemCore(
  id: string,
  cateringOrderId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "CATERING_ORDERS", "WRITE", eventId);
  await prisma.cateringOrderLineItem.delete({ where: { id, cateringOrder: { eventId } } });
  await bumpCateringOrder(cateringOrderId, userId);
}

// ---------------------------------------------------------------------------
// CateringOrderMenuSection

export type MenuSectionWriteArgs = {
  responsiblePartyVendorId: string | null;
  menuContent: string;
  notes: string | null;
};

export async function createCateringOrderMenuSectionCore(
  cateringOrderId: string,
  eventId: string,
  args: MenuSectionWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "CATERING_ORDERS", "WRITE", eventId);
  await assertCateringOrderInEvent(cateringOrderId, eventId);
  const { _max } = await prisma.cateringOrderMenuSection.aggregate({
    where: { cateringOrderId },
    _max: { sortOrder: true },
  });
  const row = await prisma.cateringOrderMenuSection.create({
    data: { cateringOrderId, ...args, sortOrder: (_max.sortOrder ?? -1) + 1 },
  });
  await bumpCateringOrder(cateringOrderId, userId);
  return row;
}

export async function updateCateringOrderMenuSectionCore(
  id: string,
  cateringOrderId: string,
  eventId: string,
  args: MenuSectionWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "CATERING_ORDERS", "WRITE", eventId);
  const row = await prisma.cateringOrderMenuSection.update({
    where: { id, cateringOrder: { eventId } },
    data: args,
  });
  await bumpCateringOrder(cateringOrderId, userId);
  return row;
}

export async function deleteCateringOrderMenuSectionCore(
  id: string,
  cateringOrderId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "CATERING_ORDERS", "WRITE", eventId);
  await prisma.cateringOrderMenuSection.delete({ where: { id, cateringOrder: { eventId } } });
  await bumpCateringOrder(cateringOrderId, userId);
}

// ---------------------------------------------------------------------------
// CateringOrderServiceLocation

export type ServiceLocationWriteArgs = {
  name: string | null;
  functionId: string | null;
  expectedCount: number | null;
  notes: string | null;
};

export async function createCateringOrderServiceLocationCore(
  cateringOrderId: string,
  eventId: string,
  args: ServiceLocationWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "CATERING_ORDERS", "WRITE", eventId);
  await assertCateringOrderInEvent(cateringOrderId, eventId);
  const { _max } = await prisma.cateringOrderServiceLocation.aggregate({
    where: { cateringOrderId },
    _max: { sortOrder: true },
  });
  const row = await prisma.cateringOrderServiceLocation.create({
    data: { cateringOrderId, ...args, sortOrder: (_max.sortOrder ?? -1) + 1 },
  });
  await bumpCateringOrder(cateringOrderId, userId);
  return row;
}

export async function updateCateringOrderServiceLocationCore(
  id: string,
  cateringOrderId: string,
  eventId: string,
  args: ServiceLocationWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "CATERING_ORDERS", "WRITE", eventId);
  const row = await prisma.cateringOrderServiceLocation.update({
    where: { id, cateringOrder: { eventId } },
    data: args,
  });
  await bumpCateringOrder(cateringOrderId, userId);
  return row;
}

export async function deleteCateringOrderServiceLocationCore(
  id: string,
  cateringOrderId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "CATERING_ORDERS", "WRITE", eventId);
  await prisma.cateringOrderServiceLocation.delete({
    where: { id, cateringOrder: { eventId } },
  });
  await bumpCateringOrder(cateringOrderId, userId);
}

// ---------------------------------------------------------------------------
// CateringOrderContact

export async function addCateringOrderContactCore(
  cateringOrderId: string,
  eventId: string,
  contactId: string,
  role: string | null,
  userId: string,
) {
  await requirePermissionForUser(userId, "CATERING_ORDERS", "WRITE", eventId);
  await assertCateringOrderInEvent(cateringOrderId, eventId);
  const row = await prisma.cateringOrderContact.create({
    data: { cateringOrderId, contactId, role },
  });
  await bumpCateringOrder(cateringOrderId, userId);
  return row;
}

export async function updateCateringOrderContactCore(
  id: string,
  cateringOrderId: string,
  eventId: string,
  role: string | null,
  userId: string,
) {
  await requirePermissionForUser(userId, "CATERING_ORDERS", "WRITE", eventId);
  const row = await prisma.cateringOrderContact.update({
    where: { id, cateringOrder: { eventId } },
    data: { role },
  });
  await bumpCateringOrder(cateringOrderId, userId);
  return row;
}

export async function removeCateringOrderContactCore(
  id: string,
  cateringOrderId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, "CATERING_ORDERS", "WRITE", eventId);
  await prisma.cateringOrderContact.delete({ where: { id, cateringOrder: { eventId } } });
  await bumpCateringOrder(cateringOrderId, userId);
}

export type CreateAndAddCateringOrderContactArgs = {
  cateringOrderId: string;
  eventId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  organization: string | null;
  role: string | null;
};

export async function createAndAddCateringOrderContactCore(
  args: CreateAndAddCateringOrderContactArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, "CATERING_ORDERS", "WRITE", args.eventId);
  await assertCateringOrderInEvent(args.cateringOrderId, args.eventId);

  const contact = await prisma.contact.create({
    data: {
      tenantId: await requireEventTenantId(args.eventId),
      firstName: args.firstName,
      lastName: args.lastName,
      email: args.email,
      organization: args.organization,
      updatedById: userId,
    },
  });

  const row = await prisma.cateringOrderContact.create({
    data: { cateringOrderId: args.cateringOrderId, contactId: contact.id, role: args.role },
  });
  await bumpCateringOrder(args.cateringOrderId, userId);
  return row;
}
