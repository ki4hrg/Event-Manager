// Pure cores for vendor + vendor-contact + event-vendor + order-vendor junction
// mutations. NOT a "use server" file — see `src/app/contacts/core.ts` for the
// security rationale (cores accept userId and must not be exposed as Server
// Actions). Wrappers in ./actions.ts pass session.user.id; MCP tools pass the
// bearer-resolved userId.

import { PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { refreshWorkflowStatus } from "@/app/events/workflows/core";
import { requirePermissionForUser, requireEventTenantId, PermissionError } from "@/lib/permissions";
import { assertEventRefs } from "@/lib/eventRefs";
import { assertIds } from "@/lib/validation";
import { MODEL_LABELS } from "./model-types";
import { UserFacingError } from "@/lib/userErrors";

// Vendor-scoped cores assert the vendor is the tenant's own before touching its
// contacts; a foreign id reads as not-found.
async function assertVendorInTenant(vendorId: string, tenantId: string) {
  assertIds(vendorId);
  const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, tenantId }, select: { id: true } });
  if (!vendor) throw new PermissionError("NOT_FOUND");
}

// Valid defaultFor values. Add new model types here when wiring up vendor auto-assignment.
export type ModelType =
  | "CATERING_ORDER"
  | "AV_ORDER"
  | "SETUP_ORDER"
  | "PRINT_ORDER"
  | "SUPPLY_ORDER"
  | "MEDIA_DELIVERABLE";

// ---------------------------------------------------------------------------
// Vendor (top-level)

export type VendorWriteArgs = {
  name: string;
  models: string[];
  notes: string | null;
};

// A vendor's order types and roles, from the form or an MCP tool: each must
// be a key of MODEL_LABELS (the order types plus vendor roles).
function checkedVendorModels(models: unknown): string[] {
  if (!Array.isArray(models) || !models.every((m): m is string => typeof m === "string" && Object.hasOwn(MODEL_LABELS, m))) {
    throw new UserFacingError("Pick order types from the list");
  }
  return Array.from(new Set(models));
}

export async function createVendorCore(args: VendorWriteArgs, userId: string, tenantId: string) {
  await requirePermissionForUser(userId, PermissionResource.VENDORS, "WRITE", { tenantId });
  return prisma.vendor.create({
    data: {
      tenantId,
      name: args.name.trim(),
      models: checkedVendorModels(args.models),
      notes: args.notes,
      updatedById: userId,
    },
  });
}

export async function updateVendorCore(
  id: string,
  args: VendorWriteArgs,
  userId: string,
  tenantId: string,
) {
  await requirePermissionForUser(userId, PermissionResource.VENDORS, "WRITE", { tenantId });
  return prisma.vendor.update({
    where: { id, tenantId },
    data: {
      name: args.name.trim(),
      models: checkedVendorModels(args.models),
      notes: args.notes,
      updatedById: userId,
    },
  });
}

export async function deleteVendorCore(id: string, userId: string, tenantId: string) {
  await requirePermissionForUser(userId, PermissionResource.VENDORS, "DELETE", { tenantId });
  await prisma.vendor.delete({ where: { id, tenantId } });
}

// ---------------------------------------------------------------------------
// VendorContact (vendor ↔ contact junction with role + isPrimary)

