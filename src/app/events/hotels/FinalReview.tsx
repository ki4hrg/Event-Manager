"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import type { UserError } from "@/lib/userErrors";
import type { PickupGuestRow } from "@/lib/pickupMapping";
import { GuestImport } from "./PickupImport";

// The final review's two writes: loading the hotel's final guest list, and
// the sign-off.

const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6 space-y-3";
const inputClass =
  "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm";
const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300";

export function FinalListPanel({
  reviewHref,
  roomTypes,
  loaded,
  load,
  clear,
}: {
  reviewHref: string;
  roomTypes: string[];
  loaded: { fileName: string | null; at: string; stays: number } | null;
  load: (fileName: string | null, guests: PickupGuestRow[]) => Promise<void | UserError>;
  clear: () => Promise<void>;
}) {
  const router = useRouter();
  const canWrite = useCanWrite("HOTELS");
  // A loaded list shows its summary; replacing it opens the import again.
  const [replacing, setReplacing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [pending, startTransition] = useTransition();
  const done = (message: string) => {
    setReplacing(false);
    router.push(`${reviewHref}?success=${encodeURIComponent(message)}`);
    router.refresh();
  };

  if (loaded && !replacing) {
    return (
      <div className={cardClass}>
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Hotel&apos;s final guest list</h2>
        <p className="text-sm text-gray-700 dark:text-gray-300 break-words">
          {[loaded.fileName, `${loaded.stays} stay${loaded.stays === 1 ? "" : "s"}`, `loaded ${loaded.at}`].filter(Boolean).join(" · ")}
        </p>
        {canWrite && (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setReplacing(true)} className={btnSecondary}>
              Replace
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                confirmClear
                  ? startTransition(async () => {
                      await clear();
                      setConfirmClear(false);
                      router.refresh();
                    })
                  : setConfirmClear(true)
              }
              className="text-sm text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
            >
              {confirmClear ? "Remove the final list?" : "Remove"}
            </button>
            {confirmClear && !pending && (
              <button type="button" onClick={() => setConfirmClear(false)} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
                Cancel
              </button>
            )}
          </div>
        )}
      </div>
    );
  }
  if (!canWrite) {
    return (
      <div className={cardClass}>
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Hotel&apos;s final guest list</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">Not loaded yet.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <GuestImport roomTypes={roomTypes} hasGuests={false} importGuests={(_method, fileName, guests) => load(fileName, guests)} done={done} final />
      {replacing && (
        <button type="button" onClick={() => setReplacing(false)} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
          Keep the loaded list
        </button>
      )}
    </div>
  );
}

function SubmitButton({ label, name, value, secondary }: { label: string; name?: string; value?: string; secondary?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} className={`${secondary ? btnSecondary : btnPrimary} disabled:opacity-50`}>
      {pending ? "Saving..." : label}
    </button>
  );
}

export function ReviewSignOff({
  reviewedOn,
  reviewedBy,
  notes,
  today,
  action,
}: {
  reviewedOn: string | null; // YYYY-MM-DD
  reviewedBy: string | null;
  notes: string | null;
  today: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const canWrite = useCanWrite("HOTELS");
  return (
    <form action={action} className={cardClass}>
      <h2 className="text-lg font-medium text-gray-900 dark:text-white">Sign-off</h2>
      <fieldset disabled={!canWrite} className="space-y-3">
        <div>
          <label htmlFor="review-reviewedOn" className={labelClass}>
            Reviewed on
          </label>
          <input id="review-reviewedOn" type="date" name="reviewedOn" defaultValue={reviewedOn ?? today} className={inputClass} />
          {reviewedOn && reviewedBy && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">By {reviewedBy}</p>}
        </div>
        <div>
          <label htmlFor="review-notes" className={labelClass}>
            Notes
          </label>
          <textarea id="review-notes" name="reviewNotes" rows={4} defaultValue={notes ?? ""} className={inputClass} />
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-3">
            <SubmitButton label={reviewedOn ? "Save" : "Mark reviewed"} />
            {reviewedOn && <SubmitButton label="Reopen" name="reopen" value="true" secondary />}
          </div>
        )}
      </fieldset>
    </form>
  );
}
