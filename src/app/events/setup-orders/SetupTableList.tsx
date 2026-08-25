"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { SetupTable, Equipment } from "@prisma/client";
import type { ResponsiblePartyOptions } from "@/app/vendors/actions";
import { ResponsiblePartyField } from "@/components/ResponsiblePartyField";
import { aggregateSetupTables } from "./utils";
import { useCanDelete, useCanWrite } from "@/components/PermissionsProvider";

type TableRow = SetupTable & { providerVendor: { id: string; name: string } | null };

type SetupTableListProps = {
  tables: TableRow[];
  vendorOptions: ResponsiblePartyOptions;
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
  defaultValue,
  onChange,
}: {
  name: string;
  options: Equipment[];
  emptyLabel: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue || ""}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
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
  const { tableTotals, chairTotals } = aggregateSetupTables(tables);
  const tableEntries = Object.entries(tableTotals);
  const chairEntries = Object.entries(chairTotals);

  if (tableEntries.length === 0 && chairEntries.length === 0) return null;

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

function RowForm({
  defaultQuantity = 1,
  defaultTableType = "",
  defaultChairCount = "",
  defaultChairType = "",
  defaultProviderVendorId = "",
  defaultNotes = "",
  tableOptions,
  chairOptions,
  vendorOptions,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  defaultQuantity?: number;
  defaultTableType?: string;
  defaultChairCount?: number | string;
  defaultChairType?: string;
  defaultProviderVendorId?: string;
  defaultNotes?: string;
  tableOptions: Equipment[];
  chairOptions: Equipment[];
  vendorOptions: ResponsiblePartyOptions;
  onSubmit: (formData: FormData) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [qty, setQty] = useState(defaultQuantity);
  const [chairCount, setChairCount] = useState(
    typeof defaultChairCount === "number" ? defaultChairCount : (parseInt(defaultChairCount) || 0)
  );
  const [tableType, setTableType] = useState(defaultTableType);
  const [error, setError] = useState<string | null>(null);

  const totalChairs = chairCount > 0 ? (qty > 0 ? qty * chairCount : chairCount) : null;

  const handleSubmit = async (formData: FormData) => {
    if (!tableType && chairCount <= 0) {
      setError("Enter a table type or a chair count.");
      return;
    }
    setError(null);
    await onSubmit(formData);
  };

  return (
    <form action={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Qty *</label>
          <input
            type="number"
            name="quantity"
            required
            min={0}
            value={qty}
            onChange={(e) => setQty(parseInt(e.target.value) || 0)}
            className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          />
        </div>
        <div className="md:col-span-1">
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Table Type</label>
          <EquipmentTypeSelect
            name="tableType"
            options={tableOptions}
            emptyLabel="Select table type..."
            defaultValue={defaultTableType}
            onChange={setTableType}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Chairs / Table</label>
          <input
            type="number"
            name="chairCount"
            min={0}
            value={chairCount || ""}
            onChange={(e) => setChairCount(parseInt(e.target.value) || 0)}
            placeholder="0"
            className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Chair Type</label>
          <EquipmentTypeSelect
            name="chairType"
            options={chairOptions}
            emptyLabel="Select chair type..."
            defaultValue={defaultChairType}
          />
        </div>
      </div>
      {totalChairs !== null && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Total chairs: <span className="font-medium text-gray-700 dark:text-gray-200">{totalChairs}</span>
        </p>
      )}
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Provider</label>
        <ResponsiblePartyField options={vendorOptions} defaultValue={defaultProviderVendorId} name="providerVendorId" />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
        <input
          type="text"
          name="notes"
          defaultValue={defaultNotes}
          placeholder="e.g., head table at front"
          className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
        />
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
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

export function SetupTableList({
  tables,
  vendorOptions,
  tableOptions,
  chairOptions,
  createTable,
  updateTable,
  deleteTable,
}: SetupTableListProps) {
  const canWrite = useCanWrite("SETUP_ORDERS");
  const canDelete = useCanDelete("SETUP_ORDERS");
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
        {canWrite && (
          <button
            onClick={() => setShowAddForm(true)}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            Add Row
          </button>
        )}
      </div>

      {showAddForm && (
        <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <RowForm
            tableOptions={tableOptions}
            chairOptions={chairOptions}
            vendorOptions={vendorOptions}
            onSubmit={handleCreate}
            onCancel={() => setShowAddForm(false)}
            submitLabel="Add"
          />
        </div>
      )}

      {tables.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">No table rows yet.</p>
      ) : (
        <div className="space-y-2">
          {tables.map((row) => {
            const hasQty = row.quantity > 0;
            return (
            <div key={row.id} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              {editingId === row.id ? (
                <RowForm
                  defaultQuantity={row.quantity}
                  defaultTableType={row.tableType ?? ""}
                  defaultChairCount={row.chairCount ?? ""}
                  defaultChairType={row.chairType ?? ""}
                  defaultProviderVendorId={row.providerVendorId ?? ""}
                  defaultNotes={row.notes ?? ""}
                  tableOptions={tableOptions}
                  chairOptions={chairOptions}
                  vendorOptions={vendorOptions}
                  onSubmit={(fd) => handleUpdate(row.id, fd)}
                  onCancel={() => setEditingId(null)}
                  submitLabel="Save"
                />
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    {row.tableType && hasQty && (
                      <span className="text-gray-900 dark:text-white font-medium">
                        {row.quantity} × {row.tableType}
                      </span>
                    )}
                    {row.chairCount != null && row.chairCount > 0 && (
                      <span className="text-gray-500 dark:text-gray-400 text-sm ml-2">
                        {row.tableType && hasQty ? "· " : ""}
                        {`${row.chairCount} ${row.chairType || "chairs"}${hasQty ? "/table" : ""}`}
                        {hasQty && (
                          <span className="text-gray-400 dark:text-gray-500">
                            {" "}({row.quantity * row.chairCount} total)
                          </span>
                        )}
                      </span>
                    )}
                    {!row.tableType && (!row.chairCount || row.chairCount === 0) && (
                      <span className="text-gray-900 dark:text-white font-medium">{row.quantity} items</span>
                    )}
                    {row.providerVendor && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Provider: {row.providerVendor.name}</p>
                    )}
                    {row.notes && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{row.notes}</p>
                    )}
                  </div>
                  <div className="flex gap-2 ml-2 shrink-0">
                    {canWrite && (
                      <button onClick={() => setEditingId(row.id)} className="text-blue-600 dark:text-blue-400 hover:underline text-sm">Edit</button>
                    )}
                    {canDelete && (
                      <button
                        onClick={async () => {
                          if (confirm("Delete this row?")) await deleteTable(row.id);
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
            );
          })}
        </div>
      )}

      <TableTotals tables={tables} />
    </div>
  );
}
