"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { SetupTable, Equipment } from "@prisma/client";

type SetupTableListProps = {
  tables: SetupTable[];
  tableOptions: Equipment[];
  chairOptions: Equipment[];
  createTable: (formData: FormData) => Promise<void>;
  updateTable: (id: string, formData: FormData) => Promise<void>;
  deleteTable: (id: string) => Promise<void>;
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

function EquipmentTypeSelect({
  name,
  options,
  emptyLabel,
  required,
  defaultValue,
}: {
  name: string;
  options: Equipment[];
  emptyLabel: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <select
      name={name}
      required={required}
      defaultValue={defaultValue || ""}
      className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
    >
      <option value="">{emptyLabel}</option>
      {options.map((e) => (
        <option key={e.id} value={e.name}>{e.name}</option>
      ))}
    </select>
  );
}

function TableTotals({ tables }: { tables: SetupTable[] }) {
  // Aggregate tables by type and chairs by type
  const tableTotals: Record<string, number> = {};
  const chairTotals: Record<string, number> = {};

  for (const row of tables) {
    tableTotals[row.tableType] = (tableTotals[row.tableType] || 0) + row.quantity;
    if (row.chairCount && row.chairType) {
      const totalChairs = row.quantity * row.chairCount;
      chairTotals[row.chairType] = (chairTotals[row.chairType] || 0) + totalChairs;
    }
  }

  const tableEntries = Object.entries(tableTotals);
  const chairEntries = Object.entries(chairTotals);

  if (tableEntries.length === 0) return null;

  return (
    <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
      <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide mb-1">
        Totals
      </p>
      <div className="text-sm text-blue-900 dark:text-blue-100 space-y-0.5">
        {tableEntries.map(([type, qty]) => (
          <div key={type}>{qty} × {type}</div>
        ))}
        {chairEntries.map(([type, qty]) => (
          <div key={type}>{qty} × {type}</div>
        ))}
      </div>
    </div>
  );
}

export function SetupTableList({
  tables,
  tableOptions,
  chairOptions,
  createTable,
  updateTable,
  deleteTable,
}: SetupTableListProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleCreate = async (formData: FormData) => {
    await createTable(formData);
    setShowAddForm(false);
  };

  const handleUpdate = async (id: string, formData: FormData) => {
    await updateTable(id, formData);
    setEditingId(null);
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Table / Chair Setup</h2>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
        >
          Add Row
        </button>
      </div>

      {showAddForm && (
        <form action={handleCreate} className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Qty *</label>
              <input
                type="number"
                name="quantity"
                required
                min={1}
                placeholder="0"
                className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
              />
            </div>
            <div className="md:col-span-1">
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Table Type *</label>
              <EquipmentTypeSelect name="tableType" options={tableOptions} emptyLabel="Select table type..." required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Chairs / Table</label>
              <input
                type="number"
                name="chairCount"
                min={0}
                placeholder="0"
                className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Chair Type</label>
              <EquipmentTypeSelect name="chairType" options={chairOptions} emptyLabel="— No chairs —" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
            <input
              type="text"
              name="notes"
              placeholder="e.g., head table at front"
              className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
            />
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

      {tables.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">No table rows yet.</p>
      ) : (
        <div className="space-y-2">
          {tables.map((row) => (
            <div key={row.id} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              {editingId === row.id ? (
                <form action={(fd) => handleUpdate(row.id, fd)} className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Qty *</label>
                      <input
                        type="number"
                        name="quantity"
                        required
                        min={1}
                        defaultValue={row.quantity}
                        className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Table Type *</label>
                      <EquipmentTypeSelect name="tableType" options={tableOptions} emptyLabel="Select table type..." required defaultValue={row.tableType} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Chairs / Table</label>
                      <input
                        type="number"
                        name="chairCount"
                        min={0}
                        defaultValue={row.chairCount ?? ""}
                        className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Chair Type</label>
                      <EquipmentTypeSelect name="chairType" options={chairOptions} emptyLabel="— No chairs —" defaultValue={row.chairType || ""} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                    <input
                      type="text"
                      name="notes"
                      defaultValue={row.notes || ""}
                      className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    />
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
                    <span className="text-gray-900 dark:text-white font-medium">
                      {row.quantity} × {row.tableType}
                    </span>
                    {row.chairCount != null && row.chairCount > 0 && (
                      <span className="text-gray-500 dark:text-gray-400 text-sm ml-2">
                        · {row.chairCount} {row.chairType || "chairs"} ea
                        {" "}
                        <span className="text-gray-400 dark:text-gray-500">
                          ({row.quantity * row.chairCount} total)
                        </span>
                      </span>
                    )}
                    {row.notes && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{row.notes}</p>
                    )}
                  </div>
                  <div className="flex gap-2 ml-2 shrink-0">
                    <button onClick={() => setEditingId(row.id)} className="text-blue-600 hover:underline text-sm">Edit</button>
                    <button
                      onClick={async () => {
                        if (confirm("Delete this row?")) await deleteTable(row.id);
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

      <TableTotals tables={tables} />
    </div>
  );
}
