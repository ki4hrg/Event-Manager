"use client";

import { useFormStatus } from "react-dom";
import type { AVOrder, Equipment } from "@prisma/client";

type AVOrderFormProps = {
  avOrder?: AVOrder | null;
  eventId: string;
  avEquipment: Equipment[];
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
      {pending ? "Saving..." : isEdit ? "Update AV Order" : "Create AV Order"}
    </button>
  );
}

export function AVOrderForm({ avOrder, eventId, avEquipment, action }: AVOrderFormProps) {
  const isEdit = !!avOrder;
  const selectedEquipment = avOrder?.equipment || [];

  return (
    <form action={action} className="space-y-6 max-w-2xl">
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
          AV Order Details
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
              defaultValue={avOrder?.name}
              placeholder="e.g., Main Stage AV, Breakout Room 1 AV"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Equipment
            </label>
            {avEquipment.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No AV equipment options defined.{" "}
                <a href="/settings" className="text-blue-600 hover:underline">
                  Add equipment in Settings
                </a>
              </p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {avEquipment.map((item) => (
                  <label key={item.id} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      name="equipment"
                      value={item.name}
                      defaultChecked={selectedEquipment.includes(item.name)}
                      className="rounded border-gray-300 dark:border-gray-700 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-gray-900 dark:text-white text-sm">{item.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div>
            <label
              htmlFor="notes"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              placeholder="Additional AV requirements or notes..."
              defaultValue={avOrder?.notes || ""}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        <SubmitButton isEdit={isEdit} />
        <a
          href={`/events/${eventId}/av-orders`}
          className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
