"use client";

import { useState, useTransition } from "react";
import type { EntityStatus } from "@prisma/client";
import { STATUS_LABEL, STATUS_CLASS, EDIT_STATUS_OPTIONS } from "@/lib/statusConstants";

type SubstatusOption = { id: string; label: string; group: string | null };

type Props = {
  entityType: string;
  entityId: string;
  eventId: string;
  status: EntityStatus | null;
  substatus: string | null;
  substatuses: SubstatusOption[];
  setStatus: (formData: FormData) => Promise<void>;
  cancel: (substatus: string) => Promise<void>;
  restore: () => Promise<void>;
};

export function EntityStatusPanel({
  status,
  substatus,
  substatuses,
  setStatus,
  cancel,
  restore,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [editStatus, setEditStatus] = useState<EntityStatus | "">(status && status !== "CANCELLED" ? status : "");
  const [editSubstatus, setEditSubstatus] = useState<string>(substatus ?? "");
  const [cancelSubstatus, setCancelSubstatus] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const isCancelled = status === "CANCELLED";

  const filteredSubstatuses = substatuses.filter((s) => s.group === editStatus);
  const cancelledSubstatuses = substatuses.filter((s) => s.group === "CANCELLED");

  function handleEditOpen() {
    setEditStatus(status && status !== "CANCELLED" ? status : "");
    setEditSubstatus(substatus ?? "");
    setEditing(true);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("status", editStatus);
    fd.set("substatus", editSubstatus);
    startTransition(async () => {
      await setStatus(fd);
      setEditing(false);
    });
  }

  function handleCancel(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await cancel(cancelSubstatus);
      setShowCancelModal(false);
    });
  }

  function handleRestore() {
    startTransition(async () => {
      await restore();
    });
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Status</h3>
        <div className="flex gap-2">
          {!isCancelled && !editing && (
            <button
              type="button"
              onClick={handleEditOpen}
              className="text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Status</label>
            <select
              value={editStatus}
              onChange={(e) => {
                setEditStatus(e.target.value as EntityStatus | "");
                setEditSubstatus("");
              }}
              className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="">None</option>
              {EDIT_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          {editStatus && filteredSubstatuses.length > 0 && (
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Substatus</label>
              <select
                value={editSubstatus}
                onChange={(e) => setEditSubstatus(e.target.value)}
                className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                <option value="">None</option>
                {filteredSubstatuses.map((s) => (
                  <option key={s.id} value={s.label}>{s.label}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-xs px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          <div>
            {status ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_CLASS[status]}`}>
                  {STATUS_LABEL[status]}
                </span>
                {substatus && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">{substatus}</span>
                )}
              </div>
            ) : (
              <span className="text-sm text-gray-400 dark:text-gray-500">Not set</span>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            {isCancelled ? (
              <button
                type="button"
                onClick={handleRestore}
                disabled={isPending}
                className="text-xs px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                Restore
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { setCancelSubstatus(""); setShowCancelModal(true); }}
                className="text-xs px-3 py-1.5 border border-red-300 dark:border-red-700 rounded text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

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
    </div>
  );
}
