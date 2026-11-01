"use client";

import { useFormStatus } from "react-dom";
import type { CateringOrder, CateringOrderDietaryCount } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import { FormError, useActionError } from "@/components/FormError";
import type { UserError } from "@/lib/userErrors";

type CateringOrderServiceFormProps = {
  cateringOrder: CateringOrder & { dietaryCounts: CateringOrderDietaryCount[] };
  // The dietary_need list.
  dietaryNeeds: string[];
  action: (formData: FormData) => Promise<void | UserError>;
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? "Saving..." : "Save"}
    </button>
  );
}

export function CateringOrderServiceForm({ cateringOrder, dietaryNeeds, action }: CateringOrderServiceFormProps) {
  // This form has no view/edit toggle, so read-only is a disabled fieldset:
  // the values still read normally, they just can't be typed into.
  const canWrite = useCanWrite("CATERING_ORDERS");
  const { error, run, keepOnRefusal } = useActionError();
  const stored = new Map(cateringOrder.dietaryCounts.map((c) => [c.label, c.count]));
  // The list, then any counted label no longer on it.
  const needs = [...dietaryNeeds, ...cateringOrder.dietaryCounts.map((c) => c.label).filter((l) => !dietaryNeeds.includes(l))];

  return (
    <form
      action={async (formData) => {
        await run(() => action(formData));
      }}
      onReset={keepOnRefusal}
      className="space-y-6"
    >
      <fieldset disabled={!canWrite} className="space-y-6">
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Dietary Requirements</h2>
          {needs.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mb-4">
              {needs.map((label) => (
                <label key={label} className="flex items-center justify-between gap-3 text-sm text-gray-700 dark:text-gray-300">
                  <span className="min-w-0 break-words">{label}</span>
                  <input type="hidden" name="dietaryLabel" value={label} />
                  <input
                    type="number"
                    name="dietaryCount"
                    min={0}
                    aria-label={`${label} count`}
                    defaultValue={stored.get(label) ?? ""}
                    className="w-20 px-2 py-1 text-right border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white disabled:opacity-70"
                  />
                </label>
              ))}
            </div>
          )}
          <textarea
            id="dietaryNotes"
            name="dietaryNotes"
            rows={3}
            placeholder="Other needs and allergies..."
            defaultValue={cateringOrder.dietaryNotes || ""}
            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-70"
          />
        </div>

        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Staffing</h2>
          <textarea
            id="staffingNotes"
            name="staffingNotes"
            rows={3}
            placeholder="e.g., 2 servers, 1 manager, banquet captain..."
            defaultValue={cateringOrder.staffingNotes || ""}
            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-70"
          />
        </div>
      </fieldset>

      <FormError error={error} />

      {canWrite && (
        <div>
          <SaveButton />
        </div>
      )}
    </form>
  );
}
