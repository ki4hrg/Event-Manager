"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { ReadOnlyField } from "@/components/ReadOnlyField";
import { VendorLinkControl, type VendorLinkEditProps } from "@/app/events/vendors/VendorLinkControl";

type PrintOrderData = {
  id: string;
  name: string;
  notes?: string | null;
};

type PrintOrderFormProps = {
  printOrder?: PrintOrderData | null;
  eventId: string;
  action: (formData: FormData) => Promise<void>;
  vendorLink?: VendorLinkEditProps;
  availableVendors?: { id: string; label: string }[];
  cancelPath?: string;
  defaultName?: string;
  noCard?: boolean;
};

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? "Saving..." : isEdit ? "Update Print Order" : "Create Print Order"}
    </button>
  );
}

export function PrintOrderForm({
  printOrder,
  eventId,
  action,
  vendorLink,
  availableVendors = [],
  cancelPath,
  defaultName,
  noCard = false,
}: PrintOrderFormProps) {
  const isEdit = !!printOrder;
  const [editing, setEditing] = useState(false);

  const cardClass = noCard ? "" : "bg-white dark:bg-gray-800 shadow rounded-lg p-6";

  if (isEdit && !editing) {
    return (
      <div className={cardClass}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Print Order Details</h2>
          <button
            onClick={() => setEditing(true)}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Edit
          </button>
        </div>
        <dl className="space-y-4">
          <ReadOnlyField label="Name" value={printOrder.name} />
          <ReadOnlyField label="Notes" value={printOrder.notes ?? null} />
          {vendorLink && <VendorLinkControl mode="edit" {...vendorLink} />}
        </dl>
      </div>
    );
  }

  return (
    <form
      action={async (formData) => {
        await action(formData);
        if (isEdit) setEditing(false);
      }}
    >
      <div className={cardClass}>
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Print Order Details</h2>

        <div className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Name <span className="text-red-500 ml-1">*</span>
            </label>
            <input
              id="name"
              type="text"
              name="name"
              required
              defaultValue={printOrder?.name ?? defaultName ?? ""}
              placeholder="e.g. Breakout Handouts"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={printOrder?.notes ?? ""}
              placeholder="Additional notes or instructions..."
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {isEdit && vendorLink && <VendorLinkControl mode="edit" {...vendorLink} />}
          {!isEdit && <VendorLinkControl mode="create" availableVendors={availableVendors} />}
        </div>
      </div>

      <div className="flex gap-4 mt-6">
        <SubmitButton isEdit={isEdit} />
        {isEdit ? (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
        ) : (
          <a
            href={cancelPath ?? `/events/${eventId}/print-orders`}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </a>
        )}
      </div>
    </form>
  );
}
