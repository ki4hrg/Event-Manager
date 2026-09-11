"use client";

import { useState } from "react";
import { btnPrimarySm } from "@/lib/buttonStyles";
import { useFormStatus } from "react-dom";
import type { TimelineItem } from "@prisma/client";
import { formatTime } from "@/lib/agendaUtils";
import { useCanDelete, useCanWrite } from "@/components/PermissionsProvider";

type TimelineTableProps = {
  items: TimelineItem[];
  timezone: string;
  createItem: (formData: FormData) => Promise<void>;
  updateItem: (id: string, formData: FormData) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${btnPrimarySm} disabled:opacity-50`}
    >
      {pending ? "..." : label}
    </button>
  );
}

function formatTimeForInput(date: Date | null | undefined, timezone: string): string {
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(date));
  const values: Record<string, string> = {};
  parts.forEach((part) => {
    values[part.type] = part.value;
  });
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

export function TimelineTable({ items, timezone, createItem, updateItem, deleteItem }: TimelineTableProps) {
  const canWrite = useCanWrite("CATERING_ORDERS");
  const canDelete = useCanDelete("CATERING_ORDERS");
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
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Timeline</h2>
        {canWrite && (
          <button
            onClick={() => setShowAddForm(true)}
            className={btnPrimarySm}
          >
            Add Item
          </button>
        )}
      </div>

      {showAddForm && (
        <form action={handleCreate} className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Label *</label>
              <input
                type="text"
                name="label"
                required
                placeholder="e.g., Appetizer Service"
                className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
              <input
                type="text"
                name="notes"
                className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Start Time *</label>
              <input
                type="datetime-local"
                name="startTime"
                required
                className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">End Time</label>
              <input
                type="datetime-local"
                name="endTime"
                className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <SubmitButton label="Add" />
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {items.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">No timeline items yet.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              {editingId === item.id ? (
                <form action={(fd) => handleUpdate(item.id, fd)} className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Label *</label>
                      <input
                        type="text"
                        name="label"
                        required
                        defaultValue={item.label}
                        className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                      <input
                        type="text"
                        name="notes"
                        defaultValue={item.notes || ""}
                        className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Start Time *</label>
                      <input
                        type="datetime-local"
                        name="startTime"
                        required
                        defaultValue={formatTimeForInput(item.startTime, timezone)}
                        className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">End Time</label>
                      <input
                        type="datetime-local"
                        name="endTime"
                        defaultValue={formatTimeForInput(item.endTime, timezone)}
                        className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <SubmitButton label="Save" />
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-gray-900 dark:text-white font-medium">{item.label}</span>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                      {formatTime(item.startTime, timezone)}
                      {item.endTime && ` – ${formatTime(item.endTime, timezone)}`}
                      {item.notes && <span className="ml-2">· {item.notes}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 ml-2 shrink-0">
                    {canWrite && (
                      <button onClick={() => setEditingId(item.id)} className="text-blue-600 dark:text-blue-400 hover:underline text-sm">Edit</button>
                    )}
                    {canDelete && (
                      <button
                        onClick={async () => {
                          if (confirm("Delete this timeline item?")) await deleteItem(item.id);
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
