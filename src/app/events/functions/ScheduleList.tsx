"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { FunctionSchedule, CustomOption } from "@prisma/client";
import { colorClasses } from "@/lib/colors";
import { resolveOptionLabel, resolveOptionColor } from "@/lib/optionUtils";
import type { RoomConflict } from "@/lib/conflicts";
import { ConflictWarning } from "@/components/ConflictWarning";
import { useCanDelete, useCanWrite } from "@/components/PermissionsProvider";
import { InlineConfirmButton } from "@/components/InlineConfirmButton";

type ScheduleListProps = {
  schedules: FunctionSchedule[];
  scheduleTypes: CustomOption[];
  functionId: string;
  timezone: string;
  // Event.startDate / Event.endDate — plain calendar dates (UTC midnight,
  // populated from a date input; see the comment on formatEventDate in
  // agendaUtils.ts). Used only to bound the day picker below, so only the
  // YYYY-MM-DD portion is read — no timezone conversion needed.
  eventStartDate: Date;
  eventEndDate: Date;
  createSchedule: (formData: FormData) => Promise<{ conflicts: RoomConflict[] } | undefined>;
  updateSchedule: (scheduleId: string, formData: FormData) => Promise<{ conflicts: RoomConflict[] } | undefined>;
  deleteSchedule: (scheduleId: string) => Promise<void>;
};

type ConflictFields = {
  type: string;
  startTime: string;
  endTime: string;
  notes: string;
  isPublic: boolean;
};

type PendingConflict = {
  conflicts: RoomConflict[];
  fields: ConflictFields;
  mode: "create" | "update";
  scheduleId?: string;
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? "..." : label}
    </button>
  );
}

function formatDateTimeInTimezone(date: Date, timezone: string): string {
  return new Date(date).toLocaleString("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateTimeForInput(date: Date, timezone: string): string {
  // Convert UTC date to the event's timezone for the input
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date(date));
  const values: Record<string, string> = {};
  parts.forEach((part) => {
    values[part.type] = part.value;
  });
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}


