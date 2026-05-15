"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { MediaItem } from "@prisma/client";
import { PartyField, partyLabel, type ContactOptions } from "@/app/events/av-orders/party-field";
import type { ResponsiblePartyOptions } from "@/app/vendors/actions";

type MediaItemWithParties = MediaItem & {
  advancerVendor?: { name: string } | null;
  advancerContact?: { firstName: string; lastName: string } | null;
};

type MediaItemPanelProps = {
  items: MediaItemWithParties[];
  deliveryOptions: { id: string; label: string }[];
  vendors: ResponsiblePartyOptions;
  contacts: ContactOptions;
  createItem: (formData: FormData) => Promise<void>;
  updateItem: (id: string, formData: FormData) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? "..." : label}
    </button>
  );
}

function ItemForm({
  defaultDescription = "",
  defaultDelivery = "",
  defaultAdvancerVendorId = "",
  defaultAdvancerContactId = "",
  defaultNotes = "",
  deliveryOptions,
  vendors,
  contacts,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  defaultDescription?: string;
  defaultDelivery?: string;
  defaultAdvancerVendorId?: string;
  defaultAdvancerContactId?: string;
  defaultNotes?: string;
  deliveryOptions: { id: string; label: string }[];
  vendors: ResponsiblePartyOptions;
  contacts: ContactOptions;
  onSubmit: (formData: FormData) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}) {
  return (
    <form action={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Description <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="description"
            required
            defaultValue={defaultDescription}
            placeholder="e.g. Walk-in video"
            className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Delivery</label>
          <select
            name="delivery"
            defaultValue={defaultDelivery}
            className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          >
            <option value="">— Select —</option>
            {deliveryOptions.map((o) => (
              <option key={o.id} value={o.label}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Advancer</label>
          <PartyField
            fieldPrefix="advancer"
            vendorGroups={vendors}
            contacts={contacts}
            contactsLabel="Contacts"
            defaultVendorId={defaultAdvancerVendorId || null}
            defaultContactId={defaultAdvancerContactId || null}
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
          <input
            type="text"
            name="notes"
            defaultValue={defaultNotes}
            placeholder="Additional notes..."
            className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <SubmitButton label={submitLabel} />
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function MediaItemPanel({
  items,
  deliveryOptions,
  vendors,
  contacts,
  createItem,
  updateItem,
  deleteItem,
}: MediaItemPanelProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleCreate = async (formData: FormData) => {
    await createItem(formData);
    setShowAddForm(false);
  };

  const handleUpdate = async (id: string, formData: FormData) => {
    await updateItem(id, formData);
    setEditingId(null);
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Media Items</h2>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            Add Item
          </button>
        )}
      </div>

      {showAddForm && (
        <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <ItemForm
            deliveryOptions={deliveryOptions}
            vendors={vendors}
            contacts={contacts}
            onSubmit={handleCreate}
            onCancel={() => setShowAddForm(false)}
            submitLabel="Add"
          />
        </div>
      )}

      {items.length === 0 && !showAddForm ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No media items yet.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              {editingId === item.id ? (
                <ItemForm
                  defaultDescription={item.description}
                  defaultDelivery={item.delivery ?? ""}
                  defaultAdvancerVendorId={item.advancerVendorId ?? ""}
                  defaultAdvancerContactId={item.advancerContactId ?? ""}
                  defaultNotes={item.notes ?? ""}
                  deliveryOptions={deliveryOptions}
                  vendors={vendors}
                  contacts={contacts}
                  onSubmit={(fd) => handleUpdate(item.id, fd)}
                  onCancel={() => setEditingId(null)}
                  submitLabel="Save"
                />
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 dark:text-white text-sm">{item.description}</span>
                      {item.delivery && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">· {item.delivery}</span>
                      )}
                    </div>
                    <div className="flex gap-4 mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {partyLabel(item.advancerVendor, item.advancerContact) && (
                        <span>Advancer: {partyLabel(item.advancerVendor, item.advancerContact)}</span>
                      )}
                    </div>
                    {item.notes && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{item.notes}</p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => setEditingId(item.id)} className="text-blue-600 dark:text-blue-400 hover:underline text-sm">
                      Edit
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm("Delete this item?")) await deleteItem(item.id);
                      }}
                      className="text-red-600 hover:underline text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