async function clearOtherPrimaries(vendorId: string, excludeId?: string) {
  await prisma.vendorContact.updateMany({
    where: { vendorId, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    data: { isPrimary: false },
  });
}

export type CreateAndAddVendorContactArgs = {
  vendorId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  organization: string | null;
  contactType: string | null;
  isPrimary: boolean;
};

export async function createAndAddVendorContactCore(
  args: CreateAndAddVendorContactArgs,
  userId: string,
  tenantId: string,
) {
  await requirePermissionForUser(userId, PermissionResource.VENDORS, "WRITE", { tenantId });
  await assertVendorInTenant(args.vendorId, tenantId);
  const contact = await prisma.contact.create({
    data: {
      tenantId,
      firstName: args.firstName,
      lastName: args.lastName,
      email: args.email,
      organization: args.organization,
      updatedById: userId,
    },
  });
  if (args.isPrimary) await clearOtherPrimaries(args.vendorId);
  const vc = await prisma.vendorContact.create({
    data: {
      vendorId: args.vendorId,
      contactId: contact.id,
      contactType: args.contactType,
      isPrimary: args.isPrimary,
    },
  });
  await prisma.vendor.update({
    where: { id: args.vendorId },
    data: { updatedById: userId },
  });
  return vc;
}

export type AddVendorContactArgs = {
  vendorId: string;
  contactId: string;
  contactType: string | null;
  isPrimary: boolean;
};

export async function addVendorContactCore(args: AddVendorContactArgs, userId: string, tenantId: string) {
  await requirePermissionForUser(userId, PermissionResource.VENDORS, "WRITE", { tenantId });
  await assertVendorInTenant(args.vendorId, tenantId);
  const contact = await prisma.contact.findFirst({ where: { id: args.contactId, tenantId }, select: { id: true } });
  if (!contact) throw new PermissionError("NOT_FOUND", "Contact not found");
  if (args.isPrimary) await clearOtherPrimaries(args.vendorId);
  const vc = await prisma.vendorContact.create({
    data: {
      vendorId: args.vendorId,
      contactId: args.contactId,
      contactType: args.contactType,
      isPrimary: args.isPrimary,
    },
  });
  await prisma.vendor.update({
    where: { id: args.vendorId },
    data: { updatedById: userId },
  });
  return vc;
}

export type UpdateVendorContactArgs = {
  vendorContactId: string;
  vendorId: string;
  contactType: string | null;
  isPrimary: boolean;
};

export async function updateVendorContactCore(args: UpdateVendorContactArgs, userId: string, tenantId: string) {
  await requirePermissionForUser(userId, PermissionResource.VENDORS, "WRITE", { tenantId });
  await assertVendorInTenant(args.vendorId, tenantId);
  if (args.isPrimary) await clearOtherPrimaries(args.vendorId, args.vendorContactId);
  const vc = await prisma.vendorContact.update({
    where: { id: args.vendorContactId, vendorId: args.vendorId },
    data: { contactType: args.contactType, isPrimary: args.isPrimary },
  });
  await prisma.vendor.update({
    where: { id: args.vendorId },
    data: { updatedById: userId },
  });
  return vc;
}

export async function removeVendorContactCore(
  vendorContactId: string,
  vendorId: string,
  userId: string,
  tenantId: string,
) {
  await requirePermissionForUser(userId, PermissionResource.VENDORS, "DELETE", { tenantId });
  await assertVendorInTenant(vendorId, tenantId);
  await prisma.vendorContact.delete({ where: { id: vendorContactId, vendorId } });
  await prisma.vendor.update({
    where: { id: vendorId },
    data: { updatedById: userId },
  });
}

// ---------------------------------------------------------------------------
// EventVendor (event ↔ vendor assignment, with defaultFor model-type list)

export async function addVendorToEventCore(
  eventId: string,
  vendorId: string,
  userId: string,
) {
  const tenantId = await requireEventTenantId(eventId);
  await requirePermissionForUser(userId, PermissionResource.VENDORS, "WRITE", { tenantId });
  await assertVendorInTenant(vendorId, tenantId);
  return prisma.eventVendor.create({ data: { eventId, vendorId } });
}

export async function removeVendorFromEventCore(
  eventVendorId: string,
  userId: string,
) {
  const row = await prisma.eventVendor.findUnique({
    where: { id: eventVendorId },
    select: { eventId: true },
  });
  if (!row) throw new PermissionError("NOT_FOUND");
  const tenantId = await requireEventTenantId(row.eventId);
  await requirePermissionForUser(userId, PermissionResource.VENDORS, "DELETE", { tenantId });
  await prisma.eventVendor.delete({ where: { id: eventVendorId } });
}

export async function setDefaultVendorCore(
  eventId: string,
  vendorId: string,
  modelType: ModelType,
  userId: string,
) {
  const tenantId = await requireEventTenantId(eventId);
  await requirePermissionForUser(userId, PermissionResource.VENDORS, "WRITE", { tenantId });
  await assertVendorInTenant(vendorId, tenantId);
  await prisma.eventVendor.upsert({
    where: { eventId_vendorId: { eventId, vendorId } },
    create: { eventId, vendorId },
    update: {},
  });
  await prisma.$transaction([
    prisma.$executeRaw`UPDATE "EventVendor" SET "defaultFor" = array_remove("defaultFor", ${modelType}) WHERE "eventId" = ${eventId} AND "vendorId" != ${vendorId}`,
    prisma.$executeRaw`UPDATE "EventVendor" SET "defaultFor" = array_append(array_remove("defaultFor", ${modelType}), ${modelType}) WHERE "eventId" = ${eventId} AND "vendorId" = ${vendorId}`,
  ]);
}

export async function removeDefaultVendorCore(
  eventId: string,
  vendorId: string,
  modelType: ModelType,
  userId: string,
) {
  const tenantId = await requireEventTenantId(eventId);
  await requirePermissionForUser(userId, PermissionResource.VENDORS, "WRITE", { tenantId });
  await prisma.$executeRaw`UPDATE "EventVendor" SET "defaultFor" = array_remove("defaultFor", ${modelType}) WHERE "eventId" = ${eventId} AND "vendorId" = ${vendorId}`;
}

// ---------------------------------------------------------------------------
// Order ↔ Vendor junctions
// Gated by the ORDER's permission (not VENDORS) — linking a vendor to an order
// is an edit to the order, not the vendor. Each helper:
//   1. perm-checks <PER-ORDER-RESOURCE>:<eventId>
//   2. asserts the order belongs to the event (throws NOT_FOUND if not)
//   3. mutates the junction
//   4. stamps the parent order's updatedById

async function assertOrderInEvent(
  model: "aVOrder" | "cateringOrder" | "setupOrder" | "printOrder",
  orderId: string,
  eventId: string,
) {
  // prisma client model accessors are dynamic on `model` here — we narrow by
  // hand below to keep TS happy and the call generic for both check + update.
  const exists =
    model === "aVOrder"
      ? await prisma.aVOrder.findUnique({ where: { id: orderId, eventId }, select: { id: true } })
      : model === "cateringOrder"
      ? await prisma.cateringOrder.findUnique({ where: { id: orderId, eventId }, select: { id: true } })
      : model === "setupOrder"
      ? await prisma.setupOrder.findUnique({ where: { id: orderId, eventId }, select: { id: true } })
      : await prisma.printOrder.findUnique({ where: { id: orderId, eventId }, select: { id: true } });
  if (!exists) throw new PermissionError("NOT_FOUND");
}

// --- AV Order ---

export async function addVendorToAVOrderCore(
  avOrderId: string,
  vendorId: string,
  eventId: string,
  notes: string | null,
  userId: string,
) {
  await requirePermissionForUser(userId, PermissionResource.AV_ORDERS, "WRITE", eventId);
  await assertOrderInEvent("aVOrder", avOrderId, eventId);
  await assertEventRefs(eventId, { vendorIds: [vendorId] });
  const row = await prisma.aVOrderVendor.create({
    data: { avOrderId, vendorId, notes },
  });
  await prisma.aVOrder.updateMany({ where: { id: avOrderId, eventId }, data: { updatedById: userId } });
  await refreshWorkflowStatus("av_order", [avOrderId], eventId);
  return row;
}

export async function updateAVOrderVendorCore(
  id: string,
  avOrderId: string,
  eventId: string,
  notes: string | null,
  userId: string,
) {
  await requirePermissionForUser(userId, PermissionResource.AV_ORDERS, "WRITE", eventId);
  const row = await prisma.aVOrderVendor.update({
    where: { id, avOrder: { eventId } },
    data: { notes },
  });
  await prisma.aVOrder.updateMany({ where: { id: avOrderId, eventId }, data: { updatedById: userId } });
  return row;
}

export async function removeVendorFromAVOrderCore(
  id: string,
  avOrderId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, PermissionResource.AV_ORDERS, "WRITE", eventId);
  await prisma.aVOrderVendor.delete({ where: { id, avOrder: { eventId } } });
  await prisma.aVOrder.updateMany({ where: { id: avOrderId, eventId }, data: { updatedById: userId } });
  await refreshWorkflowStatus("av_order", [avOrderId], eventId);
}

