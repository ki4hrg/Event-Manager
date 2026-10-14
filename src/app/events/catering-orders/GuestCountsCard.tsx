"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { ReadOnlyField } from "@/components/ReadOnlyField";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";

type GuestCountsCardProps = {
  expectedCount: number | null;
  confirmedCount: number | null;
  guaranteeCount: number | null;
  // Covers actually served — the Post-Event Report's "# fed".
  actualCount: number | null;
  action: (formData: FormData) => Promise<void>;
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${btnPrimary} disabled:opacity-50 text-sm`}
    >
      {pending ? "Saving..." : "Save"}
    </button>
  );
}

export function GuestCountsCard({
  expectedCount,
  confirmedCount,
  guaranteeCount,
  actualCount,
  action,
}: GuestCountsCardProps) {
  const canWrite = useCanWrite("CATERING_ORDERS");
  const [editing, setEditing] = useState(false);

  const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6";

  if (!editing || !canWrite) {
    return (
      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Guest Counts</h2>
          {canWrite && (
            <button
              onClick={() => setEditing(true)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Edit
            </button>
          )}
        </div>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <ReadOnlyField label="Expected" value={expectedCount != null ? String(expectedCount) : null} />
          <ReadOnlyField label="Confirmed" value={confirmedCount != null ? String(confirmedCount) : null} />
          <ReadOnlyField label="Guarantee" value={guaranteeCount != null ? String(guaranteeCount) : null} />
          <ReadOnlyField label="Actual (# fed)" value={actualCount != null ? String(actualCount) : null} />
        </dl>
      </div>
    );
  }

  return (
    <div className={cardClass}>
      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Guest Counts</h2>
      <form
        action={async (formData) => {
          await action(formData);
          setEditing(false);
        }}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label htmlFor="expectedCount" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Expected
            </label>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              id="expectedCount"
              name="expectedCount"
              defaultValue={expectedCount ?? ""}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="confirmedCount" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Confirmed
            </label>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              id="confirmedCount"
              name="confirmedCount"
              defaultValue={confirmedCount ?? ""}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="guaranteeCount" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Guarantee
            </label>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              id="guaranteeCount"
              name="guaranteeCount"
              defaultValue={guaranteeCount ?? ""}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="actualCount" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Actual (# fed)
            </label>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              id="actualCount"
              name="actualCount"
              defaultValue={actualCount ?? ""}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex gap-3">
          <SaveButton />
          <button
            type="button"
            onClick={() => setEditing(false)}
            className={`${btnSecondary} text-sm`}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
