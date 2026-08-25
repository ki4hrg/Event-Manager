"use client";

import { useState, useTransition } from "react";
import type { AcquisitionState, PackingStatus } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import {
  ACQUISITION_LABEL,
  ACQUISITION_OPTIONS,
  PACKING_STATUS_LABEL,
  PACKING_STATUS_OPTIONS,
} from "@/lib/statusConstants";

type Props = {
  itemCount: number;
  bulkSetPacking: (status: PackingStatus) => Promise<void>;
  bulkSetAcquisition: (state: AcquisitionState) => Promise<void>;
};

export function BulkItemStatusPanel({ itemCount, bulkSetPacking, bulkSetAcquisition }: Props) {
  const canWrite = useCanWrite("SUPPLY_ORDERS");
  const [pendingPacking, setPendingPacking] = useState<PackingStatus | null>(null);
  const [pendingAcquisition, setPendingAcquisition] = useState<AcquisitionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // The panel does nothing but write, so it has no read-only form.
  if (itemCount === 0 || !canWrite) return null;

  const onPackingSelect = (value: string) => {
    if (!value) return;
    setError(null);
    setPendingPacking(value as PackingStatus);
  };

  const onAcquisitionSelect = (value: string) => {
    if (!value) return;
    setError(null);
    setPendingAcquisition(value as AcquisitionState);
  };

  const confirmPacking = () => {
    if (!pendingPacking) return;
    setError(null);
    startTransition(async () => {
      try {
        await bulkSetPacking(pendingPacking);
        setPendingPacking(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update packing status");
      }
    });
  };

  const confirmAcquisition = () => {
    if (!pendingAcquisition) return;
    setError(null);
    startTransition(async () => {
      try {
        await bulkSetAcquisition(pendingAcquisition);
        setPendingAcquisition(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update acquisition state");
      }
    });
  };

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 mb-4 pb-4 space-y-3">
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Set all items</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Packing status</label>
          <select
            value=""
            disabled={isPending || pendingPacking !== null}
            onChange={(e) => onPackingSelect(e.target.value)}
            className="w-full text-sm rounded px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:opacity-50"
          >
            <option value="">Set all to…</option>
            {PACKING_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Acquisition state</label>
          <select
            value=""
            disabled={isPending || pendingAcquisition !== null}
            onChange={(e) => onAcquisitionSelect(e.target.value)}
            className="w-full text-sm rounded px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:opacity-50"
          >
            <option value="">Set all to…</option>
            {ACQUISITION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-2 text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      {pendingPacking && (
        <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm">
          <p className="text-amber-800 dark:text-amber-200">
            Mark all {itemCount} item{itemCount === 1 ? "" : "s"} as packing{" "}
            <span className="font-medium">{PACKING_STATUS_LABEL[pendingPacking]}</span>?
            Individual items can still be changed afterward.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={confirmPacking}
              disabled={isPending}
              className="px-3 py-1 bg-amber-600 text-white text-sm rounded hover:bg-amber-700 disabled:opacity-50"
            >
              {isPending ? "Applying..." : "Apply to all items"}
            </button>
            <button
              type="button"
              onClick={() => setPendingPacking(null)}
              disabled={isPending}
              className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {pendingAcquisition && (
        <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm">
          <p className="text-amber-800 dark:text-amber-200">
            Mark all {itemCount} item{itemCount === 1 ? "" : "s"} as acquisition{" "}
            <span className="font-medium">{ACQUISITION_LABEL[pendingAcquisition]}</span>?
            Individual items can still be changed afterward.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={confirmAcquisition}
              disabled={isPending}
              className="px-3 py-1 bg-amber-600 text-white text-sm rounded hover:bg-amber-700 disabled:opacity-50"
            >
              {isPending ? "Applying..." : "Apply to all items"}
            </button>
            <button
              type="button"
              onClick={() => setPendingAcquisition(null)}
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
