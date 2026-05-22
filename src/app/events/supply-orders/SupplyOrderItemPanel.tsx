"use client";

import { useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import type { AcquisitionState, Equipment, PackingStatus, SupplyOrderItem } from "@prisma/client";
import { GroupedEquipmentSelect } from "@/components/ui/GroupedEquipmentSelect";
import {
  PACKING_STATUS_CLASS,
  PACKING_STATUS_LABEL,
  PACKING_STATUS_OPTIONS,
} from "@/lib/statusConstants";

type ItemWithExtras = SupplyOrderItem & {
  equipment: Equipment | null;
  providerVendor: { id: string; name: string } | null;
};

type SupplyOrderItemPanelProps = {
  items: ItemWithExtras[];
  equipmentOptions: Equipment[];
  vendors: { id: string; name: string }[];
  createItem: (formData: FormData) => Promise<void>;
  updateItem: (id: string, formData: FormData) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  updateItemPackingStatus: (id: string, packingStatus: PackingStatus) => Promise<void>;
};

const ACQUISITION_OPTIONS: { value: AcquisitionState; label: string }[] = [
  { value: "ON_HAND", label: "On Hand" },
  { value: "TO_PROCURE", label: "To Procure" },
  { value: "FROM_VENDOR", label: "From Vendor" },
];

const ACQUISITION_LABEL: Record<AcquisitionState, string> = {
  ON_HAND: "On Hand",
  TO_PROCURE: "To Procure",
  FROM_VENDOR: "From Vendor",
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
  item,
  equipmentOptions,
  vendors,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  item?: ItemWithExtras;
  equipmentOptions: Equipment[];
  vendors: { id: string; name: string }[];
  onSubmit: (formData: FormData) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}) {
  const inputClass =
    "w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm";

  return (
    <form action={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Description
          </label>
          <input
            type="text"
            name="description"
            defaultValue={item?.description ?? ""}
            placeholder="e.g. Printer (optional if Equipment is selected)"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Equipment (optional)</label>
          <GroupedEquipmentSelect
            options={equipmentOptions}
            defaultValue={item?.equipmentId ?? null}
            size="sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Quantity</label>
          <input
            type="number"
            name="quantity"
            min={1}
            defaultValue={item?.quantity ?? ""}
            placeholder="e.g. 1"
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Acquisition State</label>
          <select
            name="acquisitionState"
            defaultValue={item?.acquisitionState ?? "ON_HAND"}
            className={inputClass}
          >
            {ACQUISITION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Provider Vendor</label>
          <select
            name="providerVendorId"
            defaultValue={item?.providerVendorId ?? ""}
            className={inputClass}
          >
            <option value="">— None —</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Packing Status</label>
          <select
            name="packingStatus"
            defaultValue={item?.packingStatus ?? "NEEDED"}
            className={inputClass}
          >
            {PACKING_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
          <input
            type="text"
            name="notes"
            defaultValue={item?.notes ?? ""}
            placeholder="Additional notes..."
            className={inputClass}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <SubmitButton label={submitLabel} />
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}

function PackingStatusToggle({
  itemId,
  current,
  onChange,
}: {
  itemId: string;
  current: PackingStatus;
  onChange: (id: string, status: PackingStatus) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <select
      value={current}
      disabled={isPending}
      onChange={(e) => {
        const next = e.target.value as PackingStatus;
        startTransition(async () => {
          await onChange(itemId, next);
        });
      }}
      className={`text-xs rounded px-2 py-0.5 border-0 font-medium disabled:opacity-50 ${PACKING_STATUS_CLASS[current]}`}
    >
      {PACKING_STATUS_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function SupplyOrderItemPanel({
  items,
  equipmentOptions,
  vendors,
  createItem,
  updateItem,
  deleteItem,
  updateItemPackingStatus,
}: SupplyOrderItemPanelProps) {
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
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Supply Items</h2>
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
            equipmentOptions={equipmentOptions}
            vendors={vendors}
            onSubmit={handleCreate}
            onCancel={() => setShowAddForm(false)}
            submitLabel="Add"
          />
        </div>
      )}

      {items.length === 0 && !showAddForm ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No supply items yet.</p>
      ) : (
        <>
          {/* Mobile card view */}
          <div className="sm:hidden border border-gray-200 dark:border-gray-700 rounded divide-y divide-gray-200 dark:divide-gray-700 text-xs">
            {items.map((item) => (
              <div key={item.id} className="p-3">
                {editingId === item.id ? (
                  <ItemForm
                    item={item}
                    equipmentOptions={equipmentOptions}
                    vendors={vendors}
                    onSubmit={(fd) => handleUpdate(item.id, fd)}
                    onCancel={() => setEditingId(null)}
                    submitLabel="Save"
                  />
                ) : (
                  <div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-gray-900 dark:text-white text-sm">
                        {item.description ?? item.equipment?.name ?? "Untitled item"}
                      </span>
                      {item.quantity && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">× {item.quantity}</span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <PackingStatusToggle
                        itemId={item.id}
                        current={item.packingStatus}
                        onChange={updateItemPackingStatus}
                      />
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {ACQUISITION_LABEL[item.acquisitionState]}
                      </span>
                    </div>
                    {item.providerVendor && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">From: {item.providerVendor.name}</p>
                    )}
                    {item.equipment && item.description && (
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {item.equipment.category} · {item.equipment.name}
                      </p>
                    )}
                    {item.notes && (
                      <p className="mt-0.5 text-xs italic text-gray-400 dark:text-gray-500">{item.notes}</p>
                    )}
                    <div className="mt-2 flex gap-3">
                      <button onClick={() => setEditingId(item.id)} className="text-blue-600 dark:text-blue-400 hover:underline text-xs">
                        Edit
                      </button>
                      <button
                        onClick={async () => {
                          if (confirm("Delete this item?")) await deleteItem(item.id);
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

          {/* Desktop table */}
          <div className="hidden sm:block space-y-2">
            {items.map((item) => (
              <div key={item.id} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                {editingId === item.id ? (
                  <ItemForm
                    item={item}
                    equipmentOptions={equipmentOptions}
                    vendors={vendors}
                    onSubmit={(fd) => handleUpdate(item.id, fd)}
                    onCancel={() => setEditingId(null)}
                    submitLabel="Save"
                  />
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 dark:text-white text-sm">
                          {item.description ?? item.equipment?.name ?? "Untitled item"}
                        </span>
                        {item.quantity && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">× {item.quantity}</span>
                        )}
                        <PackingStatusToggle
                          itemId={item.id}
                          current={item.packingStatus}
                          onChange={updateItemPackingStatus}
                        />
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {ACQUISITION_LABEL[item.acquisitionState]}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
                        {item.equipment && item.description && (
                          <span>
                            {item.equipment.category} · {item.equipment.name}
                          </span>
                        )}
                        {item.providerVendor && <span>From: {item.providerVendor.name}</span>}
                      </div>
                      {item.notes && (
                        <p className="text-xs italic text-gray-400 dark:text-gray-500 mt-0.5">{item.notes}</p>
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
        </>
      )}
    </div>
  );
}

// Re-export label so other components can describe a packed badge consistently.
export { PACKING_STATUS_LABEL };
