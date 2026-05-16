"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EntityStatus, StatusModelType, CustomOption } from "@prisma/client";
import { EDIT_STATUS_OPTIONS, STATUS_MODEL_LABEL } from "@/lib/statusConstants";

const ALL_MODEL_TYPES: StatusModelType[] = [
  "FUNCTION",
  "PRESENTATION",
  "AV_ORDER",
  "CATERING_ORDER",
  "SETUP_ORDER",
  "PRINT_ORDER",
  "MEDIA_ORDER",
];

type StatusDefault = {
  modelType: StatusModelType;
  status: EntityStatus;
  substatus: string | null;
};

type StatusDefaultsPanelProps = {
  defaults: StatusDefault[];
  substatuses: CustomOption[];
  setDefault: (modelType: StatusModelType, status: EntityStatus, substatus: string | null) => Promise<void>;
  clearDefault: (modelType: StatusModelType) => Promise<void>;
};

export function StatusDefaultsPanel({
  defaults,
  substatuses,
  setDefault,
  clearDefault,
}: StatusDefaultsPanelProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [rows, setRows] = useState<
    Map<StatusModelType, { status: EntityStatus; substatus: string }>
  >(() => {
    const m = new Map<StatusModelType, { status: EntityStatus; substatus: string }>();
    for (const d of defaults) {
      m.set(d.modelType, { status: d.status, substatus: d.substatus ?? "" });
    }
    return m;
  });

  const [saving, setSaving] = useState<Set<StatusModelType>>(new Set());

  const getRow = (modelType: StatusModelType) =>
    rows.get(modelType) ?? { status: "PENDING" as EntityStatus, substatus: "" };

  const setRowField = (
    modelType: StatusModelType,
    field: "status" | "substatus",
    value: string
  ) => {
    setRows((prev) => {
      const current = prev.get(modelType) ?? { status: "PENDING" as EntityStatus, substatus: "" };
      const updated =
        field === "status"
          ? { status: value as EntityStatus, substatus: "" }
          : { ...current, substatus: value };
      return new Map(prev).set(modelType, updated);
    });
  };

  const handleSave = (modelType: StatusModelType) => {
    const row = getRow(modelType);
    setSaving((prev) => new Set(prev).add(modelType));
    startTransition(async () => {
      await setDefault(modelType, row.status, row.substatus || null);
      router.refresh();
      setSaving((prev) => {
        const next = new Set(prev);
        next.delete(modelType);
        return next;
      });
    });
  };

  const handleClear = (modelType: StatusModelType) => {
    setSaving((prev) => new Set(prev).add(modelType));
    startTransition(async () => {
      await clearDefault(modelType);
      setRows((prev) => {
        const next = new Map(prev);
        next.delete(modelType);
        return next;
      });
      router.refresh();
      setSaving((prev) => {
        const next = new Set(prev);
        next.delete(modelType);
        return next;
      });
    });
  };

  const selectClass =
    "text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white";

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
        Default Status on Create
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Overrides the system default (Pending) for new items created in this event.
      </p>
      <div className="space-y-3">
        {ALL_MODEL_TYPES.map((modelType) => {
          const row = getRow(modelType);
          const hasOverride = defaults.some((d) => d.modelType === modelType);
          const isPending = saving.has(modelType);
          const availableSubstatuses = substatuses.filter((s) => s.group === row.status);

          return (
            <div key={modelType} className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-700 dark:text-gray-300 w-36 shrink-0">
                {STATUS_MODEL_LABEL[modelType]}
              </span>
              <select
                value={row.status}
                onChange={(e) => setRowField(modelType, "status", e.target.value)}
                className={selectClass}
                disabled={isPending}
              >
                {EDIT_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select
                value={row.substatus}
                onChange={(e) => setRowField(modelType, "substatus", e.target.value)}
                className={selectClass}
                disabled={isPending || availableSubstatuses.length === 0}
              >
                <option value="">(none)</option>
                {availableSubstatuses.map((s) => (
                  <option key={s.id} value={s.label}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => handleSave(modelType)}
                disabled={isPending}
                className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Save"}
              </button>
              {hasOverride && (
                <button
                  onClick={() => handleClear(modelType)}
                  disabled={isPending}
                  className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  Clear
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
