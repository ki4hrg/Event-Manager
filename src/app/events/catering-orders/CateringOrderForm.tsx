"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { CateringOrder, CustomOption } from "@prisma/client";
import { ReadOnlyField } from "@/components/ReadOnlyField";
import { VendorLinkControl, type AssignedVendor, type AvailableVendor } from "@/app/events/vendors/VendorLinkControl";
import type { ResponsiblePartyOptions } from "@/app/vendors/actions";
import { ResponsiblePartyField } from "@/components/ResponsiblePartyField";
import { useCanWrite } from "@/components/PermissionsProvider";
import { FormError, useActionError } from "@/components/FormError";
import { keepFormValues } from "@/lib/keepFormValues";
import type { UserError } from "@/lib/userErrors";

type CateringOrderFormProps = {
  cateringOrder?: CateringOrder | null;
  action: (formData: FormData) => Promise<void | UserError>;
  serviceStyleOptions: CustomOption[];
  mealTypeOptions?: CustomOption[];
  eventId: string;
  createFunctions?: { id: string; label: string }[];
  defaultFunctionId?: string;
  // vendor linking
  assignedVendors?: AssignedVendor[];
  availableVendors?: AvailableVendor[];
  addVendor?: (vendorId: string) => Promise<void>;
  removeVendor?: (junctionId: string) => Promise<void>;
  responsiblePartyOptions?: ResponsiblePartyOptions;
  noCard?: boolean;
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
  mealTypeOptions = [],
  eventId,
  createFunctions,
  defaultFunctionId,
  assignedVendors = [],
  availableVendors = [],
  addVendor,
  removeVendor,
  responsiblePartyOptions,
  noCard = false,
}: CateringOrderFormProps) {
  const isEdit = !!cateringOrder;
  // Read-only users get the detail view with no way back into edit mode.
  const canWrite = useCanWrite("CATERING_ORDERS");
  const [editing, setEditing] = useState(false);
  const { error, setError, run } = useActionError();

  const cardClass = noCard ? "" : "bg-white dark:bg-gray-800 shadow rounded-lg p-6";

  if (isEdit && (!editing || !canWrite)) {
    return (
      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Details</h2>
          {canWrite && (
            <button
              onClick={() => { setError(null); setEditing(true); }}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Edit
            </button>
          )}
        </div>
        <dl className="space-y-4">
          <ReadOnlyField label="Name" value={cateringOrder.name} />
          <ReadOnlyField label="Meal Type" value={cateringOrder.mealType} />
          <ReadOnlyField label="Service Style" value={cateringOrder.serviceStyle} />
          <ReadOnlyField label="Notes" value={cateringOrder.notes} />
          {addVendor && removeVendor && (
            <VendorLinkControl
              mode="edit"
              resource="CATERING_ORDERS"
              assignedVendors={assignedVendors}
              availableVendors={availableVendors}
              addVendor={addVendor}
              removeVendor={removeVendor}
            />
          )}
        </dl>
      </div>
    );
  }

  return (
    <form
      action={async (formData) => {
        if ((await run(() => action(formData))) && isEdit) setEditing(false);
      }}
      onReset={keepFormValues}
      className={noCard ? "space-y-0" : "space-y-6 max-w-2xl"}
    >
      <div className={cardClass}>
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
            <label htmlFor="mealType" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Meal Type
            </label>
            <select
              id="mealType"
              name="mealType"
              defaultValue={cateringOrder?.mealType || ""}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Select —</option>
              {cateringOrder?.mealType && !mealTypeOptions.some((o) => o.label === cateringOrder.mealType) && (
                <option value={cateringOrder.mealType}>{cateringOrder.mealType}</option>
              )}
              {mealTypeOptions.map((opt) => (
                <option key={opt.id} value={opt.label}>{opt.label}</option>
              ))}
            </select>
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
              {cateringOrder?.serviceStyle && !serviceStyleOptions.some((o) => o.label === cateringOrder?.serviceStyle) && <option value={cateringOrder?.serviceStyle}>{cateringOrder?.serviceStyle}</option>}
              {serviceStyleOptions.map((opt) => (
                <option key={opt.id} value={opt.label}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={cateringOrder?.notes || ""}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {!isEdit && createFunctions && createFunctions.length > 0 && (
            <div>
              <label htmlFor="functionId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Function <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <select
                id="functionId"
                name="functionId"
                defaultValue={defaultFunctionId ?? ""}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— No function —</option>
                {createFunctions.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </div>
          )}
          {!isEdit ? (
            responsiblePartyOptions ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vendor</label>
                <ResponsiblePartyField options={responsiblePartyOptions} name="vendorId" />
              </div>
            ) : null
          ) : addVendor && removeVendor ? (
            <VendorLinkControl
              mode="edit"
              resource="CATERING_ORDERS"
              assignedVendors={assignedVendors}
              availableVendors={availableVendors}
              addVendor={addVendor}
              removeVendor={removeVendor}
            />
          ) : null}
        </div>
      </div>

      <FormError error={error} className={noCard ? "my-4" : ""} />
      <div className="flex gap-4">
        <SaveButton isEdit={isEdit} />
        {isEdit ? (
          <button
            type="button"
            onClick={() => { setError(null); setEditing(false); }}
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
