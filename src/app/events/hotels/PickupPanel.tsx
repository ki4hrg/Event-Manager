"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { HotelPickupMethod } from "@prisma/client";
import { useCanDelete, useCanWrite } from "@/components/PermissionsProvider";
import { formatDateKey, formatNight } from "@/lib/hotels";
import { btnOutlinedSm } from "@/lib/buttonStyles";

const METHOD_LABELS: Record<HotelPickupMethod, string> = {
  APPEND: "Added",
  MERGE: "Merged",
  REPLACE: "Replaced",
  COUNTS: "Counts",
};

type Guest = {
  id: string;
  guestName: string | null;
  confirmationNumber: string | null;
  checkIn: string | null;
  checkOut: string | null;
  roomType: string | null;
  cancelled: boolean;
  bookedOn: string | null;
  cancelledOn: string | null;
};

// Guest list, entered counts, and import history for a block.
export function PickupPanel({
  pickupHref,
  guests,
  guestTotal,
  showAllHref,
  counts,
  imports,
  timezone,
  clear,
}: {
  pickupHref: string;
  guests: Guest[];
  guestTotal: number;
  // The page with the guest list's cap lifted.
  showAllHref: string;
  counts: { night: string; roomType: string | null; rooms: number }[];
  imports: { id: string; method: HotelPickupMethod; fileName: string | null; inserted: number; updated: number; createdAt: Date; by: string | null }[];
  timezone: string;
  clear: () => Promise<void>;
}) {
  const router = useRouter();
  const canWrite = useCanWrite("HOTELS");
  const canDelete = useCanDelete("HOTELS");
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const active = guests.filter((g) => !g.cancelled).length;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Pickup</h2>
        <div className="flex items-center gap-3 text-sm">
          {canWrite && (
            <Link href={pickupHref} className={btnOutlinedSm}>
              Import / enter
            </Link>
          )}
          {canDelete && (guestTotal > 0 || counts.length > 0) &&
            (confirming ? (
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await clear();
                      setConfirming(false);
                      router.refresh();
                    })
                  }
                  className="text-red-600 dark:text-red-400 font-medium hover:underline disabled:opacity-50"
                >
                  Clear all?
                </button>
                <button type="button" disabled={pending} onClick={() => setConfirming(false)} className="text-gray-500 dark:text-gray-400 hover:underline disabled:opacity-50">
                  Cancel
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className="text-red-600 dark:text-red-400 hover:underline">
                Clear
              </button>
            ))}
        </div>
      </div>

      {guestTotal === 0 && counts.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No pickup yet.</p>
      ) : null}

      {guestTotal > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-gray-700 dark:text-gray-300">
            {guestTotal} guest{guestTotal === 1 ? "" : "s"} · {active} active
            {guests.length < guestTotal && ` (first ${guests.length} shown)`}
          </summary>
          {guests.length < guestTotal && (
            <Link href={showAllHref} className="mt-2 inline-block text-sm text-blue-600 dark:text-blue-400 hover:underline">
              Show all {guestTotal}
            </Link>
          )}
          <ul className="mt-2 divide-y divide-gray-100 dark:divide-gray-700 text-sm">
            {guests.map((g) => (
              <li key={g.id} className={`py-1.5 flex flex-wrap justify-between gap-x-3 ${g.cancelled ? "line-through text-gray-400 dark:text-gray-500" : "text-gray-900 dark:text-white"}`}>
                <span>
                  {g.guestName ?? "—"}
                  {g.confirmationNumber && <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">#{g.confirmationNumber}</span>}
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                  {[
                    g.roomType,
                    g.checkIn && g.checkOut ? `${formatDateKey(g.checkIn)} – ${formatDateKey(g.checkOut)}` : null,
                    g.bookedOn ? `booked ${formatDateKey(g.bookedOn)}` : null,
                    g.cancelledOn ? `cancelled ${formatDateKey(g.cancelledOn)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  {canWrite && (
                    <Link
                      href={`${pickupHref}?guest=${g.id}#guest-${g.id}`}
                      className="ml-2 inline-block text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Edit
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {counts.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-gray-700 dark:text-gray-300">
            {counts.reduce((s, c) => s + c.rooms, 0)} room nights entered
          </summary>
          <ul className="mt-2 divide-y divide-gray-100 dark:divide-gray-700 text-sm">
            {counts.map((c, i) => (
              <li key={i} className="py-1.5 flex justify-between gap-3 text-gray-900 dark:text-white">
                <span>
                  {formatNight(c.night)}
                  {c.roomType && <span className="text-gray-500 dark:text-gray-400"> · {c.roomType}</span>}
                </span>
                <span>{c.rooms}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {imports.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-gray-700 dark:text-gray-300">History ({imports.length})</summary>
          <ul className="mt-2 space-y-1 text-xs text-gray-600 dark:text-gray-400">
            {imports.map((i) => (
              <li key={i.id}>
                {i.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: timezone })} ·{" "}
                {METHOD_LABELS[i.method]}
                {i.fileName && ` ${i.fileName}`} · {i.inserted} new{i.updated > 0 && `, ${i.updated} updated`}
                {i.by && ` · ${i.by}`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
