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
import { refreshWorkflowStatusForRfp } from "@/app/events/workflows/core";
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
  const result = await prisma.$transaction(async (tx) => {
    const quote = await tx.vendorQuote.create({
      data: { ...data, eventId, rfpId: rfp?.id ?? null, updatedById: userId, lines: { create: lines.map(({ id: _id, at: _at, ...l }) => l) } },
    });
    if (rfp) {
      await tx.rfpRecipient.createMany({ data: [{ rfpId: rfp.id, vendorId: data.vendorId }], skipDuplicates: true });
    }
    return quote;
  });
  if (rfp) await refreshWorkflowStatusForRfp(rfp.id, eventId);
  return result;
}

// Returns the quote and each of args.lines' saved id (null for a line dropped
// as blank), so an autosaving form updates the lines it just created.
export async function updateVendorQuoteCore(id: string, eventId: string, args: QuoteWriteArgs, userId: string) {
  const current = await authorizeQuote(id, eventId, "WRITE", userId);
  if (args.revision < current.revision) throw new Error("Revision cannot go down");
  const { data, lines } = await validate(eventId, current.rfpId, args, current);
  const existing = new Set((await prisma.vendorQuoteLine.findMany({ where: { quoteId: id }, select: { id: true } })).map((l) => l.id));
  const kept = lines.flatMap((l) => (l.id && existing.has(l.id) ? [l.id] : []));
  const result = await prisma.$transaction(async (tx) => {
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
  if (current.rfpId) await refreshWorkflowStatusForRfp(current.rfpId, eventId);
  return result;
}

// The lines it won open up (SetNull); a closed RFP reopens.
export async function deleteVendorQuoteCore(id: string, eventId: string, userId: string) {
  const { rfpId } = await authorizeQuote(id, eventId, "DELETE", userId);
  const held = rfpId ? await prisma.rfpLineItem.count({ where: { rfpId, awardedQuoteId: id } }) : 0;
  await prisma.$transaction(async (tx: Tx) => {
    await tx.vendorQuote.delete({ where: { id, eventId } });
    if (rfpId && held) await settleAwards(tx, rfpId, eventId, userId, []);
  });
  if (rfpId) await refreshWorkflowStatusForRfp(rfpId, eventId);
}

// Awards. A quote is ACCEPTED when its vendor won work; on an RFP with line
// items, each line records the accepted quote that won it (awardedQuoteId),
// so work splits across vendors and an award puts its vendor only on the
// orders its lines were copied from. Awarding takes VENDORS WRITE (it puts
// the vendor on the event). After awards change, settleAwards keeps the rest
// in step: a quote left holding no line goes back to RECEIVED, and the RFP
// closes once every line is awarded (a closed one with an open line reopens).

type Tx = Prisma.TransactionClient;
type SourceLine = { avOrderId: string | null; cateringOrderId: string | null; printOrderId: string | null };
const sourceSelect = { avOrderId: true, cateringOrderId: true, printOrderId: true } as const;
type OrderKey = keyof SourceLine;
const orderIds = (lines: SourceLine[], key: OrderKey) => Array.from(new Set(lines.flatMap((l) => (l[key] ? [l[key] as string] : []))));

// Puts the vendor on the event and on the orders the lines came from (those
// still on this event: a source may have been deleted since).
async function addVendorToOrders(tx: Tx, eventId: string, vendorId: string, lines: SourceLine[]) {
  await tx.eventVendor.upsert({ where: { eventId_vendorId: { eventId, vendorId } }, create: { eventId, vendorId }, update: {} });
  const [av, catering, print] = await Promise.all([
    tx.aVOrder.findMany({ where: { id: { in: orderIds(lines, "avOrderId") }, eventId }, select: { id: true } }),
    tx.cateringOrder.findMany({ where: { id: { in: orderIds(lines, "cateringOrderId") }, eventId }, select: { id: true } }),
    tx.printOrder.findMany({ where: { id: { in: orderIds(lines, "printOrderId") }, eventId }, select: { id: true } }),
  ]);
  await tx.aVOrderVendor.createMany({ data: av.map((o) => ({ avOrderId: o.id, vendorId })), skipDuplicates: true });
  await tx.cateringOrderVendor.createMany({ data: catering.map((o) => ({ cateringOrderId: o.id, vendorId })), skipDuplicates: true });
  await tx.printOrderVendor.createMany({ data: print.map((o) => ({ printOrderId: o.id, vendorId })), skipDuplicates: true });
  return av.length + catering.length + print.length;
}

// `losers`: quotes that just lost lines. Call only when awards changed.
export async function settleAwards(tx: Tx, rfpId: string, eventId: string, userId: string, losers: string[]) {
  if (losers.length) {
    await tx.vendorQuote.updateMany({
      where: { id: { in: losers }, rfpId, eventId, status: "ACCEPTED", awardedLines: { none: {} } },
      data: { status: "RECEIVED", updatedById: userId },
    });
  }
  const [total, open] = await Promise.all([tx.rfpLineItem.count({ where: { rfpId } }), tx.rfpLineItem.count({ where: { rfpId, awardedQuoteId: null } })]);
  if (!total) return;
  if (open === 0) await tx.rfp.updateMany({ where: { id: rfpId, eventId, status: { not: "CLOSED" } }, data: { status: "CLOSED", updatedById: userId } });
  else await tx.rfp.updateMany({ where: { id: rfpId, eventId, status: "CLOSED" }, data: { status: "ISSUED", updatedById: userId } });
}

// The quotes other than `quoteId` holding any of the lines.
const holders = (lines: { awardedQuoteId: string | null }[], quoteId: string | null) =>
  Array.from(new Set(lines.flatMap((l) => (l.awardedQuoteId && l.awardedQuoteId !== quoteId ? [l.awardedQuoteId] : []))));

// Accepting a quote. Whole (lineItemIds null): it wins every RFP line not yet
// awarded; refused when there's none left. With declineOthers, the RFP's
// other RECEIVED quotes are DECLINED and the RFP CLOSED; quotes accepted
// earlier keep their lines. By line (lineItemIds, this RFP's): it wins those
// lines, taking them from any quote that held them.
export async function awardVendorQuoteCore(id: string, eventId: string, userId: string, declineOthers: boolean, lineItemIds: string[] | null = null) {
  const quote = await authorizeQuote(id, eventId, "WRITE", userId);
  const tenantId = await requireEventTenantId(eventId);
  await requirePermissionForUser(userId, "VENDORS", "WRITE", { tenantId });
  const rfpId = quote.rfpId;
  if (lineItemIds && !rfpId) throw new Error("A standalone quote has no RFP lines to award");
  if (lineItemIds && declineOthers) throw new Error("declineOthers awards the whole quote; omit lineItemIds");
  const lines = rfpId ? await prisma.rfpLineItem.findMany({ where: { rfpId }, select: { id: true, awardedQuoteId: true, ...sourceSelect } }) : [];
  let won: typeof lines;
  if (lineItemIds) {
    const wanted = new Set(lineItemIds);
    if (!wanted.size) throw new Error("Pick at least one line");
    const own = new Set(lines.map((l) => l.id));
    for (const lineId of Array.from(wanted)) if (!own.has(lineId)) throw new PermissionError("NOT_FOUND", "RFP line item not found");
    won = lines.filter((l) => wanted.has(l.id) && l.awardedQuoteId !== id);
  } else {
    won = lines.filter((l) => !l.awardedQuoteId);
    if (lines.length && !won.length && quote.status !== "ACCEPTED") throw new UserFacingError("Every line is already awarded; award lines from the comparison");
  }
  const losers = holders(won, id);
  const vendorId = quote.vendorId;
  const result = await prisma.$transaction(async (tx: Tx) => {
    await tx.vendorQuote.update({ where: { id, eventId }, data: { status: "ACCEPTED", updatedById: userId } });
    if (rfpId && won.length) await tx.rfpLineItem.updateMany({ where: { id: { in: won.map((l) => l.id) }, rfpId }, data: { awardedQuoteId: id } });
    if (rfpId && declineOthers) {
      await tx.vendorQuote.updateMany({ where: { rfpId, eventId, id: { not: id }, status: "RECEIVED" }, data: { status: "DECLINED", updatedById: userId } });
      await tx.rfp.update({ where: { id: rfpId, eventId }, data: { status: "CLOSED", updatedById: userId } });
    }
    const orders = await addVendorToOrders(tx, eventId, vendorId, won);
    if (rfpId && won.length) await settleAwards(tx, rfpId, eventId, userId, losers);
    return { orders, lines: won.length };
  });
  if (rfpId) await refreshWorkflowStatusForRfp(rfpId, eventId);
  return result;
}

// Takes the award off RFP lines (this RFP's); the vendors stay on their
// orders. A quote left holding no line goes back to RECEIVED.
export async function clearRfpLineAwardsCore(rfpId: string, eventId: string, lineItemIds: string[], userId: string) {
  const rfp = await prisma.rfp.findFirst({ where: { id: rfpId, eventId }, select: { kind: true } });
  if (!rfp) throw new PermissionError("NOT_FOUND", "RFP not found");
  if (rfp.kind === "HOTEL") throw new Error("Hotels answer with proposals, not quotes");
  await requirePermissionForUser(userId, resourceForKind(rfp.kind), "WRITE", eventId);
  const wanted = Array.from(new Set(lineItemIds));
  const lines = await prisma.rfpLineItem.findMany({ where: { rfpId, id: { in: wanted } }, select: { id: true, awardedQuoteId: true } });
  if (lines.length !== wanted.length) throw new PermissionError("NOT_FOUND", "RFP line item not found");
  const held = lines.filter((l) => l.awardedQuoteId);
  if (!held.length) return { cleared: 0 };
  const result = await prisma.$transaction(async (tx: Tx) => {
    await tx.rfpLineItem.updateMany({ where: { id: { in: held.map((l) => l.id) }, rfpId }, data: { awardedQuoteId: null } });
    await settleAwards(tx, rfpId, eventId, userId, holders(held, null));
    return { cleared: held.length };
  });
  if (rfpId) await refreshWorkflowStatusForRfp(rfpId, eventId);
  return result;
}

// Sets a quote to Received or Declined by hand. Leaving Accepted withdraws the
// award and opens its lines. With removeFromOrders (VENDORS WRITE) the vendor
// comes off the orders of the lines it won (every RFP source order for an
// award that held no line, as awards did before line awards), except ones it
// still holds lines on through another accepted quote; it stays on the event.
// A closed RFP reopens when it has an open line or no accepted quote.
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
  const rfpId = quote.rfpId;
  const vendorId = quote.vendorId;
  const held = withdraw && rfpId ? await prisma.rfpLineItem.findMany({ where: { rfpId, awardedQuoteId: id }, select: sourceSelect }) : [];
  let remove: Record<OrderKey, string[]> = { avOrderId: [], cateringOrderId: [], printOrderId: [] };
  if (removeFromOrders && rfpId) {
    const [from, kept] = await Promise.all([
      held.length ? held : prisma.rfpLineItem.findMany({ where: { rfpId }, select: sourceSelect }),
      prisma.rfpLineItem.findMany({ where: { rfpId, awardedQuoteId: { not: id }, awardedQuote: { vendorId, status: "ACCEPTED" } }, select: sourceSelect }),
    ]);
    const without = (key: OrderKey) => {
      const keep = new Set(orderIds(kept, key));
      return orderIds(from, key).filter((o) => !keep.has(o));
    };
    remove = { avOrderId: without("avOrderId"), cateringOrderId: without("cateringOrderId"), printOrderId: without("printOrderId") };
  }
  const result = await prisma.$transaction(async (tx: Tx) => {
    await tx.vendorQuote.update({ where: { id, eventId }, data: { status, updatedById: userId } });
    let orders = 0;
    if (removeFromOrders) {
      const removed = await Promise.all([
        tx.aVOrderVendor.deleteMany({ where: { vendorId, avOrderId: { in: remove.avOrderId }, avOrder: { eventId } } }),
        tx.cateringOrderVendor.deleteMany({ where: { vendorId, cateringOrderId: { in: remove.cateringOrderId }, cateringOrder: { eventId } } }),
        tx.printOrderVendor.deleteMany({ where: { vendorId, printOrderId: { in: remove.printOrderId }, printOrder: { eventId } } }),
      ]);
      orders = removed.reduce((n, r) => n + r.count, 0);
    }
    if (withdraw && rfpId) {
      if (held.length) {
        await tx.rfpLineItem.updateMany({ where: { rfpId, awardedQuoteId: id }, data: { awardedQuoteId: null } });
        await settleAwards(tx, rfpId, eventId, userId, []);
      }
      if ((await tx.vendorQuote.count({ where: { rfpId, eventId, status: "ACCEPTED" } })) === 0) {
        await tx.rfp.updateMany({ where: { id: rfpId, eventId, status: "CLOSED" }, data: { status: "ISSUED", updatedById: userId } });
      }
    }
    return { status, orders };
  });
  if (rfpId) await refreshWorkflowStatusForRfp(rfpId, eventId);
  return result;
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
        lineItems: { orderBy: { sortOrder: "asc" }, select: { id: true, group: true, description: true, quantity: true, unit: true, awardedQuoteId: true } },
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
