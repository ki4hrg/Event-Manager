"use client";

import { actionErrorMessage, isUserError, type UserError } from "@/lib/userErrors";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PermissionResource } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import { labelKey } from "@/lib/hotels";
import type { OptionCategory } from "@/lib/optionCategories";
import { GroupedOptionItems, type GroupedEntry } from "./GroupedOptionItems";
import { createOption, mapOffListLabel } from "./actions";

type Groups = { groups?: { value: string; label: string }[]; fallbackGroup?: string };

const selectClass =
  "px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm";

function Row({
  category,
  resource,
  label,
  uses,
  options,
  groups,
  fallbackGroup,
}: {
  category: OptionCategory;
  resource: PermissionResource;
  label: string;
  uses: number;
  options: GroupedEntry[];
} & Groups) {
  const router = useRouter();
  const canWrite = useCanWrite(resource);
  // A spelling of an option ("breakfast included") maps to it; it can't be
  // added as a second one.
  const same = options.find((o) => labelKey(o.label) === labelKey(label));
  const [intoId, setIntoId] = useState(same?.id ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<void | UserError>) =>
    start(async () => {
      setError(null);
      try {
        const result = await fn();
        if (isUserError(result)) return setError(result.error);
        router.refresh();
      } catch (e) {
        setError(actionErrorMessage(e, "Couldn't save. Try again."));
      }
    });
  const add = () => {
    const formData = new FormData();
    formData.set("label", label);
    return createOption(category, formData);
  };
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
            onClick={() => run(() => mapOffListLabel(category, label, intoId))}
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
      {error && (
        <p role="alert" className="basis-full text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

// Labels in use that aren't on the list, to map onto an option or add as one.
export function OffListLabels({
  category,
  resource,
  title,
  labels,
  options,
  groups,
  fallbackGroup,
}: {
  category: OptionCategory;
  resource: PermissionResource;
  title: string;
  labels: { label: string; uses: number }[];
  options: GroupedEntry[];
} & Groups) {
  if (labels.length === 0) return null;
  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 sm:p-6 space-y-2">
      <h2 className="text-lg font-medium text-gray-900 dark:text-white">{title}</h2>
      {labels.map((l) => (
        <Row
          key={l.label}
          category={category}
          resource={resource}
          label={l.label}
          uses={l.uses}
          options={options}
          groups={groups}
          fallbackGroup={fallbackGroup}
        />
      ))}
    </div>
  );
}
