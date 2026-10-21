import { prisma } from "@/lib/prisma";
import { hasPermissionForUser, requirePermissionForUser } from "@/lib/permissions";
import { dateKey } from "@/lib/hotels";
import { quoteTotals } from "@/lib/rfp/quotes";
import {
  awardVendorQuoteCore,
  createVendorQuoteCore,
  deleteVendorQuoteCore,
  quoteResource,
  updateVendorQuoteCore,
  type QuoteLineArgs,
  type QuoteWriteArgs,
} from "@/app/events/quotes/core";
import type { McpToolDefinition } from "./types";
import { partialInt, partialString, requireString } from "./types";

// Vendor quotes: a vendor's price for event work, answering a vendor RFP
// (AV, catering, print, other services) or standalone.

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function partialNumber(args: Record<string, unknown>, key: string): number | null | undefined {
  if (!(key in args)) return undefined;
  const v = args[key];
  if (v === null) return null;
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${key} must be a number`);
  return v;
}

function dateArg(args: Record<string, unknown>, key: string) {
  const v = partialString(args, key);
  if (v && !DATE.test(v)) throw new Error(`${key} must be YYYY-MM-DD`);
  return v;
}

function readLines(v: unknown): QuoteLineArgs[] {
  if (!Array.isArray(v)) throw new Error("lines must be a list");
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  return v.map((l: Record<string, unknown>) => ({
    id: typeof l.id === "string" ? l.id : null,
    rfpLineItemId: typeof l.rfpLineItemId === "string" && l.rfpLineItemId ? l.rfpLineItemId : null,
    description: String(l.description ?? ""),
    quantity: n(l.quantity),
    unitPrice: n(l.unitPrice),
    amount: n(l.amount),
    notes: typeof l.notes === "string" ? l.notes : null,
  }));
}

const quoteProps = {
  vendorId: { type: "string", description: "list_vendors." },
  reference: { type: ["string", "null"], description: "The vendor's quote number." },
  submittedOn: { type: ["string", "null"], description: "YYYY-MM-DD." },
  validUntil: { type: ["string", "null"], description: "YYYY-MM-DD." },
  revision: { type: "integer", description: "Raise when the vendor sends a revised quote. Cannot go down." },
  serviceCharge: { type: ["number", "null"] },
  tax: { type: ["number", "null"] },
  otherFees: { type: ["number", "null"] },
  depositAmount: { type: ["number", "null"] },
  depositDue: { type: ["string", "null"], description: "YYYY-MM-DD." },
  cancellationTerms: { type: ["string", "null"] },
  notes: { type: ["string", "null"] },
  lines: {
    type: "array",
    description:
      "Priced lines; replaces the list. rfpLineItemId (get_rfp lineItems) marks the RFP line a line answers; omit for an extra. amount is the line total as quoted; omit it to use quantity × unitPrice. Pass existing ids (get_vendor_quote) to keep lines.",
    items: {
      type: "object",
      properties: {
        id: { type: ["string", "null"] },
        rfpLineItemId: { type: ["string", "null"] },
        description: { type: "string" },
        quantity: { type: ["number", "null"] },
        unitPrice: { type: ["number", "null"] },
        amount: { type: ["number", "null"] },
        notes: { type: ["string", "null"] },
      },
      required: ["description"],
    },
  },
} as const;

function merge(current: QuoteWriteArgs, args: Record<string, unknown>): QuoteWriteArgs {
  const pick = <T>(v: T | undefined, cur: T) => (v === undefined ? cur : v);
  return {
    vendorId: pick(partialString(args, "vendorId") ?? undefined, current.vendorId),
    reference: pick(partialString(args, "reference"), current.reference),
    submittedOn: pick(dateArg(args, "submittedOn"), current.submittedOn),
    validUntil: pick(dateArg(args, "validUntil"), current.validUntil),
    revision: pick(partialInt(args, "revision") ?? undefined, current.revision),
    serviceCharge: pick(partialNumber(args, "serviceCharge"), current.serviceCharge),
    tax: pick(partialNumber(args, "tax"), current.tax),
    otherFees: pick(partialNumber(args, "otherFees"), current.otherFees),
    depositAmount: pick(partialNumber(args, "depositAmount"), current.depositAmount),
    depositDue: pick(dateArg(args, "depositDue"), current.depositDue),
    cancellationTerms: pick(partialString(args, "cancellationTerms"), current.cancellationTerms),
    notes: pick(partialString(args, "notes"), current.notes),
    lines: "lines" in args ? readLines(args.lines) : current.lines,
  };
}

const quoteInclude = {
  vendor: { select: { id: true, name: true } },
  rfp: { select: { id: true, kind: true, title: true } },
  lines: { orderBy: { sortOrder: "asc" as const } },
} as const;

async function quoteFor(id: string, eventId: string, userId: string) {
  const quote = await prisma.vendorQuote.findFirst({ where: { id, eventId }, include: { ...quoteInclude, files: { select: { id: true, fileName: true } } } });
  if (!quote) throw new Error("Quote not found");
  await requirePermissionForUser(userId, quoteResource(quote.rfp), "VIEW", eventId);
  return quote;
}

const withTotals = <T extends Parameters<typeof quoteTotals>[0]>(q: T) => ({ ...q, ...quoteTotals(q) });

export const quoteTools: McpToolDefinition[] = [
  {
    name: "list_vendor_quotes",
    description:
      "List an event's vendor quotes, or one RFP's (rfpId): vendor, RFP, status (RECEIVED / ACCEPTED / DECLINED), revision, reference, submitted and valid-until dates, subtotal / fees / total. Returns summary shape — use `get_vendor_quote` for full detail (priced lines, deposit, cancellation, notes, files).",
    inputSchema: {
      type: "object",
      properties: { eventId: { type: "string" }, rfpId: { type: "string" } },
      required: ["eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      const rfpId = partialString(args, "rfpId") ?? undefined;
      await requirePermissionForUser(userId, "EVENTS", "VIEW", eventId);
      const quotes = await prisma.vendorQuote.findMany({
        where: { eventId, ...(rfpId ? { rfpId } : {}) },
        select: {
          id: true,
          status: true,
          revision: true,
          reference: true,
          submittedOn: true,
          validUntil: true,
          serviceCharge: true,
          tax: true,
          otherFees: true,
          vendor: { select: { id: true, name: true } },
          rfp: { select: { id: true, kind: true, title: true } },
          lines: { select: { quantity: true, unitPrice: true, amount: true } },
        },
        orderBy: { createdAt: "asc" },
      });
      // Only quotes whose resource the caller may view.
      const allowed = await Promise.all(quotes.map((q) => hasPermissionForUser(userId, quoteResource(q.rfp), "VIEW", eventId)));
      return quotes
        .filter((_, i) => allowed[i])
        .map(({ lines, serviceCharge, tax, otherFees, ...rest }) => ({ ...rest, ...quoteTotals({ lines, serviceCharge, tax, otherFees }) }));
    },
  },
  {
    name: "get_vendor_quote",
    description: "Get one vendor quote: vendor, RFP, status, revision, dates, priced lines (each with the RFP line item it answers), fees, deposit, cancellation, notes, files, and totals.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" } },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => withTotals(await quoteFor(requireString(args, "id"), requireString(args, "eventId"), userId)),
  },
  {
    name: "record_vendor_quote",
    description:
      "Record a vendor's quote for an event: answering a vendor RFP (rfpId — the vendor joins its recipients) or standalone. Price each RFP line item with a line carrying its rfpLineItemId (get_rfp lineItems); extras have none.",
    inputSchema: {
      type: "object",
      properties: { eventId: { type: "string" }, rfpId: { type: ["string", "null"] }, ...quoteProps },
      required: ["eventId", "vendorId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const blank: QuoteWriteArgs = {
        vendorId: "",
        reference: null,
        submittedOn: null,
        validUntil: null,
        revision: 1,
        serviceCharge: null,
        tax: null,
        otherFees: null,
        depositAmount: null,
        depositDue: null,
        cancellationTerms: null,
        notes: null,
        lines: [],
      };
      return createVendorQuoteCore(requireString(args, "eventId"), partialString(args, "rfpId") ?? null, merge(blank, args), userId);
    },
  },
  {
    name: "update_vendor_quote",
    description: "Update a vendor quote; omitted fields are unchanged, null clears, lines replaces the list. Raise revision for a revised quote.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" }, ...quoteProps },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const eventId = requireString(args, "eventId");
      const q = await quoteFor(id, eventId, userId);
      const num = (v: { toString(): string } | null) => (v == null ? null : Number(v.toString()));
      const day = (d: Date | null) => (d ? dateKey(d) : null);
      const current: QuoteWriteArgs = {
        vendorId: q.vendorId,
        reference: q.reference,
        submittedOn: day(q.submittedOn),
        validUntil: day(q.validUntil),
        revision: q.revision,
        serviceCharge: num(q.serviceCharge),
        tax: num(q.tax),
        otherFees: num(q.otherFees),
        depositAmount: num(q.depositAmount),
        depositDue: day(q.depositDue),
        cancellationTerms: q.cancellationTerms,
        notes: q.notes,
        lines: q.lines.map((l) => ({ id: l.id, rfpLineItemId: l.rfpLineItemId, description: l.description, quantity: num(l.quantity), unitPrice: num(l.unitPrice), amount: num(l.amount), notes: l.notes })),
      };
      return updateVendorQuoteCore(id, eventId, merge(current, args), userId);
    },
  },
  {
    name: "award_vendor_quote",
    description:
      "Accept a vendor quote: it becomes ACCEPTED; on an RFP, the RFP's other open quotes become DECLINED and the RFP CLOSED. The vendor is added to the event and to every order the RFP's line items were copied from. Needs VENDORS write.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" } },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => awardVendorQuoteCore(requireString(args, "id"), requireString(args, "eventId"), userId),
  },
  {
    name: "delete_vendor_quote",
    description: "Delete a vendor quote with its lines and files.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" } },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      await deleteVendorQuoteCore(requireString(args, "id"), requireString(args, "eventId"), userId);
      return { ok: true };
    },
  },
];
