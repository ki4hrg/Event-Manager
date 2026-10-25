// Vendor quotes answering an RFP, lined up against its line items: one
// column per quote, one row per line item (with the quote that won it), then
// each quote's extras and the totals. Shared by the compare page, its print route, the .docx and MCP. Pure.

import type { QuoteStatus } from "@prisma/client";
import { dateKey, formatDateKey, formatMoney } from "@/lib/hotels";
import { lineAmount, QUOTE_STATUS_LABELS, quoteTotals } from "@/lib/rfp/quotes";

type Dec = { toString(): string } | null;

export type QuoteCompareInput = {
  title: string;
  eventName: string;
  lineItems: { id: string; group: string | null; description: string; quantity: number | null; unit: string | null; awardedQuoteId: string | null }[];
  quotes: {
    id: string;
    vendor: string;
    status: QuoteStatus;
    revision: number;
    validUntil: Date | null;
    serviceCharge: Dec;
    tax: Dec;
    otherFees: Dec;
    depositAmount: Dec;
    depositDue: Date | null;
    lines: { rfpLineItemId: string | null; description: string; quantity: Dec; unitPrice: Dec; amount: Dec }[];
  }[];
};

// awarded: this quote won the line.
export type QuoteCompareCell = { text: string; missing: boolean; awarded: boolean };
// Line item rows carry the RFP line's id and the quote that won it (null: open).
export type QuoteCompareRow = { label: string; group: string | null; requested: string; lineItemId: string | null; awardedQuoteId: string | null; cells: QuoteCompareCell[] };

export type QuoteComparison = {
  title: string;
  eventName: string;
  quotes: { id: string; vendor: string; status: string; total: number; linesWon: number }[];
  lines: QuoteCompareRow[];
  extras: string[][]; // per quote: "Description — $amount"
  footer: QuoteCompareRow[];
  lowest: string | null; // id of the lowest total, when two or more quotes
  awarded: number; // line items awarded, of lines.length
};

const money = (n: number | null) => (n == null ? "—" : formatMoney(String(n)));
const dec = (v: Dec) => (v == null ? null : Number(v.toString()));

export function buildQuoteComparison(input: QuoteCompareInput): QuoteComparison {
  const quotes = input.quotes.slice().sort((a, b) => a.vendor.localeCompare(b.vendor));
  const totals = quotes.map((q) => quoteTotals(q));
  const lines: QuoteCompareRow[] = input.lineItems.map((li) => ({
    label: li.description,
    group: li.group,
    requested: li.quantity != null ? `${li.quantity}${li.unit ? ` ${li.unit}` : ""}` : (li.unit ?? ""),
    lineItemId: li.id,
    awardedQuoteId: li.awardedQuoteId,
    cells: quotes.map((q) => {
      const awarded = li.awardedQuoteId === q.id;
      const answers = q.lines.filter((l) => l.rfpLineItemId === li.id);
      if (answers.length === 0) return { text: "not quoted", missing: true, awarded };
      const amount = answers.reduce<number | null>((sum, l) => {
        const a = lineAmount(l);
        return a == null ? sum : (sum ?? 0) + a;
      }, null);
      const qty = answers.length === 1 && answers[0].quantity != null ? Number(answers[0].quantity.toString()) : null;
      const short = qty != null && li.quantity != null && qty < li.quantity;
      return {
        text: [money(amount), qty != null && li.quantity != null && qty !== li.quantity ? `qty ${qty}` : null].filter(Boolean).join(" · "),
        missing: short,
        awarded,
      };
    }),
  }));
  const row = (label: string, cell: (i: number) => string, missing?: (i: number) => boolean): QuoteCompareRow => ({
    label,
    group: null,
    requested: "",
    lineItemId: null,
    awardedQuoteId: null,
    cells: quotes.map((_, i) => ({ text: cell(i), missing: missing?.(i) ?? false, awarded: false })),
  });
  const day = (d: Date | null) => (d ? formatDateKey(dateKey(d)) : "—");
  const lowestTotal = quotes.length > 1 ? Math.min(...totals.map((t) => t.total)) : null;
  return {
    title: input.title,
    eventName: input.eventName,
    quotes: quotes.map((q, i) => ({ id: q.id, vendor: q.vendor, status: `${QUOTE_STATUS_LABELS[q.status]}${q.revision > 1 ? ` · rev ${q.revision}` : ""}`,
      total: totals[i].total,
      linesWon: input.lineItems.filter((li) => li.awardedQuoteId === q.id).length,
    })),
    lines,
    extras: quotes.map((q) =>
      q.lines.filter((l) => !l.rfpLineItemId || !input.lineItems.some((li) => li.id === l.rfpLineItemId)).map((l) => `${l.description} — ${money(lineAmount(l))}`),
    ),
    footer: [
      row("Subtotal", (i) => money(totals[i].subtotal)),
      row("Service charge", (i) => money(dec(quotes[i].serviceCharge))),
      row("Tax", (i) => money(dec(quotes[i].tax))),
      row("Other fees", (i) => money(dec(quotes[i].otherFees))),
      row("Total", (i) => money(totals[i].total)),
      row("Deposit", (i) => [dec(quotes[i].depositAmount) != null ? money(dec(quotes[i].depositAmount)) : null, quotes[i].depositDue ? `due ${day(quotes[i].depositDue)}` : null].filter(Boolean).join(" ") || "—"),
      row("Valid until", (i) => day(quotes[i].validUntil)),
    ],
    lowest: lowestTotal != null ? (quotes.find((_, i) => totals[i].total === lowestTotal)?.id ?? null) : null,
    awarded: input.lineItems.filter((li) => li.awardedQuoteId).length,
  };
}
