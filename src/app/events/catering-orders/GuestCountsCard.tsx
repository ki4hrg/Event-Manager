"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { ReadOnlyField } from "@/components/ReadOnlyField";

type GuestCountsCardProps = {
  expectedCount: number | null;
  confirmedCount: number | null;
  guaranteeCount: number | null;
  action: (formData: FormData) => Promise<void>;
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
    >
      {pending ? "Saving..." : "Save"}
    </button>
  );
}

export function GuestCountsCard({
  expectedCount,
  confirmedCount,
  guaranteeCount,
  action,
}: GuestCountsCardProps) {
  const [editing, setEditing] = useState(false);

  const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6";

  if (!editing) {
    return (
      <div className={cardClass}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Guest Counts</h2>
          <button
            onClick={() => setEditing(true)}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Edit
          </button>
        </div>
        <dl className="grid grid-cols-3 gap-4">
          <ReadOnlyField label="Expected" value={expectedCount != null ? String(expectedCount) : null} />
          <ReadOnlyField label="Confirmed" value={confirmedCount != null ? String(confirmedCount) : null} />
          <ReadOnlyField label="Guarantee" value={guaranteeCount != null ? String(guaranteeCount) : null} />
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label htmlFor="expectedCount" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Expected
            </label>
            <input
              type="number"
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
              id="guaranteeCount"
              name="guaranteeCount"
              defaultValue={guaranteeCount ?? ""}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex gap-3">
          <SaveButton />
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 text-sm"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
