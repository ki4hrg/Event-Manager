import Link from "next/link";
import { colorClasses } from "@/lib/colors";
import { rfpHref } from "@/lib/rfp/kinds";
import { QUOTE_STATUS_LABELS } from "@/lib/rfp/quotes";
import { RECIPIENT_STATE_COLORS, recipientState } from "@/lib/rfp/recipients";
import type { getRfpHistory } from "./actions";

type History = Awaited<ReturnType<typeof getRfpHistory>>;
type Response = { id: string; label: string; href: string };
type Row = {
  key: string;
  event: { id: string; name: string };
  title: string;
  href: string | null;
  badge: { label: string; color: string } | null;
  responses: Response[];
};

const link = "text-blue-600 dark:text-blue-400 hover:underline";

// The RFPs a vendor or hotel was sent, with its quotes or proposals, on its
// vendor or venue page (getRfpHistory).
export function RfpHistoryPanel({ history }: { history: History }) {
  const quoteLabel = (q: History["quotes"][number]) => `Quote · ${QUOTE_STATUS_LABELS[q.status]}${q.revision > 1 ? ` · rev ${q.revision}` : ""}`;
  const placed = new Set<string>();
  const rows: Row[] = history.recipients.map((r) => {
    const quotes = history.quotes.filter((q) => q.rfpId === r.rfp.id);
    quotes.forEach((q) => placed.add(q.id));
    const responses: Response[] = [
      ...quotes.map((q) => ({ id: q.id, label: quoteLabel(q), href: `/events/${r.rfp.event.id}/quotes/${q.id}` })),
      ...history.proposals
        .filter((p) => p.rfpId === r.rfp.id)
        .map((p) => ({ id: p.id, label: `Proposal · ${p.status}`, href: `/events/${r.rfp.event.id}/hotels/proposals/${p.id}` })),
    ];
    const { state, label } = recipientState({ sentOn: r.sentOn, declinedToBid: r.declinedToBid, responses: responses.length }, r.rfp.responseDue);
    return {
      key: r.id,
      event: r.rfp.event,
      title: r.rfp.title,
      href: rfpHref(r.rfp.event.id, r.rfp.kind, r.rfp.id),
      badge: { label, color: RECIPIENT_STATE_COLORS[state] },
      responses,
    };
  });
  for (const q of history.quotes) {
    if (placed.has(q.id)) continue;
    rows.push({
      key: q.id,
      event: q.event,
      title: q.rfpId ? "Quote" : "Quote without an RFP",
      href: null,
      badge: null,
      responses: [{ id: q.id, label: quoteLabel(q), href: `/events/${q.event.id}/quotes/${q.id}` }],
    });
  }
  if (rows.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 sm:p-6 min-w-0">
      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-3">RFPs</h2>
      <ul className="divide-y divide-gray-200 dark:divide-gray-700 text-sm">
        {rows.map((r) => (
          <li key={r.key} className="py-2 space-y-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="min-w-0 break-words">
                <span className="text-gray-500 dark:text-gray-400">{r.event.name} · </span>
                {r.href ? (
                  <Link href={r.href} className={link}>
                    {r.title}
                  </Link>
                ) : (
                  <span className="text-gray-900 dark:text-white">{r.title}</span>
                )}
              </p>
              {r.badge && <span className={`px-2 py-0.5 rounded text-xs font-medium ${colorClasses[r.badge.color]}`}>{r.badge.label}</span>}
            </div>
            {r.responses.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {r.responses.map((x) => (
                  <Link key={x.id} href={x.href} className={link}>
                    {x.label}
                  </Link>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
