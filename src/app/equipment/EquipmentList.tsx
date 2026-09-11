"use client";

import { useState } from "react";
import { btnPrimarySm } from "@/lib/buttonStyles";
import { useFormStatus } from "react-dom";
import type { Equipment, CustomOption } from "@prisma/client";

type EquipmentListProps = {
  equipment: Equipment[];
  categories: CustomOption[];
  createEquipment: (formData: FormData) => Promise<void>;
  updateEquipment: (id: string, formData: FormData) => Promise<void>;
  deleteEquipment: (id: string) => Promise<void>;
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${btnPrimarySm} disabled:opacity-50`}
    >
      {pending ? "..." : label}
    </button>
  );
}

function CategorySelect({
  categories,
  defaultValue,
}: {
  categories: CustomOption[];
  defaultValue?: string;
}) {
  return (
    <select
      name="category"
      required
      defaultValue={defaultValue || ""}
      className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
    >
      <option value="">Select category...</option>
      {categories.map((c) => (
        <option key={c.id} value={c.label}>
          {c.label}
        </option>
      ))}
    </select>
  );
}

export function EquipmentList({
  equipment,
  categories,
  createEquipment,
  updateEquipment,
  deleteEquipment,
}: EquipmentListProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleCreate = async (formData: FormData) => {
    await createEquipment(formData);
    setShowAddForm(false);
  };

  const handleUpdate = async (id: string, formData: FormData) => {
    await updateEquipment(id, formData);
    setEditingId(null);
  };

  // Group equipment by category
  const grouped = categories.reduce<Record<string, Equipment[]>>((acc, cat) => {
    acc[cat.label] = equipment.filter((e) => e.category === cat.label);
    return acc;
  }, {});

  // Also include items in unknown categories
  const knownCategories = new Set(categories.map((c) => c.label));
  const uncategorized = equipment.filter((e) => !knownCategories.has(e.category));

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <div className="flex justify-between items-start mb-1">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Equipment</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Equipment options grouped by category, used across AV Orders, Catering Orders, and Setup Orders
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className={`${btnPrimarySm} shrink-0`}
        >
          Add Item
        </button>
      </div>

      {showAddForm && (
        <form action={handleCreate} className="mt-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
              <input
                type="text"
                name="name"
                required
                autoFocus
                placeholder="e.g., 60&quot; Round"
                className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Category *</label>
              <CategorySelect categories={categories} />
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

      <div className="mt-4 space-y-4">
        {[
          ...categories
            .map((cat) => ({ label: cat.label, items: grouped[cat.label] || [] }))
            .filter((g) => g.items.length > 0),
          ...(uncategorized.length > 0 ? [{ label: "Uncategorized", items: uncategorized }] : []),
        ].map((group) => (
          <div key={group.label}>
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
              {group.label}
            </h3>
            <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
              {group.items.map((item) => (
                <div key={item.id} className="p-2 bg-gray-50 dark:bg-gray-900 rounded">
                  {editingId === item.id ? (
                    <form action={(fd) => handleUpdate(item.id, fd)} className="flex gap-2 items-end">
                      <div className="flex-1">
                        <input
                          type="text"
                          name="name"
                          required
                          defaultValue={item.name}
                          className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                      <div className="w-40">
                        <CategorySelect categories={categories} defaultValue={item.category} />
                      </div>
                      <SubmitButton label="Save" />
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm"
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-900 dark:text-white">{item.name}</span>
                      <div className="flex gap-3">
                        <button
                          onClick={() => setEditingId(item.id)}
                          className="text-blue-600 dark:text-blue-400 hover:underline text-xs"
                        >
                          Edit
                        </button>
                        <button
                          onClick={async () => {
                            if (confirm(`Delete "${item.name}"?`)) await deleteEquipment(item.id);
                          }}
                          className="text-red-600 hover:underline text-xs"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {equipment.length === 0 && !showAddForm && (
          <p className="text-sm text-gray-500 dark:text-gray-400">No equipment items yet.</p>
        )}
      </div>
    </div>
  );
}
