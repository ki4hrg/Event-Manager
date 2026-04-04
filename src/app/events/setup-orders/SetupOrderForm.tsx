"use client";

import { useFormStatus } from "react-dom";
import type { SetupOrder, CustomOption } from "@prisma/client";

type SetupOrderFormProps = {
  setupOrder?: SetupOrder | null;
  eventId: string;
  setupTypes: CustomOption[];
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
      {pending ? "Saving..." : isEdit ? "Update Setup Order" : "Create Setup Order"}
    </button>
  );
}

export function SetupOrderForm({ setupOrder, eventId, setupTypes, action }: SetupOrderFormProps) {
  const isEdit = !!setupOrder;

  return (
    <form action={action} className="space-y-6">
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          Setup Order Details
        </h2>

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
              defaultValue={setupOrder?.name}
              placeholder="e.g., Main Ballroom Setup, Breakout Room A"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="setupType" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Setup Type
            </label>
            {setupTypes.length === 0 ? (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                No setup types defined.{" "}
                <a href="/settings" className="text-blue-600 hover:underline">
                  Add setup types in Settings
                </a>
              </p>
            ) : (
              <select
                id="setupType"
                name="setupType"
                defaultValue={setupOrder?.setupType || ""}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Select setup type —</option>
                {setupTypes.map((t) => (
                  <option key={t.id} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={setupOrder?.notes || ""}
              placeholder="Additional setup notes or instructions..."
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        <SubmitButton isEdit={isEdit} />
        <a
          href={`/events/${eventId}/setup-orders`}
          className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