export function ScheduleList({
  schedules,
  scheduleTypes,
  functionId,
  timezone,
  eventStartDate,
  eventEndDate,
  createSchedule,
  updateSchedule,
  deleteSchedule,
}: ScheduleListProps) {
  const canWrite = useCanWrite("FUNCTIONS");
  const canDelete = useCanDelete("FUNCTIONS");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [pendingConflict, setPendingConflict] = useState<PendingConflict | null>(null);

  // Bound the datetime-local inputs to the event's own days, and default a new
  // time slot to the event's first day rather than an empty/today's-date field.
  const minDateKey = new Date(eventStartDate).toISOString().slice(0, 10);
  const maxDateKey = new Date(eventEndDate).toISOString().slice(0, 10);
  const minDateTimeLocal = `${minDateKey}T00:00`;
  const maxDateTimeLocal = `${maxDateKey}T23:59`;
  const defaultStartDateTimeLocal = `${minDateKey}T09:00`;
  const defaultEndDateTimeLocal = `${minDateKey}T10:00`;

  // Sort schedules by start time, then end time
  const sortedSchedules = [...schedules].sort((a, b) => {
    const startDiff = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    if (startDiff !== 0) return startDiff;
    return new Date(a.endTime).getTime() - new Date(b.endTime).getTime();
  });

  // Get timezone abbreviation for display
  const tzAbbrev = new Date().toLocaleString("en-US", {
    timeZone: timezone,
    timeZoneName: "short",
  }).split(" ").pop();

  function buildForcedFormData(fields: ConflictFields): FormData {
    const fd = new FormData();
    fd.set("type", fields.type);
    fd.set("startTime", fields.startTime);
    fd.set("endTime", fields.endTime);
    if (fields.notes) fd.set("notes", fields.notes);
    if (fields.isPublic) fd.set("isPublic", "true");
    fd.set("force", "true");
    return fd;
  }

  async function handleForce() {
    if (!pendingConflict) return;
    const forcedFd = buildForcedFormData(pendingConflict.fields);

    if (pendingConflict.mode === "create") {
      const result = await createSchedule(forcedFd);
      if (!result?.conflicts?.length) {
        setPendingConflict(null);
        setShowAddForm(false);
      }
    } else if (pendingConflict.mode === "update" && pendingConflict.scheduleId) {
      const result = await updateSchedule(pendingConflict.scheduleId, forcedFd);
      if (!result?.conflicts?.length) {
        setPendingConflict(null);
        setEditingId(null);
      }
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">
            Schedule
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Times shown in {tzAbbrev}
          </p>
        </div>
        {canWrite && (
          <button
            onClick={() => setShowAddForm(true)}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            Add Time Slot
          </button>
        )}
      </div>

      {scheduleTypes.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          No schedule types defined.{" "}
          <a href="/settings" className="text-blue-600 dark:text-blue-400 hover:underline">
            Add types in Settings
          </a>
        </p>
      )}

      {showAddForm && (
        <div className="mb-4">
          <form
            action={async (formData) => {
              const result = await createSchedule(formData);
              if (result?.conflicts?.length) {
                setPendingConflict({
                  conflicts: result.conflicts,
                  fields: {
                    type: formData.get("type") as string,
                    startTime: formData.get("startTime") as string,
                    endTime: formData.get("endTime") as string,
                    notes: (formData.get("notes") as string) || "",
                    isPublic: formData.get("isPublic") === "true",
                  },
                  mode: "create",
                });
              } else {
                setShowAddForm(false);
                setPendingConflict(null);
              }
            }}
            className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg"
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Type *
                  </label>
                  <select
                    name="type"
                    required
                    defaultValue={scheduleTypes[0]?.label ?? ""}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                  >
                    {scheduleTypes.map((t) => (
                      <option key={t.id} value={t.label}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Notes
                  </label>
                  <input
                    type="text"
                    name="notes"
                    placeholder="Notes..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Start ({tzAbbrev}) *
                  </label>
                  <input
                    type="datetime-local"
                    name="startTime"
                    required
                    defaultValue={defaultStartDateTimeLocal}
                    min={minDateTimeLocal}
                    max={maxDateTimeLocal}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    End ({tzAbbrev}) *
                  </label>
                  <input
                    type="datetime-local"
                    name="endTime"
                    required
                    defaultValue={defaultEndDateTimeLocal}
                    min={minDateTimeLocal}
                    max={maxDateTimeLocal}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  name="isPublic"
                  value="true"
                  className="rounded border-gray-300 dark:border-gray-700 text-blue-600 dark:text-blue-400 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Public</span>
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <SubmitButton label="Add" />
              <button
                type="button"
                onClick={() => { setShowAddForm(false); setPendingConflict(null); }}
                className="px-3 py-1.5 text-gray-600 dark:text-gray-400 text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
          {pendingConflict?.mode === "create" && (
            <div className="mt-3">
              <ConflictWarning
                conflicts={pendingConflict.conflicts}
                timezone={timezone}
                onCancel={() => setPendingConflict(null)}
                onConfirm={handleForce}
              />
            </div>
          )}
        </div>
      )}

      {schedules.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          No schedule items yet. Add a time slot to define when this function occurs.
        </p>
      ) : (
        <div className="space-y-2">
          {sortedSchedules.map((schedule) => (
            <div
              key={schedule.id}
              className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
            >
              {editingId === schedule.id ? (
                <>
                  <form
                    action={async (formData) => {
                      const result = await updateSchedule(schedule.id, formData);
                      if (result?.conflicts?.length) {
                        setPendingConflict({
                          conflicts: result.conflicts,
                          fields: {
                            type: formData.get("type") as string,
                            startTime: formData.get("startTime") as string,
                            endTime: formData.get("endTime") as string,
                            notes: (formData.get("notes") as string) || "",
                            isPublic: formData.get("isPublic") === "true",
                          },
                          mode: "update",
                          scheduleId: schedule.id,
                        });
                      } else {
                        setEditingId(null);
                        setPendingConflict(null);
                      }
                    }}
                    className="space-y-4"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Type
                        </label>
                        <select
                          name="type"
                          required
                          defaultValue={schedule.type}
                          className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                        >
                          {scheduleTypes.map((t) => (
                            <option key={t.id} value={t.label}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Notes
                        </label>
                        <input
                          type="text"
                          name="notes"
                          defaultValue={schedule.notes || ""}
                          placeholder="Notes"
                          className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Start ({tzAbbrev})
                        </label>
                        <input
                          type="datetime-local"
                          name="startTime"
                          required
                          defaultValue={formatDateTimeForInput(schedule.startTime, timezone)}
                          min={minDateTimeLocal}
                          max={maxDateTimeLocal}
                          className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                          End ({tzAbbrev})
                        </label>
                        <input
                          type="datetime-local"
                          name="endTime"
                          required
                          defaultValue={formatDateTimeForInput(schedule.endTime, timezone)}
                          min={minDateTimeLocal}
                          max={maxDateTimeLocal}
                          className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                    </div>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        name="isPublic"
                        value="true"
                        defaultChecked={schedule.isPublic}
                        className="rounded border-gray-300 dark:border-gray-700 text-blue-600 dark:text-blue-400 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Public</span>
                    </label>
                    <div className="flex gap-2">
                      <SubmitButton label="Save" />
                      <button
                        type="button"
                        onClick={() => { setEditingId(null); setPendingConflict(null); }}
                        className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                  {pendingConflict?.mode === "update" && pendingConflict.scheduleId === schedule.id && (
                    <div className="mt-3">
                      <ConflictWarning
                        conflicts={pendingConflict.conflicts}
                        timezone={timezone}
                        onCancel={() => setPendingConflict(null)}
                        onConfirm={handleForce}
                      />
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-wrap min-w-0">
                    <span
                      className={`px-2 py-0.5 text-xs rounded ${
                        colorClasses[resolveOptionColor(schedule.type, scheduleTypes)] || colorClasses.gray
                      }`}
                    >
                      {resolveOptionLabel(schedule.type, scheduleTypes)}
                    </span>
                    <span className="text-sm text-gray-900 dark:text-white">
                      {formatDateTimeInTimezone(schedule.startTime, timezone)} – {formatDateTimeInTimezone(schedule.endTime, timezone)}
                    </span>
                    {schedule.notes && (
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        ({schedule.notes})
                      </span>
                    )}
                    {schedule.isPublic && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">Public</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    {canWrite && (
                      <button
                        onClick={() => setEditingId(schedule.id)}
                        className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
                      >
                        Edit
                      </button>
                    )}
                    {canDelete && (
                      <InlineConfirmButton
                        onConfirm={() => deleteSchedule(schedule.id)}
                        resource="FUNCTIONS"
                      />
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
