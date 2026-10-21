"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnPrimary } from "@/lib/buttonStyles";
import type { getDeclineReview } from "./actions";

type Review = NonNullable<Awaited<ReturnType<typeof getDeclineReview>>>;

const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6 space-y-4";
const inputClass =
  "mt-1 block w-full px-2 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm";

// A hotel declining an RFP: pick the RFP and the hotel, then mark it.
export function InboxDeclineReview({
  review,
  itemHref,
  apply,
}: {
  review: Review;
  itemHref: string;
  apply: (rfpId: string, venueId: string, reason: string | null) => Promise<void>;
}) {
  const router = useRouter();
  const canWrite = useCanWrite("HOTELS");
  const [rfpId, setRfpId] = useState(review.decline.rfpId ?? (review.rfps.length === 1 ? review.rfps[0].id : ""));
  const [venueId, setVenueId] = useState(review.decline.venueId ?? "");
  const [reason, setReason] = useState(review.decline.reason ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canWrite) return null;
  if (review.rfps.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">This event has no RFPs to record it on.</p>;
  }
  const rfp = review.rfps.find((r) => r.id === rfpId) ?? null;
  const hotel = rfp?.hotels.find((h) => h.id === venueId) ?? null;

  const submit = () =>
    startTransition(async () => {
      setError(null);
      try {
        await apply(rfpId, venueId, reason.trim() || null);
        router.push(`${itemHref}?success=${encodeURIComponent("Marked declined")}`);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't mark it declined");
      }
    });

  return (
    <div className={cardClass}>
      <h2 className="text-lg font-medium text-gray-900 dark:text-white">Hotel declined</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="text-sm text-gray-700 dark:text-gray-300">
          RFP
          <select
            value={rfpId}
            onChange={(e) => {
              setRfpId(e.target.value);
              setVenueId("");
            }}
            className={inputClass}
          >
            <option value="">Choose an RFP…</option>
            {review.rfps.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-gray-700 dark:text-gray-300">
          Hotel
          <select value={venueId} onChange={(e) => setVenueId(e.target.value)} disabled={!rfp} className={inputClass}>
            <option value="">Choose a hotel…</option>
            {rfp?.hotels.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
                {h.declined ? " (declined)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-gray-700 dark:text-gray-300 sm:col-span-2">
          Reason
          <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
        </label>
      </div>
      {rfp && rfp.hotels.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">This RFP hasn&apos;t gone to any hotels.</p>}
      <button type="button" disabled={pending || !rfp || !hotel} onClick={submit} className={`${btnPrimary} disabled:opacity-50`}>
        {pending ? "Saving..." : "Mark declined"}
      </button>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
