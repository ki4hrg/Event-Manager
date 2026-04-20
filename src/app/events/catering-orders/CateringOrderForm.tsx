"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { CateringOrder, CustomOption } from "@prisma/client";
import { ReadOnlyField } from "@/components/ReadOnlyField";
import { VendorLinkControl, type AssignedVendor, type AvailableVendor } from "@/app/events/vendors/VendorLinkControl";
import { FunctionLinkControl } from "@/app/events/functions/FunctionLinkControl";

type CateringOrderFormProps = {
  cateringOrder?: CateringOrder | null;
  action: (formData: FormData) => Promise<void>;
  serviceStyleOptions: CustomOption[];
  eventId: string;
  // function linking
  linkedFunctionId?: string | null;
  linkedFunctionName?: string | null;
  linkedFunctionPath?: string | null;
  availableFunctions?: { id: string; label: string }[];
  linkFunction?: (id: string) => Promise<void>;
  unlinkFunction?: () => Promise<void>;
  // vendor linking
  assignedVendors?: AssignedVendor[];
  availableVendors?: AvailableVendor[];
  addVendor?: (vendorId: string) => Promise<void>;
  removeVendor?: (junctionId: string) => Promise<void>;
};

function SaveButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? "Saving..." : isEdit ? "Save" : "Create Catering Order"}
    </button>
  );
}

export function CateringOrderForm({
  cateringOrder,
  action,
  serviceStyleOptions,
  eventId,
  linkedFunctionId,
  linkedFunctionName,
  linkedFunctionPath,
  availableFunctions = [],
  linkFunction,
  unlinkFunction,
  assignedVendors = [],
  availableVendors = [],
  addVendor,
  removeVendor,
}: CateringOrderFormProps) {
  const isEdit = !!cateringOrder;
  const [editing, setEditing] = useState(false);

  if (isEdit && !editing) {
    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">Details</h2>
            <button
              onClick={() => setEditing(true)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Edit
            </button>
          </div>
          <dl className="space-y-4">
            <ReadOnlyField label="Name" value={cateringOrder.name} />
            <ReadOnlyField label="Service Style" value={cateringOrder.serviceStyle} />
            {linkFunction && unlinkFunction && (
              <FunctionLinkControl
                linkedFunctionId={linkedFunctionId}
                linkedFunctionName={linkedFunctionName}
                linkedFunctionPath={linkedFunctionPath}
                availableFunctions={availableFunctions}
                linkFunction={linkFunction}
                unlinkFunction={unlinkFunction}
              />
            )}
            {addVendor && removeVendor && (
              <VendorLinkControl
                mode="edit"
                assignedVendors={assignedVendors}
                availableVendors={availableVendors}
                addVendor={addVendor}
                removeVendor={removeVendor}
              />
            )}
          </dl>
        </div>

        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Guest Counts</h2>
          <dl className="grid grid-cols-3 gap-4">
            <ReadOnlyField label="Expected" value={cateringOrder.expectedCount != null ? String(cateringOrder.expectedCount) : null} />
            <ReadOnlyField label="Confirmed" value={cateringOrder.confirmedCount != null ? String(cateringOrder.confirmedCount) : null} />
            <ReadOnlyField label="Guarantee" value={cateringOrder.guaranteeCount != null ? String(cateringOrder.guaranteeCount) : null} />
          </dl>
        </div>
      </div>
    );
  }

  return (
    <form
      action={async (formData) => {
        await action(formData);
        if (isEdit) setEditing(false);
      }}
      className="space-y-6 max-w-2xl"
    >
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Details</h2>
        <div className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              defaultValue={cateringOrder?.name}
              placeholder="e.g., Opening Dinner, Lunch Day 1"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="serviceStyle" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Service Style
            </label>
            <select
              id="serviceStyle"
              name="serviceStyle"
              defaultValue={cateringOrder?.serviceStyle || ""}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Select —</option>
              {serviceStyleOptions.map((opt) => (
                <option key={opt.id} value={opt.label}>{opt.label}</option>
              ))}
            </select>
          </div>
          {!isEdit && (
            <VendorLinkControl
              mode="create"
              availableVendors={availableVendors}
            />
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Guest Counts</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="expectedCount" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Expected
            </label>
            <input
              type="number"
              id="expectedCount"
              name="expectedCount"
              defaultValue={cateringOrder?.expectedCount ?? ""}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="confirmedCount" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Confirmed
            </label>
            <input
              type="number"
              id="confirmedCount"
              name="confirmedCount"
              defaultValue={cateringOrder?.confirmedCount ?? ""}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="guaranteeCount" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Guarantee
            </label>
            <input
              type="number"
              id="guaranteeCount"
              name="guaranteeCount"
              defaultValue={cateringOrder?.guaranteeCount ?? ""}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        <SaveButton isEdit={isEdit} />
        {isEdit ? (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
        ) : (
          <a
            href={`/events/${eventId}/catering-orders`}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </a>
        )}
      </div>
    </form>
  );
}
