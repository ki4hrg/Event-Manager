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

type Review = NonNullable<Awaited<ReturnType<typeof getInboxReview>>>;
type ImportMethod = Exclude<HotelPickupMethod, "COUNTS">;
type CountArgs = { night: string; roomType: string | null; rooms: number };

const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6 space-y-4";
const selectClass =
  "mt-1 block w-full sm:w-96 px-2 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm";
const thClass = "py-1 pr-3 text-left font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap";
const tdClass = "py-1 pr-3 text-gray-900 dark:text-white whitespace-nowrap";

// Guests Claude read out of a PDF or the message body: shown as read, applied
// as a whole.
function GuestListApply({
  guests,
  hasGuests,
  apply,
  done,
}: {
  guests: PickupGuestRow[];
  hasGuests: boolean;
  apply: (method: ImportMethod, guests: PickupGuestRow[]) => Promise<void>;
  done: (message: string) => void;
}) {
  const [method, setMethod] = useState<ImportMethod>(hasGuests ? "MERGE" : "APPEND");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const usable = guests.filter(hasUsableDates);
  const skipped = guests.length - usable.length;
  const submit = () =>
    startTransition(async () => {
      setError(null);
      try {
        await apply(method, usable);
        done(`Imported ${usable.length} guest${usable.length === 1 ? "" : "s"}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Import failed");
      }
    });
  return (
    <div className={cardClass}>
      <h2 className="text-lg font-medium text-gray-900 dark:text-white">Guest list</h2>
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr>
              <th className={thClass}>Guest</th>
              <th className={thClass}>Conf #</th>
              <th className={thClass}>Arrive</th>
              <th className={thClass}>Depart</th>
              <th className={thClass}>Room type</th>
              <th className={thClass}>Status</th>
            </tr>
          </thead>
          <tbody>
            {guests.map((g, i) => (
              <tr key={i} className={hasUsableDates(g) ? "" : "opacity-50"}>
                <td className={tdClass}>{g.guestName ?? "—"}</td>
                <td className={tdClass}>{g.confirmationNumber ?? "—"}</td>
                <td className={tdClass}>{g.checkIn ? formatNight(g.checkIn) : "—"}</td>
                <td className={tdClass}>{g.checkOut ? formatNight(g.checkOut) : "—"}</td>
                <td className={tdClass}>{g.roomType ?? "—"}</td>
                <td className={tdClass}>{g.cancelled ? "Cancelled" : (g.rawStatus ?? "")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-700 dark:text-gray-300">
        {(
          [
            ["MERGE", "Merge by confirmation #"],
            ["APPEND", "Add all"],
            ["REPLACE", "Replace all"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex items-center gap-1.5">
            <input type="radio" name="method" checked={method === value} onChange={() => setMethod(value)} />
            {label}
          </label>
        ))}
      </div>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        {usable.length} guest{usable.length === 1 ? "" : "s"} · {usable.filter((g) => g.cancelled).length} cancelled
        {skipped > 0 && <span className="text-red-600 dark:text-red-400"> · {skipped} skipped (dates)</span>}
      </p>
      <button type="button" disabled={pending || usable.length === 0} onClick={submit} className={`${btnPrimary} disabled:opacity-50`}>
        {pending ? "Importing..." : "Import"}
      </button>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

export function InboxReview({
  review,
  itemHref,
  applyGuests,
  applyCounts,
}: {
  review: Review;
  itemHref: string;
  applyGuests: (blockId: string, method: ImportMethod, fileName: string | null, guests: PickupGuestRow[]) => Promise<void>;
  applyCounts: (blockId: string, counts: CountArgs[]) => Promise<void>;
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
      {block && proposal.kind === "PICKUP_GUESTS" && !review.sheet && (
        <GuestListApply
          guests={proposal.guests ?? []}
          hasGuests={block.hasGuests}
          apply={(method, guests) => applyGuests(block.id, method, review.fileName, guests)}
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
