"use client";

import { useState, useTransition } from "react";
import type { EntityStatus } from "@prisma/client";

type SubstatusOption = { id: string; label: string; group: string | null };

type Props = {
  status: EntityStatus | null;
  substatuses: SubstatusOption[];
  cancel: (substatus: string) => Promise<void>;
  restore: () => Promise<void>;
  deleteAction: () => Promise<void>;
  confirmMessage: string;
};

export function CancelOrDeleteButton({
  status,
  substatuses,
  cancel,
  restore,
  deleteAction,
  confirmMessage,
}: Props) {
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelSubstatus, setCancelSubstatus] = useState("");
  const [isPending, startTransition] = useTransition();

  const isCancelled = status === "CANCELLED";
  const cancelledSubstatuses = substatuses.filter((s) => s.group === "CANCELLED");

  function handleDelete() {
    if (confirm(confirmMessage)) {
      startTransition(async () => {
        await deleteAction();
      });
    }
  }

  function handleRestore() {
    startTransition(async () => {
      await restore();
    });
  }

  function handleCancel(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await cancel(cancelSubstatus);
      setShowCancelModal(false);
    });
  }

  if (isCancelled) {
    return (
      <>
        <button
          type="button"
          onClick={handleRestore}
          disabled={isPending}
          className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
        >
          Restore
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className="px-4 py-2 text-red-600 border border-red-600 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
        >
          Delete
        </button>
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setCancelSubstatus(""); setShowCancelModal(true); }}
        className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        Cancel
      </button>

      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-6 w-full max-w-sm mx-4">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">Cancel</h2>
            <form onSubmit={handleCancel} className="space-y-4">
              {cancelledSubstatuses.length > 0 && (
                <div>
                  <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Reason</label>
                  <select
                    value={cancelSubstatus}
                    onChange={(e) => setCancelSubstatus(e.target.value)}
                    className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">None</option>
                    {cancelledSubstatuses.map((s) => (
                      <option key={s.id} value={s.label}>{s.label}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="text-sm px-4 py-2 border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="text-sm px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                >
                  Confirm Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
