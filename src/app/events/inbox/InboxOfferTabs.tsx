import Link from "next/link";
import type { getInboundOffers } from "./actions";

type InboundOffer = Awaited<ReturnType<typeof getInboundOffers>>[number];

const STATE_LABELS: Record<InboundOffer["state"], string | null> = { OPEN: null, SAVING: "Saving", SAVED: "Saved", SKIPPED: "Skipped" };

// One tab per hotel when a message offers several (?offer=<n>, 1-based).
export function InboxOfferTabs({ offers, active, itemHref }: { offers: InboundOffer[]; active: number; itemHref: string }) {
  if (offers.length <= 1) return null;
  return (
    <div className="border-b border-gray-200 dark:border-gray-700">
      <nav className="-mb-px flex gap-6 overflow-x-auto whitespace-nowrap">
        {offers.map((o, i) => {
          const state = STATE_LABELS[o.state];
          return (
            <Link
              key={i}
              href={`${itemHref}?offer=${i + 1}`}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                i === active
                  ? "border-blue-600 dark:border-blue-400 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
            >
              {o.name}
              {state && <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{state}</span>}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
