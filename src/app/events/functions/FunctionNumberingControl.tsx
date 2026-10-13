"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnOutlinedSm } from "@/lib/buttonStyles";

// Function numbers follow the schedule while planning; once the ESG is issued
// they're locked (see src/lib/functionNumbering.ts).
export function FunctionNumberingControl({
  eventId,
  lockedAt,
  renumber,
}: {
  eventId: string;
  lockedAt: string | null;
  renumber: (clearPins: boolean) => Promise<void>;
}) {
  const canWrite = useCanWrite("FUNCTIONS");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [clearPins, setClearPins] = useState(false);

  if (lockedAt) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Function numbers are locked (ESG issued {new Date(lockedAt).toLocaleDateString()}). New functions get
        intermediate numbers.{" "}
        <Link href={`/events/${eventId}/specifications`} className="text-blue-600 dark:text-blue-400 hover:underline">
          Specifications
        </Link>
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
      <span>Function numbers follow the schedule until the ESG is issued.</span>
      {canWrite &&
        (confirming ? (
          <>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={clearPins}
                onChange={(e) => setClearPins(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              Also clear manual overrides
            </label>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await renumber(clearPins);
                  setConfirming(false);
                  router.refresh();
                })
              }
              className={`${btnOutlinedSm} disabled:opacity-50`}
            >
              {pending ? "Renumbering…" : "Renumber now"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-gray-500 dark:text-gray-400 hover:underline"
            >
              Cancel
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className={btnOutlinedSm}>
            Renumber chronologically
          </button>
        ))}
    </div>
  );
}
