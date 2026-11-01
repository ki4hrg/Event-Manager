"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { resourceForKind } from "@/lib/rfp/kinds";
import { withUserErrors } from "@/lib/userErrors";
import { idList, idSchema, parseArgs, readJsonList } from "@/lib/validation";
import {
  awardVendorQuoteCore,
  clearRfpLineAwardsCore,
  createVendorQuoteCore,
  deleteVendorQuoteCore,
  getQuoteComparisonCore,
  quoteResource,
  recordNoAwardCore,
  setVendorQuoteStatusCore,
  updateVendorQuoteCore,
  QuoteLineSchema,
  type QuoteWriteArgs,
} from "./core";

const quotePath = (eventId: string, id: string) => `/events/${eventId}/quotes/${id}`;
const rfpPath = (eventId: string, rfpId: string) => `/events/${eventId}/rfps/${rfpId}`;

// The quote's RFP (for its permission resource); a foreign id is a not-found.
async function quoteRfp(id: string, eventId: string) {
  const quote = await prisma.vendorQuote.findFirst({ where: { id, eventId }, select: { rfpId: true, rfp: { select: { kind: true } } } });
  if (!quote) notFound();
  return quote;
}

export async function getVendorQuote(id: string, eventId: string) {
  const found = await prisma.vendorQuote.findFirst({ where: { id, eventId }, select: { rfp: { select: { kind: true } } } });
  if (!found) return null;
  await requirePermission(quoteResource(found.rfp), "VIEW", eventId);
  return prisma.vendorQuote.findFirst({
    where: { id, eventId },
    include: {
      vendor: { select: { id: true, name: true } },
      rfp: { select: { id: true, kind: true, title: true, status: true } },
      lines: { orderBy: { sortOrder: "asc" } },
      files: { orderBy: { createdAt: "desc" } },
      updatedBy: { select: { name: true, email: true } },
    },
  });
}

