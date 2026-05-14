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
  standalone?: boolean;
};

export function EntityStatusPanel({
  status,
  substatus,
  substatuses,
  setStatus,
  standalone = true,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [editStatus, setEditStatus] = useState<EntityStatus | "">(status && status !== "CANCELLED" ? status : "");
  const [editSubstatus, setEditSubstatus] = useState<string>(substatus ?? "");
  const [isPending, startTransition] = useTransition();

  const isCancelled = status === "CANCELLED";
  const filteredSubstatuses = substatuses.filter((s) => s.group === editStatus);

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

  const editForm = (
    <form onSubmit={handleSave} className="space-y-3 mt-2">
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
  );

  const statusBadge = status ? (
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
  );

  if (!standalone) {
    return editing ? editForm : (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</span>
          {statusBadge}
        </div>
        {!isCancelled && (
          <button
            type="button"
            onClick={handleEditOpen}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Edit
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Status</h2>
        {!isCancelled && !editing && (
          <button
            type="button"
            onClick={handleEditOpen}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Edit
          </button>
        )}
      </div>
      {editing ? editForm : statusBadge}
    </div>
  );
}
