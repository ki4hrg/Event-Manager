"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PermissionResource } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnPrimary } from "@/lib/buttonStyles";
import type { RfpConcessionArgs } from "./core";

const inputClass =
  "px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm";
const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6";

type Row = { id: string | null; label: string; value: string; required: boolean };

export function RfpConcessionsEditor({
  resource,
  concessions,
  options,
  save,
}: {
  resource: PermissionResource;
  concessions: RfpConcessionArgs[];
  options: string[];
  save: (concessions: RfpConcessionArgs[]) => Promise<void>;
}) {
  const router = useRouter();
  const canWrite = useCanWrite(resource);
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);
  const [rows, setRows] = useState<Row[]>(concessions.map((c) => ({ id: c.id ?? null, label: c.label, value: c.value ?? "", required: c.required })));
  const used = new Set(rows.map((r) => r.label));
  const unused = options.filter((o) => !used.has(o));

  const update = (next: Row[]) => {
    setRows(next);
    setDirty(true);
  };
  const set = (i: number, patch: Partial<Row>) => update(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const onSave = () =>
    startTransition(async () => {
      await save(rows.map((r) => ({ id: r.id, label: r.label, value: r.value || null, required: r.required })));
      setDirty(false);
      router.refresh();
    });

  return (
    <div className={`${cardClass} space-y-4`}>
      <h2 className="text-lg font-medium text-gray-900 dark:text-white">Concessions</h2>
      <fieldset disabled={!canWrite} className="space-y-2">
        {rows.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">None listed.</p>}
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input
              aria-label="Concession"
              value={r.label}
              onChange={(e) => set(i, { label: e.target.value })}
              className={`${inputClass} flex-1 min-w-[10rem]`}
            />
            <input
              aria-label="Requested"
              placeholder="1/40, 20%, 30 days…"
              value={r.value}
              onChange={(e) => set(i, { value: e.target.value })}
              className={`${inputClass} flex-1 min-w-[8rem]`}
            />
            <label className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={r.required}
                onChange={(e) => set(i, { required: e.target.checked })}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              Required
            </label>
            {canWrite && (
              <button type="button" onClick={() => update(rows.filter((_, j) => j !== i))} className="text-sm text-red-600 dark:text-red-400 hover:underline">
                Remove
              </button>
            )}
          </div>
        ))}
      </fieldset>
      {canWrite && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={onSave} disabled={pending || !dirty} className={`${btnPrimary} disabled:opacity-50`}>
            {pending ? "Saving..." : "Save concessions"}
          </button>
          <select
            aria-label="Add concession"
            value=""
            onChange={(e) => {
              if (e.target.value === "__other__") update([...rows, { id: null, label: "", value: "", required: false }]);
              else if (e.target.value) update([...rows, { id: null, label: e.target.value, value: "", required: false }]);
            }}
            className={inputClass}
          >
            <option value="">+ Concession</option>
            {unused.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
            <option value="__other__">Other…</option>
          </select>
        </div>
      )}
    </div>
  );
}
