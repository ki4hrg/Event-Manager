"use client";

import { useState, useTransition } from "react";
import type { PackingStatus } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import {
  PACKING_STATUS_CLASS,
  PACKING_STATUS_LABEL,
  PACKING_STATUS_OPTIONS,
} from "@/lib/statusConstants";

type PackingStatusPanelProps = {
  packingStatus: PackingStatus | null;
  itemCount: number;
  updatePackingStatus: (status: PackingStatus | null) => Promise<void>;
};

export function PackingStatusPanel({ packingStatus, itemCount, updatePackingStatus }: PackingStatusPanelProps) {
  const canWrite = useCanWrite("PRINT_ORDERS");
  const [pendingStatus, setPendingStatus] = useState<PackingStatus | "" | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSelect = (value: string) => {
    if (value === "") {
      startTransition(async () => {
        await updatePackingStatus(null);
      });
      return;
    }
    const next = value as PackingStatus;
    if (itemCount === 0) {
      startTransition(async () => {
        await updatePackingStatus(next);
      });
      return;
    }
    setPendingStatus(next);
  };

  const confirmCascade = () => {
    if (!pendingStatus) return;
    const next = pendingStatus as PackingStatus;
    startTransition(async () => {
      await updatePackingStatus(next);
      setPendingStatus(null);
    });
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Packing Status
      </label>
      <div className="flex items-center gap-2">
        <select
          value={packingStatus ?? ""}
          disabled={isPending || pendingStatus !== null || !canWrite}
          onChange={(e) => onSelect(e.target.value)}
          className={`text-sm rounded px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:opacity-50 ${packingStatus ? PACKING_STATUS_CLASS[packingStatus] : ""}`}
        >
          <option value="">— Not set —</option>
          {PACKING_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      {pendingStatus && (
        <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm">
          <p className="text-amber-800 dark:text-amber-200">
            This will mark all {itemCount} item{itemCount === 1 ? "" : "s"} as{" "}
            <span className="font-medium">{PACKING_STATUS_LABEL[pendingStatus as PackingStatus]}</span>.
            Individual items can still be changed afterward.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={confirmCascade}
              disabled={isPending}
              className="px-3 py-1 bg-amber-600 text-white text-sm rounded hover:bg-amber-700 disabled:opacity-50"
            >
              {isPending ? "Applying..." : "Apply to all items"}
            </button>
            <button
              type="button"
              onClick={() => setPendingStatus(null)}
              disabled={isPending}
              className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
