// Pure cores for vendor + vendor-contact + event-vendor + order-vendor junction
// mutations. NOT a "use server" file — see `src/app/contacts/core.ts` for the
// security rationale (cores accept userId and must not be exposed as Server
// Actions). Wrappers in ./actions.ts pass session.user.id; MCP tools pass the
// bearer-resolved userId.

import { PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermissionForUser, PermissionError } from "@/lib/permissions";

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

export async function createVendorCore(args: VendorWriteArgs, userId: string) {
  await requirePermissionForUser(userId, PermissionResource.VENDORS, "WRITE");
  return prisma.vendor.create({
    data: {
      name: args.name.trim(),
      models: args.models,
      notes: args.notes,
      updatedById: userId,
    },
  });
}

export async function updateVendorCore(
  id: string,
  args: VendorWriteArgs,
  userId: string,
) {
  await requirePermissionForUser(userId, PermissionResource.VENDORS, "WRITE");
  return prisma.vendor.update({
    where: { id },
    data: {
      name: args.name.trim(),
      models: args.models,
      notes: args.notes,
      updatedById: userId,
    },
  });
}

export async function deleteVendorCore(id: string, userId: string) {
  await requirePermissionForUser(userId, PermissionResource.VENDORS, "DELETE");
  await prisma.vendor.delete({ where: { id } });
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
) {
  await requirePermissionForUser(userId, PermissionResource.VENDORS, "WRITE");
  const contact = await prisma.contact.create({
    data: {
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

export async function addVendorContactCore(args: AddVendorContactArgs, userId: string) {
  await requirePermissionForUser(userId, PermissionResource.VENDORS, "WRITE");
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

export async function updateVendorContactCore(args: UpdateVendorContactArgs, userId: string) {
  await requirePermissionForUser(userId, PermissionResource.VENDORS, "WRITE");
  if (args.isPrimary) await clearOtherPrimaries(args.vendorId, args.vendorContactId);
  const vc = await prisma.vendorContact.update({
    where: { id: args.vendorContactId },
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
) {
  await requirePermissionForUser(userId, PermissionResource.VENDORS, "DELETE");
  await prisma.vendorContact.delete({ where: { id: vendorContactId } });
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
  await requirePermissionForUser(userId, PermissionResource.VENDORS, "WRITE");
  return prisma.eventVendor.create({ data: { eventId, vendorId } });
}

export async function removeVendorFromEventCore(
  eventVendorId: string,
  userId: string,
) {
  await requirePermissionForUser(userId, PermissionResource.VENDORS, "DELETE");
  await prisma.eventVendor.delete({ where: { id: eventVendorId } });
}

export async function setDefaultVendorCore(
  eventId: string,
  vendorId: string,
  modelType: ModelType,
  userId: string,
) {
  await requirePermissionForUser(userId, PermissionResource.VENDORS, "WRITE");
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
  await requirePermissionForUser(userId, PermissionResource.VENDORS, "WRITE");
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
  const row = await prisma.aVOrderVendor.create({
    data: { avOrderId, vendorId, notes },
  });
  await prisma.aVOrder.update({ where: { id: avOrderId }, data: { updatedById: userId } });
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
  await prisma.aVOrder.update({ where: { id: avOrderId }, data: { updatedById: userId } });
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
  await prisma.aVOrder.update({ where: { id: avOrderId }, data: { updatedById: userId } });
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
  const row = await prisma.cateringOrderVendor.create({
    data: { cateringOrderId, vendorId, notes },
  });
  await prisma.cateringOrder.update({ where: { id: cateringOrderId }, data: { updatedById: userId } });
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
  await prisma.cateringOrder.update({ where: { id: cateringOrderId }, data: { updatedById: userId } });
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
  await prisma.cateringOrder.update({ where: { id: cateringOrderId }, data: { updatedById: userId } });
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
  const row = await prisma.setupOrderVendor.create({
    data: { setupOrderId, vendorId, notes },
  });
  await prisma.setupOrder.update({ where: { id: setupOrderId }, data: { updatedById: userId } });
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
  await prisma.setupOrder.update({ where: { id: setupOrderId }, data: { updatedById: userId } });
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
  await prisma.setupOrder.update({ where: { id: setupOrderId }, data: { updatedById: userId } });
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
  const row = await prisma.printOrderVendor.create({
    data: { printOrderId, vendorId, notes },
  });
  await prisma.printOrder.update({ where: { id: printOrderId }, data: { updatedById: userId } });
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
  await prisma.printOrder.update({ where: { id: printOrderId }, data: { updatedById: userId } });
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
  await prisma.printOrder.update({ where: { id: printOrderId }, data: { updatedById: userId } });
}
