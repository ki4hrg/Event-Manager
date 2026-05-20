"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { ReadOnlyField } from "@/components/ReadOnlyField";
import { PartyField } from "@/app/events/av-orders/party-field";
import { partyLabel } from "@/lib/partyLabel";
import type { ResponsiblePartyPool } from "@/lib/responsibleParties";

type MediaDeliverableData = {
  id: string;
  name: string;
  mediaType?: string | null;
  delivery?: string | null;
  description?: string | null;
  notes?: string | null;
  providerVendorId?: string | null;
  providerContactId?: string | null;
  providerVendor?: { name: string } | null;
  providerContact?: { firstName: string; lastName: string } | null;
};

type OptionEntry = { id: string; label: string };

type MediaDeliverableFormProps = {
  mediaDeliverable?: MediaDeliverableData | null;
  eventId: string;
  action: (formData: FormData) => Promise<void>;
  pool: ResponsiblePartyPool;
  mediaTypeOptions: OptionEntry[];
  deliveryOptions: OptionEntry[];
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
      {pending ? "Saving..." : isEdit ? "Update Deliverable" : "Create Deliverable"}
    </button>
  );
}

export function MediaDeliverableForm({
  mediaDeliverable,
  eventId,
  action,
  pool,
  mediaTypeOptions,
  deliveryOptions,
  cancelPath,
  defaultName,
  noCard = false,
}: MediaDeliverableFormProps) {
  const isEdit = !!mediaDeliverable;
  const [editing, setEditing] = useState(false);

  const cardClass = noCard ? "" : "bg-white dark:bg-gray-800 shadow rounded-lg p-6";

  if (isEdit && !editing) {
    return (
      <div className={cardClass}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Media Deliverable Details</h2>
          <button
            onClick={() => setEditing(true)}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Edit
          </button>
        </div>
        <dl className="space-y-4">
          <ReadOnlyField label="Name" value={mediaDeliverable.name} />
          <ReadOnlyField label="Media Type" value={mediaDeliverable.mediaType ?? null} />
          <ReadOnlyField label="Delivery" value={mediaDeliverable.delivery ?? null} />
          <ReadOnlyField label="Description" value={mediaDeliverable.description ?? null} />
          <ReadOnlyField
            label="Provider"
            value={partyLabel(mediaDeliverable.providerVendor, mediaDeliverable.providerContact)}
          />
          <ReadOnlyField label="Notes" value={mediaDeliverable.notes ?? null} />
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
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Media Deliverable Details</h2>

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
              defaultValue={mediaDeliverable?.name ?? defaultName ?? ""}
              placeholder="e.g. Plenary Walk-in Video"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="mediaType" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Media Type
              </label>
              <select
                id="mediaType"
                name="mediaType"
                defaultValue={mediaDeliverable?.mediaType ?? ""}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Select —</option>
                {mediaTypeOptions.map((o) => (
                  <option key={o.id} value={o.label}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="delivery" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Delivery
              </label>
              <select
                id="delivery"
                name="delivery"
                defaultValue={mediaDeliverable?.delivery ?? ""}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Select —</option>
                {deliveryOptions.map((o) => (
                  <option key={o.id} value={o.label}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={2}
              defaultValue={mediaDeliverable?.description ?? ""}
              placeholder="What is being delivered..."
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Provider</label>
            <PartyField
              fieldPrefix="provider"
              vendorGroups={pool.vendorGroups}
              contacts={pool.contacts}
              defaultVendorId={mediaDeliverable?.providerVendorId ?? null}
              defaultContactId={mediaDeliverable?.providerContactId ?? null}
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
              defaultValue={mediaDeliverable?.notes ?? ""}
              placeholder="Additional notes or instructions..."
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
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
            href={cancelPath ?? `/events/${eventId}/media-deliverables`}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </a>
        )}
      </div>
    </form>
  );
}