// Quotes that answer no RFP, for the RFPs page.
export async function getStandaloneQuotes(eventId: string) {
  await requirePermission("EVENTS", "VIEW", eventId);
  return prisma.vendorQuote.findMany({
    where: { eventId, rfpId: null },
    select: { id: true, status: true, revision: true, reference: true, submittedOn: true, vendor: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
}

// What the quote form needs: the tenant's vendors and, on an RFP, its line
// items to price.
export async function getQuoteFormChoices(eventId: string, rfpId: string | null) {
  const rfp = rfpId ? await prisma.rfp.findFirst({ where: { id: rfpId, eventId }, select: { id: true, kind: true } }) : null;
  if (rfpId && !rfp) notFound();
  const session = await requirePermission(rfp ? resourceForKind(rfp.kind) : "EVENTS", "VIEW", eventId);
  const [vendors, lineItems] = await Promise.all([
    prisma.vendor.findMany({
      where: { tenantId: session.tenantId, isSystemVendor: false, venueId: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    rfp
      ? prisma.rfpLineItem.findMany({
          where: { rfpId: rfp.id },
          select: { id: true, group: true, description: true, quantity: true, unit: true },
          orderBy: { sortOrder: "asc" },
        })
      : [],
  ]);
  return { vendors, lineItems };
}

export async function getQuoteComparison(rfpId: string, eventId: string) {
  const rfp = await prisma.rfp.findFirst({ where: { id: rfpId, eventId }, select: { kind: true } });
  if (!rfp || rfp.kind === "HOTEL") return null;
  const session = await requirePermission(resourceForKind(rfp.kind), "VIEW", eventId);
  return getQuoteComparisonCore(rfpId, eventId, session.user.id);
}

function readQuote(formData: FormData): QuoteWriteArgs {
  const str = (k: string) => (formData.get(k) as string) || null;
  const num = (k: string) => (formData.get(k) ? Number(formData.get(k)) : null);
  const lines = readJsonList(formData, "lines", QuoteLineSchema);
  return {
    vendorId: formData.get("vendorId") as string,
    reference: str("reference"),
    submittedOn: str("submittedOn"),
    validUntil: str("validUntil"),
    revision: formData.get("revision") ? parseInt(formData.get("revision") as string) : 1,
    serviceCharge: num("serviceCharge"),
    tax: num("tax"),
    otherFees: num("otherFees"),
    depositAmount: num("depositAmount"),
    depositDue: str("depositDue"),
    cancellationTerms: str("cancellationTerms"),
    notes: str("notes"),
    lines,
  };
}

export async function createVendorQuote(eventId: string, rfpId: string | null, formData: FormData) {
  const rfp = rfpId ? await prisma.rfp.findFirst({ where: { id: rfpId, eventId }, select: { kind: true } }) : null;
  if (rfpId && !rfp) notFound();
  const session = await requirePermission(rfp ? resourceForKind(rfp.kind) : "EVENTS", "WRITE", eventId);
  const quote = await createVendorQuoteCore(eventId, rfpId, readQuote(formData), session.user.id);
  if (rfpId) revalidatePath(rfpPath(eventId, rfpId));
  revalidatePath(`/events/${eventId}/rfps`);
  redirect(`${quotePath(eventId, quote.id)}?success=Quote recorded`);
}

// The quote page autosaves: no redirect. Returns each posted line's saved id.
export async function saveVendorQuote(id: string, eventId: string, formData: FormData) {
  const quote = await quoteRfp(id, eventId);
  const session = await requirePermission(quoteResource(quote.rfp), "WRITE", eventId);
  const { lineIds } = await updateVendorQuoteCore(id, eventId, readQuote(formData), session.user.id);
  revalidatePath(quotePath(eventId, id));
  if (quote.rfpId) revalidatePath(rfpPath(eventId, quote.rfpId));
  return lineIds;
}

export async function deleteVendorQuote(id: string, eventId: string) {
  const quote = await quoteRfp(id, eventId);
  const session = await requirePermission(quoteResource(quote.rfp), "DELETE", eventId);
  await deleteVendorQuoteCore(id, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/rfps`);
  if (quote.rfpId) {
    revalidatePath(rfpPath(eventId, quote.rfpId));
    redirect(`${rfpPath(eventId, quote.rfpId)}?success=Quote deleted`);
  }
  redirect(`/events/${eventId}/rfps?success=Quote deleted`);
}

// Accept the whole quote: it wins the RFP's open lines.
export async function awardVendorQuote(id: string, eventId: string, declineOthers: boolean) {
  const quote = await quoteRfp(id, eventId);
  const session = await requirePermission(quoteResource(quote.rfp), "WRITE", eventId);
  return withUserErrors(async () => {
    const { orders } = await awardVendorQuoteCore(id, eventId, session.user.id, declineOthers);
    revalidatePath(quotePath(eventId, id));
    revalidatePath(`/events/${eventId}/rfps`);
    revalidatePath(`/events/${eventId}/vendors`);
    if (quote.rfpId) revalidatePath(rfpPath(eventId, quote.rfpId));
    const message = orders ? `Quote accepted; vendor added to the event and ${orders} order${orders === 1 ? "" : "s"}` : "Quote accepted; vendor added to the event";
    redirect(`${quotePath(eventId, id)}?success=${encodeURIComponent(message)}`);
  });
}

// From the comparison: award RFP lines to a quote (taking them from any
// other), or with no quote take the award off them. The client refreshes.
export async function setRfpLineAward(rfpId: string, eventId: string, lineItemIds: string[], quoteId: string | null) {
  const rfp = await prisma.rfp.findFirst({ where: { id: rfpId, eventId }, select: { kind: true } });
  if (!rfp) notFound();
  const session = await requirePermission(resourceForKind(rfp.kind), "WRITE", eventId);
  lineItemIds = parseArgs(idList(5_000), lineItemIds);
  quoteId = parseArgs(idSchema.nullable(), quoteId);
  if (quoteId) {
    // The quote must answer this RFP; the core checks the lines are its RFP's.
    const quote = await prisma.vendorQuote.findFirst({ where: { id: quoteId, eventId, rfpId }, select: { id: true } });
    if (!quote) notFound();
    await awardVendorQuoteCore(quoteId, eventId, session.user.id, false, lineItemIds);
    revalidatePath(quotePath(eventId, quoteId));
    revalidatePath(`/events/${eventId}/vendors`);
  } else {
    await clearRfpLineAwardsCore(rfpId, eventId, lineItemIds, session.user.id);
  }
  revalidatePath(`/events/${eventId}/rfps`);
  revalidatePath(rfpPath(eventId, rfpId));
  revalidatePath(`${rfpPath(eventId, rfpId)}/compare`);
}

// Decline / reopen a quote, or withdraw its award (optionally taking the
// vendor off the RFP's orders).
export async function setVendorQuoteStatus(id: string, eventId: string, status: string, removeFromOrders: boolean) {
  const quote = await quoteRfp(id, eventId);
  const session = await requirePermission(quoteResource(quote.rfp), "WRITE", eventId);
  const next = status === "DECLINED" ? "DECLINED" : "RECEIVED";
  const { orders } = await setVendorQuoteStatusCore(id, eventId, next, removeFromOrders, session.user.id);
  revalidatePath(quotePath(eventId, id));
  revalidatePath(`/events/${eventId}/rfps`);
  if (removeFromOrders) revalidatePath(`/events/${eventId}/vendors`);
  if (quote.rfpId) revalidatePath(rfpPath(eventId, quote.rfpId));
  const message = removeFromOrders
    ? `Award withdrawn; vendor removed from ${orders} order${orders === 1 ? "" : "s"}`
    : next === "DECLINED"
      ? "Quote declined"
      : "Quote reopened";
  redirect(`${quotePath(eventId, id)}?success=${encodeURIComponent(message)}`);
}

// No vendor awarded: open quotes declined, RFP closed.
export async function recordNoAward(rfpId: string, eventId: string) {
  const rfp = await prisma.rfp.findFirst({ where: { id: rfpId, eventId }, select: { kind: true } });
  if (!rfp) notFound();
  const session = await requirePermission(resourceForKind(rfp.kind), "WRITE", eventId);
  return withUserErrors(async () => {
    const { declined } = await recordNoAwardCore(rfpId, eventId, session.user.id);
    revalidatePath(`/events/${eventId}/rfps`);
    revalidatePath(rfpPath(eventId, rfpId));
    const message = declined ? `No award; ${declined} quote${declined === 1 ? "" : "s"} declined` : "No award recorded";
    redirect(`${rfpPath(eventId, rfpId)}?success=${encodeURIComponent(message)}`);
  });
}
