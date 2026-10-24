"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { HotelPickupMethod } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnPrimary } from "@/lib/buttonStyles";
import { formatNight, nightKeys, roomTypeLabel } from "@/lib/hotels";
import { hasUsableDates, type PickupGuestRow } from "@/lib/pickupMapping";
import { CountEntry, GuestImport, type GuestImportSource } from "../hotels/PickupImport";
import type { getInboxReview } from "./actions";
import type { UserError } from "@/lib/userErrors";

type Review = NonNullable<Awaited<ReturnType<typeof getInboxReview>>>;
type ImportMethod = Exclude<HotelPickupMethod, "COUNTS">;
type CountArgs = { night: string; roomType: string | null; rooms: number };

const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6 space-y-4";
const selectClass =
  "mt-1 block w-full sm:w-96 px-2 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm";
const thClass = "py-1 pr-3 text-left font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap";
const tdClass = "py-1 pr-3 text-gray-900 dark:text-white whitespace-nowrap";

export function InboxReview({
  review,
  itemHref,
  applyGuests,
  applyCounts,
}: {
  review: Review;
  itemHref: string;
  applyGuests: (blockId: string, method: ImportMethod, fileName: string | null, guests: PickupGuestRow[]) => Promise<void | UserError>;
  applyCounts: (blockId: string, counts: CountArgs[]) => Promise<void | UserError>;
}) {
  const router = useRouter();
  const canWrite = useCanWrite("HOTELS");
  const { proposal, blocks } = review;
  const [blockId, setBlockId] = useState(proposal.blockId ?? "");
  const block = blocks.find((b) => b.id === blockId) ?? null;

  if (!canWrite) return null;
  if (blocks.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">This event has no hotel blocks to apply it to.</p>;
  }

  const done = (message: string) => {
    router.push(`${itemHref}?success=${encodeURIComponent(message)}`);
    router.refresh();
  };
  const typed = block ? block.roomTypes.filter((t): t is string => t != null) : [];
  const countTypes = block && block.roomTypes.length > 0 ? block.roomTypes : [null];
  const nights = block ? nightKeys(block.checkIn, block.checkOut) : [];
  const fits = (c: CountArgs) => countTypes.includes(c.roomType) && nights.includes(c.night);
  const proposedCounts = proposal.counts ?? [];
  const shownCounts = proposedCounts.filter(fits);
  const unshown = proposedCounts.filter((c) => !fits(c) && c.rooms > 0);

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Hotel block
        <select value={blockId} onChange={(e) => setBlockId(e.target.value)} className={selectClass}>
          <option value="">Choose a block…</option>
          {blocks.map((b) => (
            <option key={b.id} value={b.id}>
              {b.hotel}
              {b.checkIn && b.checkOut ? ` (${formatNight(b.checkIn)} – ${formatNight(b.checkOut)})` : ""}
            </option>
          ))}
        </select>
      </label>

      {block && proposal.kind === "PICKUP_GUESTS" && review.sheet && (
        <GuestImport
          source={review.sheet satisfies GuestImportSource}
          roomTypes={Array.from(new Set([...typed, ...review.tenantRoomTypes]))}
          hasGuests={block.hasGuests}
          importGuests={(method, fileName, guests) => applyGuests(block.id, method, fileName, guests)}
          done={done}
        />
      )}
      {block && proposal.kind === "PICKUP_COUNTS" && (
        <>
          <CountEntry
            key={block.id}
            nights={nights}
            roomTypes={countTypes}
            initial={shownCounts}
            saveCounts={(counts) => applyCounts(block.id, counts)}
            done={done}
          />
          {unshown.length > 0 && (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Not in this block:{" "}
              {unshown.map((c) => `${roomTypeLabel(c.roomType)} ${formatNight(c.night)}: ${c.rooms}`).join(", ")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
