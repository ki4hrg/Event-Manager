"use client";

import { useFormStatus } from "react-dom";
import type { BEO } from "@prisma/client";
import type { CustomOption } from "@prisma/client";

type BEOFormProps = {
  beo?: BEO | null;
  eventId: string;
  action: (formData: FormData) => Promise<void>;
  serviceStyleOptions: CustomOption[];
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

function formatDateForInput(date: Date | null | undefined): string {
  if (!date) return "";
  return new Date(date).toISOString().split("T")[0];
}

export function BEOForm({ beo, eventId, action, serviceStyleOptions }: BEOFormProps) {
  const isEdit = !!beo;

  return (
    <form action={action} className="space-y-6 max-w-2xl">
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Details</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
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

          <div>
            <label htmlFor="serviceStyle" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Service Style
            </label>
            <select
              id="serviceStyle"
              name="serviceStyle"
              defaultValue={beo?.serviceStyle || ""}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Select —</option>
              {serviceStyleOptions.map((opt) => (
                <option key={opt.id} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Guest Counts</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="expectedCount" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Expected
            </label>
            <input
              type="number"
              id="expectedCount"
              name="expectedCount"
              defaultValue={beo?.expectedCount ?? ""}
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
              defaultValue={beo?.confirmedCount ?? ""}
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
              defaultValue={beo?.guaranteeCount ?? ""}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Deadlines & Minimums</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="depositDeadline" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Deposit Deadline
              </label>
              <input
                type="date"
                id="depositDeadline"
                name="depositDeadline"
                defaultValue={formatDateForInput(beo?.depositDeadline)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="guaranteeDeadline" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Guarantee Deadline
              </label>
              <input
                type="date"
                id="guaranteeDeadline"
                name="guaranteeDeadline"
                defaultValue={formatDateForInput(beo?.guaranteeDeadline)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="paymentDeadline" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Payment Deadline
              </label>
              <input
                type="date"
                id="paymentDeadline"
                name="paymentDeadline"
                defaultValue={formatDateForInput(beo?.paymentDeadline)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="rentalMinimum" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Rental Minimum ($)
              </label>
              <input
                type="number"
                id="rentalMinimum"
                name="rentalMinimum"
                step="0.01"
                defaultValue={beo?.rentalMinimum != null ? String(beo.rentalMinimum) : ""}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="fbMinimum" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                F&B Minimum ($)
              </label>
              <input
                type="number"
                id="fbMinimum"
                name="fbMinimum"
                step="0.01"
                defaultValue={beo?.fbMinimum != null ? String(beo.fbMinimum) : ""}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Staffing</h2>
        <textarea
          id="staffingNotes"
          name="staffingNotes"
          rows={3}
          placeholder="e.g., 2 servers, 1 manager, banquet captain..."
          defaultValue={beo?.staffingNotes || ""}
          className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Notes</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="dietaryNotes" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
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
            <label htmlFor="cancellationTerms" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Cancellation / Attrition Terms
            </label>
            <textarea
              id="cancellationTerms"
              name="cancellationTerms"
              rows={2}
              defaultValue={beo?.cancellationTerms || ""}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
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
