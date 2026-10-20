"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PermissionResource } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnPrimary } from "@/lib/buttonStyles";
import { CONCESSION_GROUPS, concessionGroupOf } from "@/lib/rfp/sections";
import type { RfpConcessionArgs } from "./core";

const inputClass =
  "px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm";
const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6";

const OTHER = "__other__";

// custom: the label was typed rather than picked from the rfp_concession list.
type Row = { key: number; id: string | null; label: string; custom: boolean; value: string; required: boolean };

export function RfpConcessionsEditor({
  resource,
  concessions,
  options,
  save,
}: {
  resource: PermissionResource;
  concessions: RfpConcessionArgs[];
  options: { label: string; group: string | null }[];
  save: (concessions: RfpConcessionArgs[]) => Promise<void>;
}) {
  const router = useRouter();
  const canWrite = useCanWrite(resource);
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);
  const known = new Map(options.map((o) => [o.label, o.group]));
  const [nextKey, setNextKey] = useState(concessions.length);
  const [rows, setRows] = useState<Row[]>(
    concessions.map((c, i) => ({ key: i, id: c.id ?? null, label: c.label, custom: !known.has(c.label), value: c.value ?? "", required: c.required })),
  );
  const used = new Set(rows.map((r) => r.label));

  const update = (next: Row[]) => {
    setRows(next);
    setDirty(true);
  };
  const set = (key: number, patch: Partial<Row>) => update(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const add = (label: string, custom: boolean) => {
    update([...rows, { key: nextKey, id: null, label, custom, value: "", required: false }]);
    setNextKey((k) => k + 1);
  };
  const onSave = () =>
    startTransition(async () => {
      await save(rows.map((r) => ({ id: r.id, label: r.label, value: r.value || null, required: r.required })));
      setDirty(false);
      router.refresh();
    });

  const groupOf = (r: Row) => concessionGroupOf(r.custom ? null : known.get(r.label));

  return (
    <div className={`${cardClass} space-y-4`}>
      <h2 className="text-lg font-medium text-gray-900 dark:text-white">Concessions</h2>
      <fieldset disabled={!canWrite} className="space-y-4">
        {rows.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">None listed.</p>}
        {CONCESSION_GROUPS.map((g) => {
          const inGroup = rows.filter((r) => groupOf(r) === g.value);
          if (inGroup.length === 0) return null;
          return (
            <div key={g.value} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{g.label}</p>
              {inGroup.map((r) => (
                <div key={r.key} className="flex flex-wrap items-center gap-2">
                  {r.custom ? (
                    <input aria-label="Concession" value={r.label} onChange={(e) => set(r.key, { label: e.target.value })} className={`${inputClass} flex-1 min-w-[10rem]`} />
                  ) : (
                    <select
                      aria-label="Concession"
                      value={r.label}
                      onChange={(e) => set(r.key, e.target.value === OTHER ? { custom: true, label: "" } : { label: e.target.value })}
                      className={`${inputClass} flex-1 min-w-[10rem]`}
                    >
                      {options
                        .filter((o) => o.label === r.label || !used.has(o.label))
                        .map((o) => (
                          <option key={o.label} value={o.label}>
                            {o.label}
                          </option>
                        ))}
                      <option value={OTHER}>Other…</option>
                    </select>
                  )}
                  <input
                    aria-label="Requested"
                    placeholder="1/40, 20%, 30 days…"
                    value={r.value}
                    onChange={(e) => set(r.key, { value: e.target.value })}
                    className={`${inputClass} flex-1 min-w-[8rem]`}
                  />
                  <label className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                    <input type="checkbox" checked={r.required} onChange={(e) => set(r.key, { required: e.target.checked })} className="rounded border-gray-300 dark:border-gray-600" />
                    Required
                  </label>
                  {canWrite && (
                    <button type="button" onClick={() => update(rows.filter((x) => x.key !== r.key))} className="text-sm text-red-600 dark:text-red-400 hover:underline">
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          );
        })}
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
              if (e.target.value === OTHER) add("", true);
              else if (e.target.value) add(e.target.value, false);
            }}
            className={inputClass}
          >
            <option value="">+ Concession</option>
            {CONCESSION_GROUPS.map((g) => {
              const unused = options.filter((o) => concessionGroupOf(o.group) === g.value && !used.has(o.label));
              return unused.length ? (
                <optgroup key={g.value} label={g.label}>
                  {unused.map((o) => (
                    <option key={o.label} value={o.label}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
            <option value={OTHER}>Other…</option>
          </select>
        </div>
      )}
    </div>
  );
}