// --- Catering Order ---

export async function addVendorToCateringOrderCore(
  cateringOrderId: string,
  vendorId: string,
  eventId: string,
  notes: string | null,
  userId: string,
) {
  await requirePermissionForUser(userId, PermissionResource.CATERING_ORDERS, "WRITE", eventId);
  await assertOrderInEvent("cateringOrder", cateringOrderId, eventId);
  await assertEventRefs(eventId, { vendorIds: [vendorId] });
  const row = await prisma.cateringOrderVendor.create({
    data: { cateringOrderId, vendorId, notes },
  });
  await prisma.cateringOrder.updateMany({ where: { id: cateringOrderId, eventId }, data: { updatedById: userId } });
  await refreshWorkflowStatus("catering_order", [cateringOrderId], eventId);
  return row;
}

export async function updateCateringOrderVendorCore(
  id: string,
  cateringOrderId: string,
  eventId: string,
  notes: string | null,
  userId: string,
) {
  await requirePermissionForUser(userId, PermissionResource.CATERING_ORDERS, "WRITE", eventId);
  const row = await prisma.cateringOrderVendor.update({
    where: { id, cateringOrder: { eventId } },
    data: { notes },
  });
  await prisma.cateringOrder.updateMany({ where: { id: cateringOrderId, eventId }, data: { updatedById: userId } });
  return row;
}

