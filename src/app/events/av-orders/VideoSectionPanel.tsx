"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { EquipmentItem, VideoSection, Vendor } from "@prisma/client";

type EquipmentItemWithVendor = EquipmentItem & {
  responsiblePartyVendor: Vendor | null;
};

type VideoSectionWithItems = VideoSection & {
  equipmentItems: EquipmentItemWithVendor[];
};

type VideoSectionPanelProps = {
  videoSection: VideoSectionWithItems;
  responsiblePartyVendors: { id: string; name: string }[];
  updateSection: (formData: FormData) => Promise<void>;
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

export function VideoSectionPanel({
  videoSection,
  responsiblePartyVendors,
  updateSection,
  createItem,
  updateItem,
  deleteItem,
}: VideoSectionPanelProps) {
  const [editingNotes, setEditingNotes] = useState(false);
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

  const handleUpdateNotes = async (formData: FormData) => {
    await updateSection(formData);
    setEditingNotes(false);
  };

  return (
    <div className="space-y-6">
      {/* Notes */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Video Notes</h2>
          {!editingNotes && (
            <button
              onClick={() => setEditingNotes(true)}
              className="text-sm text-blue-600 hover:underline"
            >
              Edit
            </button>
          )}
        </div>
        {editingNotes ? (
          <form action={handleUpdateNotes} className="space-y-3">
            <textarea
              name="notes"
              rows={4}
              defaultValue={videoSection.notes || ""}
              placeholder="Video section notes..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-2">
              <SubmitButton label="Save" />
              <button
                type="button"
                onClick={() => setEditingNotes(false)}
                className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {videoSection.notes || <span className="text-gray-400 dark:text-gray-500 italic">None</span>}
          </p>
        )}
      </div>

      {/* Equipment Items */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Equipment</h2>
          <button
            onClick={() => setShowAddForm(true)}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            Add Item
          </button>
        </div>

        {showAddForm && (
          <form action={handleCreate} className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Item *</label>
                <input
                  type="text"
                  name="item"
                  required
                  placeholder="Equipment name"
                  className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Responsible Party</label>
                <select
                  name="responsiblePartyVendorId"
                  className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                >
                  <option value="">— None —</option>
                  {responsiblePartyVendors.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Quantity</label>
                <input
                  type="number"
                  name="quantity"
                  className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                <input
                  type="text"
                  name="notes"
                  className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <SubmitButton label="Add" />
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {videoSection.equipmentItems.length === 0 && !showAddForm && (
          <p className="text-gray-500 dark:text-gray-400 text-sm">No equipment items yet.</p>
        )}

        {videoSection.equipmentItems.length > 0 && (
          <div className="space-y-2">
            {videoSection.equipmentItems.map((item) => (
              <div key={item.id} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                {editingId === item.id ? (
                  <form action={(fd) => handleUpdate(item.id, fd)} className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Item *</label>
                        <input
                          type="text"
                          name="item"
                          required
                          defaultValue={item.item}
                          className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Responsible Party</label>
                        <select
                          name="responsiblePartyVendorId"
                          defaultValue={item.responsiblePartyVendorId || ""}
                          className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                        >
                          <option value="">— None —</option>
                          {responsiblePartyVendors.map((v) => (
                            <option key={v.id} value={v.id}>{v.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Quantity</label>
                        <input
                          type="number"
                          name="quantity"
                          defaultValue={item.quantity ?? ""}
                          className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                        <input
                          type="text"
                          name="notes"
                          defaultValue={item.notes || ""}
                          className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <SubmitButton label="Save" />
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-gray-900 dark:text-white font-medium">{item.item}</span>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        {item.quantity != null && <span>× {item.quantity} </span>}
                        {item.responsiblePartyVendor && <span>{item.responsiblePartyVendor.name}</span>}
                        {item.notes && <span className="ml-2">· {item.notes}</span>}
                      </div>
                    </div>
                    <div className="flex gap-2 ml-2 shrink-0">
                      <button onClick={() => setEditingId(item.id)} className="text-blue-600 hover:underline text-sm">Edit</button>
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
    </div>
  );
}
