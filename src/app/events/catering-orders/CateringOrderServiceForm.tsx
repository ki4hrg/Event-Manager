"use client";

import { useFormStatus } from "react-dom";
import { btnPrimary } from "@/lib/buttonStyles";
import type { CateringOrder } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";

type CateringOrderServiceFormProps = {
  cateringOrder: CateringOrder;
  action: (formData: FormData) => Promise<void>;
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${btnPrimary} disabled:opacity-50`}
    >
      {pending ? "Saving..." : "Save"}
    </button>
  );
}

export function CateringOrderServiceForm({ cateringOrder, action }: CateringOrderServiceFormProps) {
  // This form has no view/edit toggle, so read-only is a disabled fieldset:
  // the values still read normally, they just can't be typed into.
  const canWrite = useCanWrite("CATERING_ORDERS");

  return (
    <form action={action} className="space-y-6">
      <fieldset disabled={!canWrite} className="space-y-6">
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Dietary Requirements</h2>
          <textarea
            id="dietaryNotes"
            name="dietaryNotes"
            rows={3}
            placeholder="Vegetarian, vegan, gluten-free, allergies..."
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

      {canWrite && (
        <div>
          <SaveButton />
        </div>
      )}
    </form>
  );
}
