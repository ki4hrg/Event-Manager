"use client";

import { useFormStatus } from "react-dom";
import type { CateringOrder } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import { FormError, useActionError } from "@/components/FormError";
import type { UserError } from "@/lib/userErrors";

type CateringOrderContractFormProps = {
  cateringOrder: CateringOrder;
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

function formatDateForInput(date: Date | null | undefined): string {
  if (!date) return "";
  return new Date(date).toISOString().split("T")[0];
}

export function CateringOrderContractForm({ cateringOrder, action }: CateringOrderContractFormProps) {
  // No view/edit toggle here either — see CateringOrderServiceForm.
  const canWrite = useCanWrite("CATERING_ORDERS");
  const { error, run, keepOnRefusal } = useActionError();

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
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Minimums</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="rentalMinimum" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Rental Minimum ($)
              </label>
              <input
                type="number"
                id="rentalMinimum"
                name="rentalMinimum"
                step="0.01"
                defaultValue={cateringOrder.rentalMinimum != null ? String(cateringOrder.rentalMinimum) : ""}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="fbMinimum" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                F&B Minimum ($)
              </label>
              <input
                type="number"
                id="fbMinimum"
                name="fbMinimum"
                step="0.01"
                defaultValue={cateringOrder.fbMinimum != null ? String(cateringOrder.fbMinimum) : ""}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
        </div>
        </div>

        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Deadlines</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="depositDeadline" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Deposit
              </label>
              <input
                type="date"
                id="depositDeadline"
                name="depositDeadline"
                defaultValue={formatDateForInput(cateringOrder.depositDeadline)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="guaranteeDeadline" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Guarantee Count
              </label>
              <input
                type="date"
                id="guaranteeDeadline"
                name="guaranteeDeadline"
                defaultValue={formatDateForInput(cateringOrder.guaranteeDeadline)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="paymentDeadline" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Final Payment
              </label>
              <input
                type="date"
                id="paymentDeadline"
                name="paymentDeadline"
                defaultValue={formatDateForInput(cateringOrder.paymentDeadline)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
        </div>
        </div>

        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Cancellation / Attrition Terms</h2>
          <textarea
            id="cancellationTerms"
            name="cancellationTerms"
            rows={3}
            defaultValue={cateringOrder.cancellationTerms || ""}
            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Additional Notes</h2>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={cateringOrder.notes || ""}
            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </fieldset>

      <FormError error={error} />

      {canWrite && <SaveButton />}
    </form>
  );
}
