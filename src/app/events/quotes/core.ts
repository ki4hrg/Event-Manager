// Pure cores for vendor quotes. NOT a "use server" file — see
// src/app/contacts/core.ts for the rationale.
//
// A quote is event-scoped. Its permission resource is its RFP's kind's
// (AV_ORDERS for an AV RFP…), EVENTS for a standalone quote. Lines are
// updated in place by id; a line answering an RFP line item must be one of
// that RFP's.

import type { PermissionAction } from "@/lib/permissions";
import type { PermissionResource, Prisma, RfpKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PermissionError, requireEventTenantId, requirePermissionForUser } from "@/lib/permissions";
import { dateFromKey } from "@/lib/hotels";
import { rangeTouched } from "@/lib/dateRange";
import { resourceForKind } from "@/lib/rfp/kinds";
import { buildQuoteComparison } from "@/lib/rfp/compareQuotes";
import { UserFacingError } from "@/lib/userErrors";

export type QuoteLineArgs = {
  id?: string | null;
  rfpLineItemId: string | null;
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null; // as quoted; blank = quantity × unit price
  notes: string | null;
};

export type QuoteWriteArgs = {
  vendorId: string;
  reference: string | null;
  submittedOn: string | null; // YYYY-MM-DD
  validUntil: string | null;
  revision: number;
  serviceCharge: number | null;
  tax: number | null;
  otherFees: number | null;
  depositAmount: number | null;
  depositDue: string | null;
  cancellationTerms: string | null;
  notes: string | null;
  lines: QuoteLineArgs[];
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const quoteResource = (rfp: { kind: RfpKind } | null): PermissionResource => (rfp ? resourceForKind(rfp.kind) : "EVENTS");

// Loads the quote's RFP kind and checks the caller may act on it; a foreign
// id (or another event's quote) is a not-found.
async function authorizeQuote(id: string, eventId: string, action: PermissionAction, userId: string) {
  const quote = await prisma.vendorQuote.findFirst({
    where: { id, eventId },
    select: { rfpId: true, vendorId: true, status: true, revision: true, submittedOn: true, validUntil: true, rfp: { select: { kind: true } } },
  });
  if (!quote) throw new PermissionError("NOT_FOUND", "Quote not found");
  await requirePermissionForUser(userId, quoteResource(quote.rfp), action, eventId);
  return quote;
}

// The RFP a new quote answers: this event's, and one that goes to vendors.
async function authorizeRfp(rfpId: string | null, eventId: string, userId: string) {
  if (!rfpId) {
    await requirePermissionForUser(userId, "EVENTS", "WRITE", eventId);
    return null;
  }
  const rfp = await prisma.rfp.findFirst({ where: { id: rfpId, eventId }, select: { id: true, kind: true } });
  if (!rfp) throw new PermissionError("NOT_FOUND", "RFP not found");
  if (rfp.kind === "HOTEL") throw new Error("Hotels answer with proposals, not quotes");
  await requirePermissionForUser(userId, resourceForKind(rfp.kind), "WRITE", eventId);
  return rfp;
}

function money(v: number | null, label: string) {
  if (v != null && (!Number.isFinite(v) || v < 0)) throw new Error(`${label} cannot be negative`);
  return v;
}

// `stored` is the quote being updated (null on create): a range it already
// holds isn't rechecked.
async function validate(eventId: string, rfpId: string | null, args: QuoteWriteArgs, stored: { submittedOn: Date | null; validUntil: Date | null } | null) {
  const tenantId = await requireEventTenantId(eventId);
  const vendor = await prisma.vendor.findFirst({ where: { id: args.vendorId, tenantId }, select: { id: true } });
  if (!vendor) throw new PermissionError("NOT_FOUND", "Vendor not found");
  for (const d of [args.submittedOn, args.validUntil, args.depositDue]) if (d && !DATE_RE.test(d)) throw new Error(`Invalid date: ${d}`);
  const validity = stored && { start: stored.submittedOn, end: stored.validUntil };
  if (args.submittedOn && args.validUntil && args.validUntil < args.submittedOn && rangeTouched(validity, args.submittedOn, args.validUntil)) {
    throw new Error("Valid until can't be before the submitted date");
  }
  if (!Number.isInteger(args.revision) || args.revision < 1) throw new Error("Revision must be a whole number of 1 or more");
  const asked = rfpId ? new Set((await prisma.rfpLineItem.findMany({ where: { rfpId }, select: { id: true } })).map((l) => l.id)) : new Set<string>();
  const lines = args.lines
    .filter((l) => l.description.trim() || l.rfpLineItemId)
    .map((l, i) => {
      // at: the line's place in args.lines, for the ids the update returns.
      const at = args.lines.indexOf(l);
      if (l.rfpLineItemId && !asked.has(l.rfpLineItemId)) throw new PermissionError("NOT_FOUND", "RFP line item not found");
      const label = l.description.trim() || "Line";
      if (l.quantity != null && (!Number.isFinite(l.quantity) || l.quantity < 0)) throw new Error(`${label}: quantity cannot be negative`);
      return {
        id: l.id ?? null,
        rfpLineItemId: l.rfpLineItemId || null,
        description: l.description.trim() || label,
        quantity: l.quantity,
        unitPrice: money(l.unitPrice, `${label}: unit price`),
        amount: money(l.amount, `${label}: amount`),
        notes: l.notes?.trim() || null,
        sortOrder: i,
        at,
      };
    });
  const day = (v: string | null) => (v ? dateFromKey(v) : null);
  return {
    data: {
      vendorId: args.vendorId,
      reference: args.reference?.trim() || null,
      submittedOn: day(args.submittedOn),
      validUntil: day(args.validUntil),
      revision: args.revision,
      serviceCharge: money(args.serviceCharge, "Service charge"),
      tax: money(args.tax, "Tax"),
      otherFees: money(args.otherFees, "Other fees"),
      depositAmount: money(args.depositAmount, "Deposit"),
      depositDue: day(args.depositDue),
      cancellationTerms: args.cancellationTerms?.trim() || null,
      notes: args.notes?.trim() || null,
    },
    lines,
  };
}

// A quote, answering a vendor RFP or standalone. On an RFP, the vendor joins
// its recipients if it wasn't sent one.
export async function createVendorQuoteCore(eventId: string, rfpId: string | null, args: QuoteWriteArgs, userId: string) {
  const rfp = await authorizeRfp(rfpId, eventId, userId);
  const { data, lines } = await validate(eventId, rfp?.id ?? null, args, null);
  return prisma.$transaction(async (tx) => {
    const quote = await tx.vendorQuote.create({
      data: { ...data, eventId, rfpId: rfp?.id ?? null, updatedById: userId, lines: { create: lines.map(({ id: _id, at: _at, ...l }) => l) } },
    });
    if (rfp) {
      await tx.rfpRecipient.createMany({ data: [{ rfpId: rfp.id, vendorId: data.vendorId }], skipDuplicates: true });
    }
    return quote;
  });
}

// Returns the quote and each of args.lines' saved id (null for a line dropped
// as blank), so an autosaving form updates the lines it just created.
export async function updateVendorQuoteCore(id: string, eventId: string, args: QuoteWriteArgs, userId: string) {
  const current = await authorizeQuote(id, eventId, "WRITE", userId);
  if (args.revision < current.revision) throw new Error("Revision cannot go down");
  const { data, lines } = await validate(eventId, current.rfpId, args, current);
  const existing = new Set((await prisma.vendorQuoteLine.findMany({ where: { quoteId: id }, select: { id: true } })).map((l) => l.id));
  const kept = lines.flatMap((l) => (l.id && existing.has(l.id) ? [l.id] : []));
  return prisma.$transaction(async (tx) => {
    await tx.vendorQuoteLine.deleteMany({ where: { quoteId: id, id: { notIn: kept } } });
    const lineIds: (string | null)[] = args.lines.map(() => null);
    for (const { id: lineId, at, ...line } of lines) {
      if (lineId && existing.has(lineId)) {
        await tx.vendorQuoteLine.update({ where: { id: lineId, quoteId: id }, data: line });
        lineIds[at] = lineId;
      } else lineIds[at] = (await tx.vendorQuoteLine.create({ data: { ...line, quoteId: id }, select: { id: true } })).id;
    }
    const quote = await tx.vendorQuote.update({ where: { id, eventId }, data: { ...data, updatedById: userId } });
    return { quote, lineIds };
  });
}

export async function deleteVendorQuoteCore(id: string, eventId: string, userId: string) {
  await authorizeQuote(id, eventId, "DELETE", userId);
  await prisma.vendorQuote.delete({ where: { id, eventId } });
}

// Accepting a quote: it's ACCEPTED and the vendor is put on the event and on
// every order its RFP's line items came from. Work can be split, so other
// quotes may be accepted too; with declineOthers, the RFP's still-open quotes
// are DECLINED and the RFP CLOSED. VENDORS WRITE is needed to put a vendor on
// an event.
// The orders an RFP's line items were copied from: where an award puts its vendor.
async function rfpSourceOrders(rfpId: string | null) {
  const sources = rfpId
    ? await prisma.rfpLineItem.findMany({ where: { rfpId }, select: { avOrderId: true, cateringOrderId: true, printOrderId: true } })
    : [];
  return (key: "avOrderId" | "cateringOrderId" | "printOrderId") => Array.from(new Set(sources.flatMap((s) => (s[key] ? [s[key] as string] : []))));
}

export async function awardVendorQuoteCore(id: string, eventId: string, userId: string, declineOthers: boolean) {
  const quote = await authorizeQuote(id, eventId, "WRITE", userId);
  const tenantId = await requireEventTenantId(eventId);
  await requirePermissionForUser(userId, "VENDORS", "WRITE", { tenantId });
  const ids = await rfpSourceOrders(quote.rfpId);
  const vendorId = quote.vendorId;
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.vendorQuote.update({ where: { id, eventId }, data: { status: "ACCEPTED", updatedById: userId } });
    if (quote.rfpId && declineOthers) {
      await tx.vendorQuote.updateMany({ where: { rfpId: quote.rfpId, eventId, id: { not: id }, status: "RECEIVED" }, data: { status: "DECLINED" } });
      await tx.rfp.update({ where: { id: quote.rfpId, eventId }, data: { status: "CLOSED", updatedById: userId } });
    }
    await tx.eventVendor.upsert({ where: { eventId_vendorId: { eventId, vendorId } }, create: { eventId, vendorId }, update: {} });
    // Orders still on this event (a source may have been deleted since).
    const [av, catering, print] = await Promise.all([
      tx.aVOrder.findMany({ where: { id: { in: ids("avOrderId") }, eventId }, select: { id: true } }),
      tx.cateringOrder.findMany({ where: { id: { in: ids("cateringOrderId") }, eventId }, select: { id: true } }),
      tx.printOrder.findMany({ where: { id: { in: ids("printOrderId") }, eventId }, select: { id: true } }),
    ]);
    await tx.aVOrderVendor.createMany({ data: av.map((o) => ({ avOrderId: o.id, vendorId })), skipDuplicates: true });
    await tx.cateringOrderVendor.createMany({ data: catering.map((o) => ({ cateringOrderId: o.id, vendorId })), skipDuplicates: true });
    await tx.printOrderVendor.createMany({ data: print.map((o) => ({ printOrderId: o.id, vendorId })), skipDuplicates: true });
    return { orders: av.length + catering.length + print.length };
  });
}

