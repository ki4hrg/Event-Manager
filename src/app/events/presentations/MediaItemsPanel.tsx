"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { MediaItem, Vendor, Contact, CustomOption } from "@prisma/client";

type MediaItemFull = MediaItem & {
  advancerVendor: Vendor | null;
  advancerContact: Contact | null;
};

type VendorOption = { id: string; name: string };
type ContactOption = { id: string; firstName: string; lastName: string; organization: string | null };

type MediaItemsPanelProps = {
  mediaItems: MediaItemFull[];
  deliveryOptions: CustomOption[];
  vendorOptions: VendorOption[];
  contactOptions: ContactOption[];
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

function contactName(c: ContactOption) {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ");
  return c.organization ? `${name} (${c.organization})` : name;
}

function AdvancerField({
  vendors,
  contacts,
  defaultVendorId,
  defaultContactId,
}: {
  vendors: VendorOption[];
  contacts: ContactOption[];
  defaultVendorId?: string | null;
  defaultContactId?: string | null;
}) {
  const [mode, setMode] = useState<"vendor" | "contact">(
    defaultContactId ? "contact" : "vendor"
  );

  return (
    <div className="space-y-1">
      <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-400 mb-1">
        <label className="flex items-center gap-1">
          <input type="radio" checked={mode === "vendor"} onChange={() => setMode("vendor")} /> Vendor
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" checked={mode === "contact"} onChange={() => setMode("contact")} /> Contact
        </label>
      </div>
      {mode === "vendor" ? (
        <>
          <select
            name="advancerVendorId"
            defaultValue={defaultVendorId || ""}
            className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          >
            <option value="">— None —</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
          <input type="hidden" name="advancerContactId" value="" />
        </>
      ) : (
        <>
          <input type="hidden" name="advancerVendorId" value="" />
          <select
            name="advancerContactId"
            defaultValue={defaultContactId || ""}
            className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          >
            <option value="">— None —</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>{contactName(c)}</option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}

function advancerLabel(vendor: Vendor | null, contact: Contact | null): string | null {
  if (vendor) return vendor.name;
  if (contact) return [contact.firstName, contact.lastName].filter(Boolean).join(" ");
  return null;
}

function ItemForm({
  item,
  deliveryOptions,
  vendors,
  contacts,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  item?: MediaItemFull;
  deliveryOptions: CustomOption[];
  vendors: VendorOption[];
  contacts: ContactOption[];
  onSubmit: (formData: FormData) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}) {
  return (
    <form action={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description *</label>
          <input
            type="text"
            name="description"
            required
            defaultValue={item?.description ?? ""}
            placeholder="Media description"
            className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Delivery</label>
          <select
            name="delivery"
            defaultValue={item?.delivery ?? ""}
            className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          >
            <option value="">— None —</option>
            {deliveryOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
          <input
            type="text"
            name="notes"
            defaultValue={item?.notes ?? ""}
            className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Advancer</label>
          <AdvancerField
            vendors={vendors}
            contacts={contacts}
            defaultVendorId={item?.advancerVendorId}
            defaultContactId={item?.advancerContactId}
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

export function MediaItemsPanel({
  mediaItems,
  deliveryOptions,
  vendorOptions,
  contactOptions,
  createItem,
  updateItem,
  deleteItem,
}: MediaItemsPanelProps) {
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

  const deliveryLabel = (value: string | null) => {
    if (!value) return null;
    return deliveryOptions.find((o) => o.value === value)?.label ?? value;
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
            vendors={vendorOptions}
            contacts={contactOptions}
            onSubmit={handleCreate}
            onCancel={() => setShowAddForm(false)}
            submitLabel="Add"
          />
        </div>
      )}

      {mediaItems.length === 0 && !showAddForm && (
        <p className="text-sm text-gray-500 dark:text-gray-400">No media items yet.</p>
      )}

      {mediaItems.length > 0 && (
        <div className="space-y-2">
          {mediaItems.map((item) => (
            <div key={item.id} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              {editingId === item.id ? (
                <ItemForm
                  item={item}
                  deliveryOptions={deliveryOptions}
                  vendors={vendorOptions}
                  contacts={contactOptions}
                  onSubmit={(fd) => handleUpdate(item.id, fd)}
                  onCancel={() => setEditingId(null)}
                  submitLabel="Save"
                />
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-gray-900 dark:text-white font-medium">{item.description}</span>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 space-x-2">
                      {deliveryLabel(item.delivery) && <span>{deliveryLabel(item.delivery)}</span>}
                      {advancerLabel(item.advancerVendor, item.advancerContact) && (
                        <span>· {advancerLabel(item.advancerVendor, item.advancerContact)}</span>
                      )}
                      {item.notes && <span>· {item.notes}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 ml-2 shrink-0">
                    <button
                      onClick={() => setEditingId(item.id)}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={async () => {
                        if (confirm("Delete this media item?")) await deleteItem(item.id);
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
