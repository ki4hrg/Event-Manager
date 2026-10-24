import Link from "next/link";
import { btnSecondary } from "@/lib/buttonStyles";
import { blockTypeLabel, dateKey, formatDateKey, formatMoney, roomTypeLabel } from "@/lib/hotels";
import { spaceSummary } from "@/lib/rfp/proposalSpace";
import type { getHotelProposal } from "../hotels/actions";

type SavedProposal = NonNullable<Awaited<ReturnType<typeof getHotelProposal>>>;

const labelClass = "text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400";

// The proposal one of a message's offers became, shown on that offer's tab.
export function InboxSavedOffer({ proposal, href }: { proposal: SavedProposal; href: string }) {
  const byType = new Map<string, { nights: number; rates: number[] }>();
  for (const n of proposal.nights) {
    const type = roomTypeLabel(n.roomType);
    const row = byType.get(type) ?? { nights: 0, rates: [] };
    row.nights += 1;
    if (n.rate != null) row.rates.push(Number(n.rate));
    byType.set(type, row);
  }
  const rateRange = (rates: number[]) => {
    if (!rates.length) return null;
    const [lo, hi] = [Math.min(...rates), Math.max(...rates)];
    return lo === hi ? formatMoney(lo) : `${formatMoney(lo)}–${formatMoney(hi)}`;
  };
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium text-gray-900 dark:text-white">
            {proposal.venue.name}
            {proposal.revision > 1 && <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">rev {proposal.revision}</span>}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {[
              proposal.status,
              proposal.rfp?.title,
              blockTypeLabel(proposal.contractType, proposal.guestType),
              proposal.checkIn && proposal.checkOut
                ? `${formatDateKey(dateKey(proposal.checkIn))} – ${formatDateKey(dateKey(proposal.checkOut))}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <Link href={href} className={btnSecondary}>
          Open proposal
        </Link>
      </div>
      {byType.size > 0 && (
        <div>
          <p className={labelClass}>Rooms</p>
          <ul className="mt-1 space-y-0.5 text-sm text-gray-900 dark:text-white">
            {Array.from(byType, ([type, r]) => (
              <li key={type}>
                {[type, `${r.nights} night${r.nights === 1 ? "" : "s"}`, rateRange(r.rates)].filter(Boolean).join(" · ")}
              </li>
            ))}
          </ul>
        </div>
      )}
      {proposal.spaces.length > 0 && (
        <div>
          <p className={labelClass}>Function space</p>
          <ul className="mt-1 space-y-0.5 text-sm text-gray-900 dark:text-white">
            {proposal.spaces.map((s) => (
              <li key={s.id}>
                <span className="text-gray-500 dark:text-gray-400">{s.name} · </span>
                {spaceSummary(s)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {proposal.notes && <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line">{proposal.notes}</p>}
    </div>
  );
}