// Sets a quote to Received or Declined by hand. Leaving Accepted withdraws the
// award: with removeFromOrders (VENDORS WRITE) the vendor comes off the
// orders an award puts it on (the RFP's line item sources); it stays on the
// event. An RFP left with no accepted quote reopens if it was closed.
export async function setVendorQuoteStatusCore(
  id: string,
  eventId: string,
  status: "RECEIVED" | "DECLINED",
  removeFromOrders: boolean,
  userId: string,
) {
  const quote = await authorizeQuote(id, eventId, "WRITE", userId);
  const withdraw = quote.status === "ACCEPTED";
  if (removeFromOrders && !withdraw) throw new Error("Only an accepted quote's vendor was added to orders");
  if (removeFromOrders) await requirePermissionForUser(userId, "VENDORS", "WRITE", { tenantId: await requireEventTenantId(eventId) });
  const ids = await rfpSourceOrders(removeFromOrders ? quote.rfpId : null);
  const vendorId = quote.vendorId;
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.vendorQuote.update({ where: { id, eventId }, data: { status, updatedById: userId } });
    let orders = 0;
    if (removeFromOrders) {
      const removed = await Promise.all([
        tx.aVOrderVendor.deleteMany({ where: { vendorId, avOrderId: { in: ids("avOrderId") }, avOrder: { eventId } } }),
        tx.cateringOrderVendor.deleteMany({ where: { vendorId, cateringOrderId: { in: ids("cateringOrderId") }, cateringOrder: { eventId } } }),
        tx.printOrderVendor.deleteMany({ where: { vendorId, printOrderId: { in: ids("printOrderId") }, printOrder: { eventId } } }),
      ]);
      orders = removed.reduce((n, r) => n + r.count, 0);
    }
    if (withdraw && quote.rfpId && (await tx.vendorQuote.count({ where: { rfpId: quote.rfpId, eventId, status: "ACCEPTED" } })) === 0) {
      await tx.rfp.updateMany({ where: { id: quote.rfpId, eventId, status: "CLOSED" }, data: { status: "ISSUED", updatedById: userId } });
    }
    return { status, orders };
  });
}

