"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCanWrite } from "@/components/PermissionsProvider";
import { labelKey } from "@/lib/hotels";
import { GroupedOptionItems, type GroupedEntry } from "../GroupedOptionItems";

type Groups = { groups?: { value: string; label: string }[]; fallbackGroup?: string };

const selectClass =
  "px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm";

function Row({
  label,
  uses,
  options,
  groups,
  fallbackGroup,
  map,
  add,
}: {
  label: string;
  uses: number;
  options: GroupedEntry[];
  map: (intoId: string) => Promise<void>;
  add: () => Promise<void>;
} & Groups) {
  const router = useRouter();
  const canWrite = useCanWrite("SETTINGS");
  // A spelling of an option ("breakfast included") maps to it; it can't be
  // added as a second one.
  const same = options.find((o) => labelKey(o.label) === labelKey(label));
  const [intoId, setIntoId] = useState(same?.id ?? "");
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<void>) =>
    start(async () => {
      await fn();
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950 rounded-lg">
      <span className="font-medium text-gray-900 dark:text-white break-words min-w-0">{label}</span>
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {uses} {uses === 1 ? "use" : "uses"}
      </span>
      {canWrite && (
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <select aria-label={`Map ${label} to`} value={intoId} onChange={(e) => setIntoId(e.target.value)} className={selectClass}>
            <option value="">Map to…</option>
            <GroupedOptionItems entries={options} groups={groups} fallback={fallbackGroup} />
          </select>
          <button
            type="button"
            disabled={pending || !intoId}
            onClick={() => run(() => map(intoId))}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Map
          </button>
          {!same && (
            <button type="button" disabled={pending} onClick={() => run(add)} className="text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50">
              Add to list
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Labels in use that aren't on the list, to map onto an option or add as one.
export function OffListLabels({
  title,
  labels,
  options,
  groups,
  fallbackGroup,
  map,
  add,
}: {
  title: string;
  labels: { label: string; uses: number }[];
  options: GroupedEntry[];
  map: (label: string, intoId: string) => Promise<void>;
  add: (label: string) => Promise<void>;
} & Groups) {
  if (labels.length === 0) return null;
  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 sm:p-6 space-y-2">
      <h2 className="text-lg font-medium text-gray-900 dark:text-white">{title}</h2>
      {labels.map((l) => (
        <Row key={l.label} label={l.label} uses={l.uses} options={options} groups={groups} fallbackGroup={fallbackGroup} map={(intoId) => map(l.label, intoId)} add={() => add(l.label)} />
      ))}
    </div>
  );
}
