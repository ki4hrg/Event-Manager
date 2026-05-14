"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { EquipmentItem, CustomOption, Equipment, Vendor, Contact } from "@prisma/client";
import { PartyField, partyLabel } from "@/app/events/av-orders/party-field";
import type { ContactOptions } from "@/app/events/av-orders/party-field";
import type { ResponsiblePartyOptions } from "@/app/vendors/actions";

type EquipmentItemFull = EquipmentItem & {
  providerVendor: Vendor | null;
  providerContact: Contact | null;
  operatorVendor: Vendor | null;
  operatorContact: Contact | null;
  equipment: Equipment | null;
};

type EquipmentTableProps = {
  items: EquipmentItemFull[];
  partyVendors?: { id: string; name: string }[];
  vendorGroups?: ResponsiblePartyOptions;
  contactOptions?: ContactOptions;
  contactsLabel?: string;
  equipmentOptions: Equipment[];
  allEquipmentOptions?: Equipment[];
  equipmentCategories: CustomOption[];
  createItem: (formData: FormData) => Promise<void>;
  updateItem: (id: string, formData: FormData) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  readOnlyItems?: { label: string; quantity: number }[];
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

function EquipmentSelect({
  equipmentOptions,
  equipmentCategories,
  defaultValue,
}: {
  equipmentOptions: Equipment[];
  equipmentCategories: CustomOption[];
  defaultValue?: string;
}) {
  const knownCategorySet = new Set(equipmentCategories.map((c) => c.label));
  const grouped = equipmentCategories
    .map((cat) => ({ label: cat.label, items: equipmentOptions.filter((e) => e.category === cat.label) }))
    .filter((g) => g.items.length > 0);
  const uncategorized = equipmentOptions.filter((e) => !knownCategorySet.has(e.category));

  if (equipmentOptions.length === 0) {
    return (
      <input
        type="text"
        name="item"
        required
        defaultValue={defaultValue}
        placeholder="Equipment name"
        className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
      />
    );
  }

  return (
    <select
      name="equipmentId"
      required
      defaultValue={defaultValue || ""}
      className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
    >
      <option value="">Select equipment...</option>
      {grouped.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.items.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </optgroup>
      ))}
      {uncategorized.length > 0 && (
        <optgroup label="Other">
          {uncategorized.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

export function EquipmentTable({
  items,
  partyVendors,
  vendorGroups,
  contactOptions,
  contactsLabel,
  equipmentOptions,
  allEquipmentOptions,
  equipmentCategories,
  createItem,
  updateItem,
  deleteItem,
  readOnlyItems,
}: EquipmentTableProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const hasFilter = !!allEquipmentOptions;
  const activeEquipmentOptions = hasFilter && showAll ? allEquipmentOptions! : equipmentOptions;

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
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Equipment</h2>
        <div className="flex items-center gap-3">
          {hasFilter && (
            <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              Show all equipment
            </label>
          )}
          <button
            onClick={() => setShowAddForm(true)}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            Add Item
          </button>
        </div>
      </div>

      {showAddForm && (
        <form action={handleCreate} className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Item *</label>
              <EquipmentSelect equipmentOptions={activeEquipmentOptions} equipmentCategories={equipmentCategories} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Provider</label>
              <PartyField
                fieldPrefix="provider"
                {...(vendorGroups ? { vendorGroups } : { vendors: partyVendors ?? [] })}
                contacts={contactOptions ?? []}
                contactsLabel={contactsLabel}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Operator</label>
              <PartyField
                fieldPrefix="operator"
                {...(vendorGroups ? { vendorGroups } : { vendors: partyVendors ?? [] })}
                contacts={contactOptions ?? []}
                contactsLabel={contactsLabel}
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

      {readOnlyItems && readOnlyItems.length > 0 && (
        <div className="mb-3 space-y-1">
          {readOnlyItems.map((ro, i) => (
            <div key={i} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg flex items-center justify-between">
              <div>
                <span className="text-gray-900 dark:text-white font-medium">{ro.label}</span>
                <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">× {ro.quantity}</span>
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500 italic">From setup</span>
            </div>
          ))}
        </div>
      )}

      {items.length === 0 && !readOnlyItems?.length && (
        <p className="text-gray-500 dark:text-gray-400 text-sm">No equipment items yet.</p>
      )}
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              {editingId === item.id ? (
                <form action={(fd) => handleUpdate(item.id, fd)} className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Item *</label>
                      <EquipmentSelect
                        equipmentOptions={activeEquipmentOptions}
                        equipmentCategories={equipmentCategories}
                        defaultValue={item.equipmentId ?? undefined}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Provider</label>
                      <PartyField
                        fieldPrefix="provider"
                        vendors={partyVendors}
                        contacts={contactOptions ?? []}
                        contactsLabel={contactsLabel}
                        defaultVendorId={item.providerVendorId}
                        defaultContactId={item.providerContactId}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Operator</label>
                      <PartyField
                        fieldPrefix="operator"
                        vendors={partyVendors}
                        contacts={contactOptions ?? []}
                        contactsLabel={contactsLabel}
                        defaultVendorId={item.operatorVendorId}
                        defaultContactId={item.operatorContactId}
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
                      {partyLabel(item.providerVendor, item.providerContact) && (
                        <span>{partyLabel(item.providerVendor, item.providerContact)}</span>
                      )}
                      {item.notes && <span className="ml-2">· {item.notes}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 ml-2 shrink-0">
                    <button onClick={() => setEditingId(item.id)} className="text-blue-600 dark:text-blue-400 hover:underline text-sm">Edit</button>
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
