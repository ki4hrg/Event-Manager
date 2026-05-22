"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EntityStatus, StatusModelType, CustomOption } from "@prisma/client";
import { EDIT_STATUS_OPTIONS, STATUS_MODEL_LABEL } from "@/lib/statusConstants";
import { btnPrimary, btnOutlinedSm } from "@/lib/buttonStyles";

const ALL_MODEL_TYPES: StatusModelType[] = [
  "FUNCTION",
  "PRESENTATION",
  "AV_ORDER",
  "CATERING_ORDER",
  "SETUP_ORDER",
  "PRINT_ORDER",
  "SUPPLY_ORDER",
  "MEDIA_DELIVERABLE",
];

const DEFAULT_ROW = { status: "PENDING" as EntityStatus, substatus: "" };

type StatusDefault = {
  modelType: StatusModelType;
  status: EntityStatus;
  substatus: string | null;
};

type StatusDefaultsPanelProps = {
  defaults: StatusDefault[];
  substatuses: CustomOption[];
  saveAll: (
    overrides: Array<{ modelType: StatusModelType; status: EntityStatus; substatus: string | null }>
  ) => Promise<void>;
  clearDefault: (modelType: StatusModelType) => Promise<void>;
};

export function StatusDefaultsPanel({
  defaults,
  substatuses,
  saveAll,
  clearDefault,
}: StatusDefaultsPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [clearingRow, setClearingRow] = useState<StatusModelType | null>(null);

  const [rows, setRows] = useState<Map<StatusModelType, { status: EntityStatus; substatus: string }>>(
    () => {
      const m = new Map<StatusModelType, { status: EntityStatus; substatus: string }>();
      for (const d of defaults) {
        m.set(d.modelType, { status: d.status, substatus: d.substatus ?? "" });
      }
      return m;
    }
  );

  const getRow = (modelType: StatusModelType) => rows.get(modelType) ?? DEFAULT_ROW;

  const setRowField = (
    modelType: StatusModelType,
    field: "status" | "substatus",
    value: string
  ) => {
    setRows((prev) => {
      const current = prev.get(modelType) ?? DEFAULT_ROW;
      const updated =
        field === "status"
          ? { status: value as EntityStatus, substatus: "" }
          : { ...current, substatus: value };
      return new Map(prev).set(modelType, updated);
    });
  };

  const handleClear = (modelType: StatusModelType) => {
    setClearingRow(modelType);
    setRows((prev) => {
      const next = new Map(prev);
      next.delete(modelType);
      return next;
    });
    startTransition(async () => {
      await clearDefault(modelType);
      router.refresh();
      setClearingRow(null);
    });
  };

  const handleSave = () => {
    startTransition(async () => {
      const overrides = Array.from(rows.entries()).map(([modelType, row]) => ({
        modelType,
        status: row.status,
        substatus: row.substatus || null,
      }));
      await saveAll(overrides);
      router.refresh();
    });
  };

  const selectClass =
    "text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
          Default Status on Create
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Overrides the system default (Pending) for new items created in this event.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
        {ALL_MODEL_TYPES.map((modelType) => {
          const row = getRow(modelType);
          const hasOverride = defaults.some((d) => d.modelType === modelType);
          const availableSubstatuses = substatuses.filter((s) => s.group === row.status);

          return (
            <div key={modelType} className="flex flex-wrap items-center gap-2 p-3">
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
              {hasOverride && (
                <button
                  type="button"
                  onClick={() => handleClear(modelType)}
                  disabled={isPending}
                  className={`${btnOutlinedSm} disabled:opacity-50`}
                >
                  {clearingRow === modelType ? "Clearing…" : "Clear"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className={`${btnPrimary} disabled:opacity-50`}
        >
          {isPending && clearingRow === null ? "Saving…" : "Save defaults"}
        </button>
      </div>
    </div>
  );
}
