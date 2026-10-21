// Where each RFP recipient stands. Derived, never stored: a recipient has
// responded once a proposal linked to the RFP exists for it. Pure.

import { dateFromKey, dateKey } from "@/lib/hotels";

export type RecipientState = "NOT_SENT" | "AWAITING" | "OVERDUE" | "DECLINED" | "RESPONDED";

export const RECIPIENT_STATE_COLORS: Record<RecipientState, string> = {
  NOT_SENT: "gray",
  AWAITING: "yellow",
  OVERDUE: "red",
  DECLINED: "gray",
  RESPONDED: "green",
};

const DAY = 86_400_000;

export function recipientState(
  r: { sentOn: Date | null; declinedToBid: boolean; responses: number },
  responseDue: Date | null,
  today: string = dateKey(new Date()),
): { state: RecipientState; label: string } {
  if (r.responses > 0) return { state: "RESPONDED", label: r.responses === 1 ? "Responded" : `Responded (${r.responses})` };
  if (r.declinedToBid) return { state: "DECLINED", label: "Declined" };
  if (!r.sentOn) return { state: "NOT_SENT", label: "Not sent" };
  if (!responseDue) return { state: "AWAITING", label: "Awaiting" };
  const days = Math.round((responseDue.getTime() - dateFromKey(today).getTime()) / DAY);
  if (days < 0) return { state: "OVERDUE", label: `Overdue ${-days} day${days === -1 ? "" : "s"}` };
  return { state: "AWAITING", label: days === 0 ? "Due today" : `Due in ${days} day${days === 1 ? "" : "s"}` };
}

// "3 sent · 2 responded · 1 overdue" for an RFP's list row.
export function recipientSummary(states: RecipientState[]): string | null {
  if (states.length === 0) return null;
  const count = (s: RecipientState) => states.filter((x) => x === s).length;
  const sent = states.length - count("NOT_SENT");
  return [
    sent ? `${sent} sent` : null,
    count("RESPONDED") ? `${count("RESPONDED")} responded` : null,
    count("OVERDUE") ? `${count("OVERDUE")} overdue` : null,
    count("DECLINED") ? `${count("DECLINED")} declined` : null,
    count("NOT_SENT") ? `${count("NOT_SENT")} not sent` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
