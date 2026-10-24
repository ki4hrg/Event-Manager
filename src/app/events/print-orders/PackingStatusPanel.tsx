"use client";

import { useState, useTransition } from "react";
import type { PackingStatus } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import { PackingSubstatusSelect, type PackingSubstatusOption } from "@/components/ui/PackingSubstatusSelect";
import {
  PACKING_STATUS_CLASS,
  PACKING_STATUS_OPTIONS,
  packingStatusText,
} from "@/lib/statusConstants";

type PackingStatusPanelProps = {
  packingStatus: PackingStatus | null;
  packingSubstatus: string | null;
  substatusOptions: PackingSubstatusOption[];
  itemCount: number;
  // Omitted sub-state: kept while the status stays put, else cleared.
  updatePackingStatus: (status: PackingStatus | null, substatus?: string | null) => Promise<void>;
};

type Change = { status: PackingStatus; substatus?: string | null };

export function PackingStatusPanel({
  packingStatus,
  packingSubstatus,
  substatusOptions,
  itemCount,
  updatePackingStatus,
}: PackingStatusPanelProps) {
  const canWrite = useCanWrite("PRINT_ORDERS");
  const [pending, setPending] = useState<Change | null>(null);
  const [isPending, startTransition] = useTransition();

  const apply = (change: Change) => {
    if (itemCount > 0) {
      setPending(change);
      return;
    }
    startTransition(async () => {
      await updatePackingStatus(change.status, change.substatus);
    });
  };

  const onSelect = (value: string) => {
    if (value === "") {
      startTransition(async () => {
        await updatePackingStatus(null);
      });
      return;
    }
    apply({ status: value as PackingStatus });
  };

  const confirmCascade = () => {
    if (!pending) return;
    startTransition(async () => {
      await updatePackingStatus(pending.status, pending.substatus);
      setPending(null);
    });
  };

  const disabled = isPending || pending !== null || !canWrite;
  // A pending status change shows that status's sub-states, with none picked.
  const shownStatus = pending?.status ?? packingStatus;

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Packing Status
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={shownStatus ?? ""}
          disabled={disabled}
          onChange={(e) => onSelect(e.target.value)}
          className={`text-sm rounded px-2 py-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:opacity-50 ${shownStatus ? PACKING_STATUS_CLASS[shownStatus] : ""}`}
        >
          <option value="">— Not set —</option>
          {PACKING_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {packingStatus && !pending && (
          <PackingSubstatusSelect
            status={packingStatus}
            options={substatusOptions}
            value={packingSubstatus}
            disabled={disabled}
            onChange={(substatus) => apply({ status: packingStatus, substatus })}
            className="text-sm px-2 py-1"
          />
        )}
      </div>
      {pending && (
        <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm">
          <p className="text-amber-800 dark:text-amber-200">
            This will mark all {itemCount} item{itemCount === 1 ? "" : "s"} as{" "}
            <span className="font-medium">{packingStatusText(pending.status, pending.substatus)}</span>.
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
              onClick={() => setPending(null)}
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
