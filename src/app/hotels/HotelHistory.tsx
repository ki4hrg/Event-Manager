import Link from "next/link";
import { BLOCK_TYPE_LABELS } from "@/lib/hotels";
import type { getVenueHotelHistory } from "./actions";

type Proposal = Awaited<ReturnType<typeof getVenueHotelHistory>>[number];

// A hotel's proposals across events, on its venue page.
export function HotelHistory({ proposals }: { proposals: Proposal[] }) {
  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 sm:p-6">
      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-3">Hotel Proposals</h2>
      <ul className="divide-y divide-gray-200 dark:divide-gray-700 text-sm">
        {proposals.map((p) => (
          <li key={p.id} className="py-2 flex flex-wrap justify-between gap-x-3">
            <Link href={`/events/${p.event.id}/hotels/proposals/${p.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
              {p.event.name}
            </Link>
            <span className="text-gray-500 dark:text-gray-400">
              {[p.blockType ? BLOCK_TYPE_LABELS[p.blockType] : null, p.status].filter(Boolean).join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
