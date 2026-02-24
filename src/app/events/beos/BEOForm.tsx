"use client";

import { useFormStatus } from "react-dom";
import type { BEO } from "@prisma/client";

type BEOFormProps = {
  beo?: BEO | null;
  eventId: string;
  action: (formData: FormData) => Promise<void>;
};

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? "Saving..." : isEdit ? "Update BEO" : "Create BEO"}
    </button>
  );
}

export function BEOForm({ beo, eventId, action }: BEOFormProps) {
  const isEdit = !!beo;

  return (
    <form action={action} className="space-y-6 max-w-2xl">
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          BEO Details
        </h2>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              defaultValue={beo?.name}
              placeholder="e.g., Opening Dinner BEO, Lunch Day 1"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="guaranteeCount"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Guarantee Count
              </label>
              <input
                type="number"
                id="guaranteeCount"
                name="guaranteeCount"
                defaultValue={beo?.guaranteeCount ?? ""}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label
                htmlFor="tableSetup"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Table Setup
              </label>
              <input
                type="text"
                id="tableSetup"
                name="tableSetup"
                placeholder="e.g., Rounds of 10, Classroom style"
                defaultValue={beo?.tableSetup || ""}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="menuNotes"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Menu Notes
            </label>
            <textarea
              id="menuNotes"
              name="menuNotes"
              rows={2}
              defaultValue={beo?.menuNotes || ""}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="dietaryNotes"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Dietary Requirements
            </label>
            <textarea
              id="dietaryNotes"
              name="dietaryNotes"
              rows={2}
              placeholder="Vegetarian, vegan, gluten-free, allergies..."
              defaultValue={beo?.dietaryNotes || ""}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="beverageNotes"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Beverage Notes
            </label>
            <textarea
              id="beverageNotes"
              name="beverageNotes"
              rows={2}
              defaultValue={beo?.beverageNotes || ""}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="notes"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Additional Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              defaultValue={beo?.notes || ""}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        <SubmitButton isEdit={isEdit} />
        <a
          href={`/events/${eventId}/beos`}
          className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
