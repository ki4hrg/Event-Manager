"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { AcquisitionState, PackingStatus, PrintItem } from "@prisma/client";
import { PartyField, parsePartyValue, type PartyOptions, type ContactOptions } from "@/app/events/av-orders/party-field";
import { LocationSelect, type LocationOption } from "@/components/ui/LocationSelect";
import {
  ACQUISITION_LABEL,
  ACQUISITION_OPTIONS,
  PACKING_STATUS_CLASS,
  PACKING_STATUS_LABEL,
  PACKING_STATUS_OPTIONS,
} from "@/lib/statusConstants";
import { PackingProcurementWarning } from "@/components/PackingProcurementWarning";
import { useCanDelete, useCanWrite } from "@/components/PermissionsProvider";

type PrintItemWithParties = PrintItem & {
  designerVendor?: { name: string } | null;
  designerContact?: { firstName: string; lastName: string } | null;
  printerVendor?: { name: string } | null;
  printerContact?: { firstName: string; lastName: string } | null;
  sourceLocation?: { id: string; name: string } | null;
};

type PrintItemPanelProps = {
  items: PrintItemWithParties[];
  locationOptions: LocationOption[];
  distributionOptions: { id: string; label: string }[];
  vendors: PartyOptions;
  contacts: ContactOptions;
  createItem: (formData: FormData) => Promise<void>;
  updateItem: (id: string, formData: FormData) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  updateItemAcquisitionState: (id: string, acquisitionState: AcquisitionState) => Promise<void>;
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
  defaultQuantity = "",
  defaultAcquisitionState = "TO_PROCURE",
  defaultPackingStatus = "NEEDED",
  defaultDistributionMethod = "",
  defaultDistributionNotes = "",
  defaultDesignerVendorId = "",
  defaultDesignerContactId = "",
  defaultPrinterVendorId = "",
  defaultPrinterContactId = "",
  defaultNotes = "",
  defaultSourceLocationId = "",
  locationOptions,
  distributionOptions,
  vendors,
  contacts,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  defaultDescription?: string;
  defaultQuantity?: number | string;
  defaultAcquisitionState?: AcquisitionState;
  defaultPackingStatus?: PackingStatus;
  defaultDistributionMethod?: string;
  defaultDistributionNotes?: string;
  defaultDesignerVendorId?: string;
  defaultDesignerContactId?: string;
  defaultPrinterVendorId?: string;
  defaultPrinterContactId?: string;
  defaultNotes?: string;
  defaultSourceLocationId?: string;
  locationOptions: LocationOption[];
  distributionOptions: { id: string; label: string }[];
  vendors: PartyOptions;
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
            placeholder="e.g. Presenter handout"
            className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Quantity</label>
          <input
            type="number"
            name="quantity"
            min={1}
            defaultValue={defaultQuantity}
            placeholder="e.g. 250"
            className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Acquisition</label>
          <select
            name="acquisitionState"
            defaultValue={defaultAcquisitionState}
            className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          >
            {ACQUISITION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Packing</label>
          <select
            name="packingStatus"
            defaultValue={defaultPackingStatus}
            className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          >
            {PACKING_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Distribution</label>
          <select
            name="distributionMethod"
            defaultValue={defaultDistributionMethod}
            className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          >
            <option value="">— Select —</option>
            {distributionOptions.map((o) => (
              <option key={o.id} value={o.label}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Distribution Notes</label>
          <input
            type="text"
            name="distributionNotes"
            defaultValue={defaultDistributionNotes}
            placeholder="e.g. 1 per seat, extras at registration table"
            className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Designer</label>
          <PartyField
            fieldPrefix="designer"
            vendors={vendors}
            contacts={contacts}
            contactsLabel="Contacts"
            defaultVendorId={defaultDesignerVendorId || null}
            defaultContactId={defaultDesignerContactId || null}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Printer</label>
          <PartyField
            fieldPrefix="printer"
            vendors={vendors}
            contacts={contacts}
            contactsLabel="Contacts"
            defaultVendorId={defaultPrinterVendorId || null}
            defaultContactId={defaultPrinterContactId || null}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
            Comes from
          </label>
          <LocationSelect
            name="sourceLocationId"
            options={locationOptions}
            defaultValue={defaultSourceLocationId}
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

function partyDisplay(
  vendor: { name: string } | null | undefined,
  contact: { firstName: string; lastName: string } | null | undefined
) {
  if (vendor) return vendor.name;
  if (contact) return [contact.firstName, contact.lastName].filter(Boolean).join(" ");
  return null;
}

export function PrintItemPanel({
  items,
  locationOptions,
  distributionOptions,
  vendors,
  contacts,
  createItem,
  updateItem,
  deleteItem,
  updateItemAcquisitionState,
}: PrintItemPanelProps) {
  const canWrite = useCanWrite("PRINT_ORDERS");
  const canDelete = useCanDelete("PRINT_ORDERS");
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
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Print Items</h2>
        {!showAddForm && canWrite && (
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
            locationOptions={locationOptions}
            distributionOptions={distributionOptions}
            vendors={vendors}
            contacts={contacts}
            onSubmit={handleCreate}
            onCancel={() => setShowAddForm(false)}
            submitLabel="Add"
          />
        </div>
      )}

      {items.length === 0 && !showAddForm ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No print items yet.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              {editingId === item.id ? (
                <ItemForm
                  defaultDescription={item.description}
                  defaultQuantity={item.quantity ?? ""}
                  defaultAcquisitionState={item.acquisitionState}
                  defaultPackingStatus={item.packingStatus}
                  defaultDistributionMethod={item.distributionMethod ?? ""}
                  defaultDistributionNotes={item.distributionNotes ?? ""}
                  defaultDesignerVendorId={item.designerVendorId ?? ""}
                  defaultDesignerContactId={item.designerContactId ?? ""}
                  defaultPrinterVendorId={item.printerVendorId ?? ""}
                  defaultPrinterContactId={item.printerContactId ?? ""}
                  defaultNotes={item.notes ?? ""}
                  defaultSourceLocationId={item.sourceLocationId ?? ""}
                  locationOptions={locationOptions}
                  distributionOptions={distributionOptions}
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
                      {item.quantity && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">× {item.quantity}</span>
                      )}
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        · {ACQUISITION_LABEL[item.acquisitionState]}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${PACKING_STATUS_CLASS[item.packingStatus]}`}>
                        {PACKING_STATUS_LABEL[item.packingStatus]}
                      </span>
                      {item.distributionMethod && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">· {item.distributionMethod}</span>
                      )}
                      <PackingProcurementWarning
                        packingStatus={item.packingStatus}
                        acquisitionState={item.acquisitionState}
                        onFix={() => updateItemAcquisitionState(item.id, "ON_HAND")}
                      />
                    </div>
                    {item.distributionNotes && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{item.distributionNotes}</p>
                    )}
                    <div className="flex gap-4 mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {partyDisplay(item.designerVendor, item.designerContact) && (
                        <span>Designer: {partyDisplay(item.designerVendor, item.designerContact)}</span>
                      )}
                      {partyDisplay(item.printerVendor, item.printerContact) && (
                        <span>Printer: {partyDisplay(item.printerVendor, item.printerContact)}</span>
                      )}
                      {item.sourceLocation && <span>From: {item.sourceLocation.name}</span>}
                    </div>
                    {item.notes && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{item.notes}</p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {canWrite && (
                      <button onClick={() => setEditingId(item.id)} className="text-blue-600 dark:text-blue-400 hover:underline text-sm">
                        Edit
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={async () => {
                          if (confirm("Delete this item?")) await deleteItem(item.id);
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
      )}
    </div>
  );
}