// "No award": the RFP's open quotes are declined and the RFP closed. Refused
// while a quote is accepted (withdraw it first).
export async function recordNoAwardCore(rfpId: string, eventId: string, userId: string) {
  const rfp = await prisma.rfp.findFirst({ where: { id: rfpId, eventId }, select: { kind: true } });
  if (!rfp) throw new PermissionError("NOT_FOUND", "RFP not found");
  if (rfp.kind === "HOTEL") throw new Error("Hotels answer with proposals, not quotes");
  await requirePermissionForUser(userId, resourceForKind(rfp.kind), "WRITE", eventId);
  if (await prisma.vendorQuote.count({ where: { rfpId, eventId, status: "ACCEPTED" } })) {
    throw new UserFacingError("A quote is accepted; withdraw its award first");
  }
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const { count } = await tx.vendorQuote.updateMany({ where: { rfpId, eventId, status: "RECEIVED" }, data: { status: "DECLINED", updatedById: userId } });
    await tx.rfp.update({ where: { id: rfpId, eventId }, data: { status: "CLOSED", updatedById: userId } });
    return { declined: count };
  });
}

// The quotes answering a vendor RFP against its line items
// (src/lib/rfp/compareQuotes.ts). Shared by the compare page, .docx and MCP.
export async function getQuoteComparisonCore(rfpId: string, eventId: string, userId: string) {
  const rfp = await prisma.rfp.findFirst({ where: { id: rfpId, eventId }, select: { kind: true } });
  if (!rfp) throw new PermissionError("NOT_FOUND", "RFP not found");
  if (rfp.kind === "HOTEL") throw new Error("A hotel RFP compares proposals, not quotes");
  await requirePermissionForUser(userId, resourceForKind(rfp.kind), "VIEW", eventId);
  const [full, event] = await Promise.all([
    prisma.rfp.findFirstOrThrow({
      where: { id: rfpId, eventId },
      select: {
        title: true,
        lineItems: { orderBy: { sortOrder: "asc" }, select: { id: true, group: true, description: true, quantity: true, unit: true } },
        quotes: {
          select: {
            id: true,
            status: true,
            revision: true,
            validUntil: true,
            serviceCharge: true,
            tax: true,
            otherFees: true,
            depositAmount: true,
            depositDue: true,
            vendor: { select: { name: true } },
            lines: { select: { rfpLineItemId: true, description: true, quantity: true, unitPrice: true, amount: true }, orderBy: { sortOrder: "asc" } },
          },
        },
      },
    }),
    prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { name: true } }),
  ]);
  return buildQuoteComparison({
    title: full.title,
    eventName: event.name,
    lineItems: full.lineItems,
    quotes: full.quotes.map((q) => ({ ...q, vendor: q.vendor.name })),
  });
}
