// Vendor quotes: labels and money math shared by the quote form, the RFP
// comparison and the .docx. Pure.

import type { QuoteStatus } from "@prisma/client";

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = { RECEIVED: "Received", ACCEPTED: "Accepted", DECLINED: "Declined" };
export const QUOTE_STATUS_COLORS: Record<QuoteStatus, string> = { RECEIVED: "blue", ACCEPTED: "green", DECLINED: "gray" };

type Num = number | { toString(): string } | null;
const n = (v: Num) => (v == null ? null : Number(v.toString()));

// A line's amount: as quoted, else quantity × unit price; null when neither.
export function lineAmount(l: { quantity: Num; unitPrice: Num; amount: Num }): number | null {
  const amount = n(l.amount);
  if (amount != null) return amount;
  const qty = n(l.quantity);
  const unit = n(l.unitPrice);
  return unit != null ? Math.round((qty ?? 1) * unit * 100) / 100 : null;
}

export function quoteTotals(q: { lines: { quantity: Num; unitPrice: Num; amount: Num }[]; serviceCharge: Num; tax: Num; otherFees: Num }) {
  const subtotal = q.lines.reduce((sum, l) => sum + (lineAmount(l) ?? 0), 0);
  const fees = (n(q.serviceCharge) ?? 0) + (n(q.tax) ?? 0) + (n(q.otherFees) ?? 0);
  const round = (v: number) => Math.round(v * 100) / 100;
  return { subtotal: round(subtotal), fees: round(fees), total: round(subtotal + fees) };
}
