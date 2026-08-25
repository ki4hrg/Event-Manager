"use client";

import { useFormStatus } from "react-dom";
import type { Vendor } from "@prisma/client";
import { MODEL_TYPES } from "./model-types";
import { useCanWrite } from "@/components/PermissionsProvider";

type VendorFormProps = {
  vendor?: Vendor;
  action: (formData: FormData) => Promise<void>;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? "Saving..." : "Save Vendor"}
    </button>
  );
}

export function VendorForm({ vendor, action }: VendorFormProps) {
  // No view/edit toggle on this form, so read-only is a disabled fieldset.
  const canWrite = useCanWrite("VENDORS");

  return (
    <form action={action} className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 space-y-4">
      <fieldset disabled={!canWrite} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Name *
          </label>
          <input
            type="text"
            name="name"
            required
            defaultValue={vendor?.name || ""}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Models
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Leave unchecked to make this vendor available for all order types.
          </p>
          <div className="space-y-2">
            {MODEL_TYPES.map((type) => (
              <label key={type.value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="models"
                  value={type.value}
                  defaultChecked={vendor?.models.includes(type.value)}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                <span className="text-gray-700 dark:text-gray-300">{type.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Notes
          </label>
          <textarea
            name="notes"
            rows={3}
            defaultValue={vendor?.notes || ""}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>

      </fieldset>

      {canWrite && <SubmitButton />}
    </form>
  );
}
