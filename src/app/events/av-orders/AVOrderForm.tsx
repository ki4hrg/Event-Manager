"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { AVOrder } from "@prisma/client";
import { ReadOnlyField } from "@/components/ReadOnlyField";
import { VendorLinkControl, type AvailableVendor, type VendorLinkEditProps } from "@/app/events/vendors/VendorLinkControl";

type AVOrderFormProps = {
  avOrder?: AVOrder | null;
  eventId: string;
  action: (formData: FormData) => Promise<void>;
  availableFunctions?: { id: string; label: string }[];
  availablePresentations?: { id: string; label: string }[];
  defaultFunctionId?: string;
  defaultPresentationId?: string;
  defaultName?: string;
  cancelPath?: string;
  vendorLink?: VendorLinkEditProps;
  availableVendors?: AvailableVendor[];
  noCard?: boolean;
};

function LinkSelectField({
  fieldName,
  label,
  options,
  defaultValue,
}: {
  fieldName: string;
  label: string;
  options: { id: string; label: string }[];
  defaultValue?: string;
}) {
  return (
    <div>
      <label
        htmlFor={fieldName}
        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        {label}
      </label>
      <select
        id={fieldName}
        name={fieldName}
        defaultValue={defaultValue || ""}
        className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">— None —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

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

export function AVOrderForm({
  avOrder,
  eventId,
  action,
  availableFunctions,
  availablePresentations,
  defaultFunctionId,
  defaultPresentationId,
  defaultName,
  cancelPath,
  vendorLink,
  availableVendors = [],
  noCard = false,
}: AVOrderFormProps) {
  const isEdit = !!avOrder;
  const [editing, setEditing] = useState(false);

  const cardClass = noCard ? "" : "bg-white dark:bg-gray-800 shadow rounded-lg p-6";

  if (isEdit && !editing) {
    return (
      <div className={cardClass}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">AV Order Details</h2>
          <button
            onClick={() => setEditing(true)}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Edit
          </button>
        </div>
        <dl className="space-y-4">
          <ReadOnlyField label="Name" value={avOrder.name} />
          <ReadOnlyField label="Notes" value={avOrder.notes} />
          {vendorLink && (
            <VendorLinkControl mode="edit" {...vendorLink} />
          )}
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
      className={noCard ? "space-y-6" : "space-y-6 max-w-2xl"}
    >
      <div className={cardClass}>
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
              defaultValue={avOrder?.name ?? defaultName ?? ""}
              placeholder="e.g., Main Stage AV, Breakout Room 1 AV"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
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

          {!isEdit && availableFunctions && (
            <LinkSelectField
              fieldName="functionId"
              label="Link to Function"
              options={availableFunctions}
              defaultValue={defaultFunctionId}
            />
          )}

          {!isEdit && availablePresentations && (
            <LinkSelectField
              fieldName="presentationId"
              label="Link to Presentation"
              options={availablePresentations}
              defaultValue={defaultPresentationId}
            />
          )}

          {isEdit && vendorLink ? (
            <VendorLinkControl mode="edit" {...vendorLink} />
          ) : !isEdit ? (
            <VendorLinkControl mode="create" availableVendors={availableVendors} />
          ) : null}
        </div>
      </div>

      <div className="flex gap-4">
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
            href={cancelPath ?? `/events/${eventId}/av-orders`}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </a>
        )}
      </div>
    </form>
  );
}