export async function removeVendorFromCateringOrderCore(
  id: string,
  cateringOrderId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, PermissionResource.CATERING_ORDERS, "WRITE", eventId);
  await prisma.cateringOrderVendor.delete({ where: { id, cateringOrder: { eventId } } });
  await prisma.cateringOrder.updateMany({ where: { id: cateringOrderId, eventId }, data: { updatedById: userId } });
  await refreshWorkflowStatus("catering_order", [cateringOrderId], eventId);
}

// --- Setup Order ---

export async function addVendorToSetupOrderCore(
  setupOrderId: string,
  vendorId: string,
  eventId: string,
  notes: string | null,
  userId: string,
) {
  await requirePermissionForUser(userId, PermissionResource.SETUP_ORDERS, "WRITE", eventId);
  await assertOrderInEvent("setupOrder", setupOrderId, eventId);
  await assertEventRefs(eventId, { vendorIds: [vendorId] });
  const row = await prisma.setupOrderVendor.create({
    data: { setupOrderId, vendorId, notes },
  });
  await prisma.setupOrder.updateMany({ where: { id: setupOrderId, eventId }, data: { updatedById: userId } });
  await refreshWorkflowStatus("setup_order", [setupOrderId], eventId);
  return row;
}

export async function updateSetupOrderVendorCore(
  id: string,
  setupOrderId: string,
  eventId: string,
  notes: string | null,
  userId: string,
) {
  await requirePermissionForUser(userId, PermissionResource.SETUP_ORDERS, "WRITE", eventId);
  const row = await prisma.setupOrderVendor.update({
    where: { id, setupOrder: { eventId } },
    data: { notes },
  });
  await prisma.setupOrder.updateMany({ where: { id: setupOrderId, eventId }, data: { updatedById: userId } });
  return row;
}

export async function removeVendorFromSetupOrderCore(
  id: string,
  setupOrderId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, PermissionResource.SETUP_ORDERS, "WRITE", eventId);
  await prisma.setupOrderVendor.delete({ where: { id, setupOrder: { eventId } } });
  await prisma.setupOrder.updateMany({ where: { id: setupOrderId, eventId }, data: { updatedById: userId } });
  await refreshWorkflowStatus("setup_order", [setupOrderId], eventId);
}

// --- Print Order ---

export async function addVendorToPrintOrderCore(
  printOrderId: string,
  vendorId: string,
  eventId: string,
  notes: string | null,
  userId: string,
) {
  await requirePermissionForUser(userId, PermissionResource.PRINT_ORDERS, "WRITE", eventId);
  await assertOrderInEvent("printOrder", printOrderId, eventId);
  await assertEventRefs(eventId, { vendorIds: [vendorId] });
  const row = await prisma.printOrderVendor.create({
    data: { printOrderId, vendorId, notes },
  });
  await prisma.printOrder.updateMany({ where: { id: printOrderId, eventId }, data: { updatedById: userId } });
  await refreshWorkflowStatus("print_order", [printOrderId], eventId);
  return row;
}

export async function updatePrintOrderVendorCore(
  id: string,
  printOrderId: string,
  eventId: string,
  notes: string | null,
  userId: string,
) {
  await requirePermissionForUser(userId, PermissionResource.PRINT_ORDERS, "WRITE", eventId);
  const row = await prisma.printOrderVendor.update({
    where: { id, printOrder: { eventId } },
    data: { notes },
  });
  await prisma.printOrder.updateMany({ where: { id: printOrderId, eventId }, data: { updatedById: userId } });
  return row;
}

export async function removeVendorFromPrintOrderCore(
  id: string,
  printOrderId: string,
  eventId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, PermissionResource.PRINT_ORDERS, "WRITE", eventId);
  await prisma.printOrderVendor.delete({ where: { id, printOrder: { eventId } } });
  await prisma.printOrder.updateMany({ where: { id: printOrderId, eventId }, data: { updatedById: userId } });
  await refreshWorkflowStatus("print_order", [printOrderId], eventId);
}
