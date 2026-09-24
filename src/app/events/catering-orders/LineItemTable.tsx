"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { CateringOrderLineItem } from "@prisma/client";
import { useCanDelete, useCanWrite } from "@/components/PermissionsProvider";

type LineItemTableProps = {
  items: CateringOrderLineItem[];
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

function formatCurrency(value: unknown): string {
  if (value == null) return "";
  return `$${Number(value).toFixed(2)}`;
}

export function LineItemTable({ items, createItem, updateItem, deleteItem }: LineItemTableProps) {
  const canWrite = useCanWrite("CATERING_ORDERS");
  const canDelete = useCanDelete("CATERING_ORDERS");
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

  const total = items.reduce((sum, item) => {
    if (item.unitPrice == null) return sum;
    const price = Number(item.unitPrice);
    const qty = item.quantity ?? 1;
    return sum + price * qty;
  }, 0);

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Pricing</h2>
        {canWrite && (
          <button
            onClick={() => setShowAddForm(true)}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            Add Line Item
          </button>
        )}
      </div>

      {showAddForm && (
        <form action={handleCreate} className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description *</label>
              <input
                type="text"
                name="description"
                required
                placeholder="e.g., Per Person Dinner, Delivery Fee"
                className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Unit Price ($)</label>
              <input
                type="number"
                name="unitPrice"
                step="0.01"
                className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
              />
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
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Unit Type</label>
              <input
                type="text"
                name="unitType"
                placeholder="e.g., per person, flat, per hour"
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

      {items.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">No line items yet.</p>
      ) : (
        <>
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                {editingId === item.id ? (
                  <form action={(fd) => handleUpdate(item.id, fd)} className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Description *</label>
                        <input
                          type="text"
                          name="description"
                          required
                          defaultValue={item.description}
                          className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Unit Price ($)</label>
                        <input
                          type="number"
                          name="unitPrice"
                          step="0.01"
                          defaultValue={item.unitPrice != null ? String(item.unitPrice) : ""}
                          className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                        />
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
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Unit Type</label>
                        <input
                          type="text"
                          name="unitType"
                          defaultValue={item.unitType || ""}
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
                      <span className="text-gray-900 dark:text-white font-medium">{item.description}</span>
                      <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        {item.unitPrice != null && (
                          <span>
                            {formatCurrency(item.unitPrice)}
                            {item.unitType && ` ${item.unitType}`}
                            {item.quantity != null && ` × ${item.quantity}`}
                            {item.quantity != null && item.unitPrice != null && (
                              <span className="font-medium text-gray-700 dark:text-gray-300">
                                {" "}= {formatCurrency(Number(item.unitPrice) * item.quantity)}
                              </span>
                            )}
                          </span>
                        )}
                        {item.notes && <span className="ml-2">· {item.notes}</span>}
                      </div>
                    </div>
                    <div className="flex gap-2 ml-2 shrink-0">
                      {canWrite && (
                        <button onClick={() => setEditingId(item.id)} className="text-blue-600 dark:text-blue-400 hover:underline text-sm">Edit</button>
                      )}
                      {canDelete && (
                        <button
                          onClick={async () => {
                            if (confirm("Delete this line item?")) await deleteItem(item.id);
                          }}
                          className="text-red-600 hover:underline text-sm"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          {total > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 text-right">
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                Estimated Total: {formatCurrency(total)}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
