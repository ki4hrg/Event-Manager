"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PermissionResource, RfpSpaceKind } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import { formatNight } from "@/lib/hotels";
import { SPACE_KIND_LABELS } from "@/lib/rfp/sections";
import { formatClockRange, sortSpaceRows, type SpaceRow } from "@/lib/rfp/space";
import type { RfpSpaceArgs } from "./core";

// The RFP's function-space and F&B rows (APEX function grid), grouped by day.
// Rows are entered by hand or copied from the event's functions and catering
// orders with "Add from functions".

type Row = SpaceRow & { key: number; id: string | null };

const inputClass =
  "mt-1 block w-full px-2 py-1.5 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 text-sm";
const smallLabel = "block text-xs font-medium text-gray-600 dark:text-gray-400";
const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6";
const rowCard = "border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2";
const checkClass = "rounded border-gray-300 dark:border-gray-600";

function TypeSelect({ value, options, onChange, label }: { value: string | null; options: string[]; onChange: (v: string | null) => void; label: string }) {
  return (
    <select aria-label={label} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className={inputClass}>
      <option value="">—</option>
      {value && !options.includes(value) && <option value={value}>{value}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function FromFunctions({
  rows,
  candidates,
  onAdd,
  onClose,
}: {
  rows: Row[];
  candidates: SpaceRow[];
  onAdd: (rows: SpaceRow[]) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [kind, setKind] = useState<"" | RfpSpaceKind>("");
  const [type, setType] = useState("");
  const [day, setDay] = useState("");
  const [withRooms, setWithRooms] = useState(false);

  // Already copied in: the same function or catering order on the same day and start.
  const copied = (c: SpaceRow) =>
    rows.some((r) => (c.functionId ? r.functionId === c.functionId : r.cateringOrderId === c.cateringOrderId) && r.day === c.day && r.startTime === c.startTime);
  const shown = candidates
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => (!kind || c.kind === kind) && (!type || c.functionType === type) && (!day || c.day === day));
  const days = Array.from(new Set(candidates.map((c) => c.day)));
  const types = Array.from(new Set(candidates.filter((c) => !kind || c.kind === kind).flatMap((c) => (c.functionType ? [c.functionType] : [])))).sort();
  const pickable = shown.filter(({ c }) => !copied(c));
  const allPicked = pickable.length > 0 && pickable.every(({ i }) => picked.has(i));

  if (candidates.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
        No scheduled functions or catering orders.
        <button type="button" onClick={onClose} className="text-blue-600 dark:text-blue-400 hover:underline">
          Close
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-3 border border-blue-200 dark:border-blue-900 rounded-lg p-3">
      <div className="flex flex-wrap items-end gap-2 text-sm">
        <select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value as "" | RfpSpaceKind)} className={`${inputClass} mt-0 w-auto`}>
          <option value="">Functions & F&B</option>
          <option value="MEETING">{SPACE_KIND_LABELS.MEETING}</option>
          <option value="FB">{SPACE_KIND_LABELS.FB}</option>
        </select>
        <select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)} className={`${inputClass} mt-0 w-auto`}>
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select aria-label="Day" value={day} onChange={(e) => setDay(e.target.value)} className={`${inputClass} mt-0 w-auto`}>
          <option value="">All days</option>
          {days.map((d) => (
            <option key={d} value={d}>
              {formatNight(d)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300 pb-1.5">
          <input type="checkbox" checked={withRooms} onChange={(e) => setWithRooms(e.target.checked)} className={checkClass} />
          Include room names
        </label>
      </div>
      <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
        <input
          type="checkbox"
          checked={allPicked}
          onChange={(e) =>
            setPicked((prev) => {
              const next = new Set(prev);
              for (const { i } of pickable) {
                if (e.target.checked) next.add(i);
                else next.delete(i);
              }
              return next;
            })
          }
          className={checkClass}
        />
        Select all shown
      </label>
      <div className="max-h-80 overflow-y-auto space-y-3">
        {days
          .filter((d) => shown.some(({ c }) => c.day === d))
          .map((d) => (
            <div key={d}>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{formatNight(d)}</p>
              {shown
                .filter(({ c }) => c.day === d)
                .map(({ c, i }) => {
                  const done = copied(c);
                  return (
                    <label key={i} className={`flex items-start gap-2 py-1 text-sm ${done ? "text-gray-400 dark:text-gray-500" : "text-gray-900 dark:text-white"}`}>
                      <input
                        type="checkbox"
                        disabled={done}
                        checked={done || picked.has(i)}
                        onChange={(e) =>
                          setPicked((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(i);
                            else next.delete(i);
                            return next;
                          })
                        }
                        className={`${checkClass} mt-0.5`}
                      />
                      <span>
                        {c.name}
                        <span className="text-gray-500 dark:text-gray-400">
                          {" "}
                          · {[formatClockRange(c.startTime, c.endTime), c.functionType, c.attendance != null ? `${c.attendance}` : null].filter(Boolean).join(" · ")}
                          {done && " · added"}
                        </span>
                      </span>
                    </label>
                  );
                })}
            </div>
          ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={picked.size === 0}
          onClick={() => {
            onAdd(candidates.filter((_, i) => picked.has(i)).map((c) => (withRooms ? c : { ...c, room: null })));
            onClose();
          }}
          className={`${btnPrimary} disabled:opacity-50`}
        >
          Add {picked.size || ""}
        </button>
        <button type="button" onClick={onClose} className={btnSecondary}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function RfpSpaceEditor({
  resource,
  rows: initial,
  defaultDay,
  functionTypes,
  mealTypes,
  setupTypes,
  loadCandidates,
  save,
}: {
  resource: PermissionResource;
  rows: (SpaceRow & { id: string })[];
  defaultDay: string;
  functionTypes: string[];
  mealTypes: string[];
  setupTypes: string[];
  loadCandidates: () => Promise<SpaceRow[]>;
  save: (rows: RfpSpaceArgs[]) => Promise<void>;
}) {
  const router = useRouter();
  const canWrite = useCanWrite(resource);
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);
  // The event's functions and catering orders, loaded when "Add from functions" opens.
  const [candidates, setCandidates] = useState<SpaceRow[] | null>(null);
  const [loading, startLoading] = useTransition();
  const [nextKey, setNextKey] = useState(initial.length);
  const [rows, setRows] = useState<Row[]>(initial.map((r, i) => ({ ...r, key: i })));

  const update = (next: Row[]) => {
    setRows(next);
    setDirty(true);
  };
  const set = (key: number, patch: Partial<Row>) => update(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const append = (added: SpaceRow[]) => {
    update([...rows, ...added.map((r, i) => ({ ...r, key: nextKey + i, id: null }))]);
    setNextKey((k) => k + added.length);
  };
  const blank = (kind: RfpSpaceKind): SpaceRow => ({
    kind,
    functionId: null,
    cateringOrderId: null,
    day: defaultDay,
    startTime: null,
    endTime: null,
    functionType: null,
    name: "",
    attendance: null,
    setup: null,
    areaSqFt: null,
    av: null,
    hold24: false,
    room: null,
  });
  const onSave = () =>
    startTransition(async () => {
      await save(sortSpaceRows(rows).map(({ key: _key, ...r }) => r));
      setDirty(false);
      router.refresh();
    });
  const int = (v: string) => (v === "" ? null : parseInt(v));
  const days = Array.from(new Set(sortSpaceRows(rows).map((r) => r.day)));

  return (
    <div className={`${cardClass} space-y-4`}>
      <h2 className="text-lg font-medium text-gray-900 dark:text-white">Function space & F&B</h2>
      {rows.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No function space requested.</p>}
      <fieldset disabled={!canWrite} className="space-y-4">
        {days.map((d) => (
          <div key={d} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{formatNight(d)}</p>
            {sortSpaceRows(rows.filter((r) => r.day === d)).map((r) => {
              const meeting = r.kind === "MEETING";
              const id = `space-${r.key}`;
              return (
                <div key={r.key} className={rowCard}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{SPACE_KIND_LABELS[r.kind]}</span>
                    {canWrite && (
                      <button type="button" onClick={() => update(rows.filter((x) => x.key !== r.key))} className="text-xs text-red-600 dark:text-red-400 hover:underline">
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                    <label className={`${smallLabel} col-span-2 sm:col-span-3`}>
                      {meeting ? "Function" : "Meal"}
                      <input id={`${id}-name`} value={r.name} onChange={(e) => set(r.key, { name: e.target.value })} className={inputClass} />
                    </label>
                    <label className={smallLabel}>
                      Day
                      <input type="date" value={r.day} onChange={(e) => e.target.value && set(r.key, { day: e.target.value })} className={inputClass} />
                    </label>
                    <label className={smallLabel}>
                      Start
                      <input type="time" value={r.startTime ?? ""} onChange={(e) => set(r.key, { startTime: e.target.value || null })} className={inputClass} />
                    </label>
                    <label className={smallLabel}>
                      End
                      <input type="time" value={r.endTime ?? ""} onChange={(e) => set(r.key, { endTime: e.target.value || null })} className={inputClass} />
                    </label>
                    <label className={smallLabel}>
                      Type
                      <TypeSelect label="Type" value={r.functionType} options={meeting ? functionTypes : mealTypes} onChange={(v) => set(r.key, { functionType: v })} />
                    </label>
                    {meeting && (
                      <label className={smallLabel}>
                        Set-up
                        <TypeSelect label="Set-up" value={r.setup} options={setupTypes} onChange={(v) => set(r.key, { setup: v })} />
                      </label>
                    )}
                    <label className={smallLabel}>
                      Attendees
                      <input type="number" min={0} value={r.attendance ?? ""} onChange={(e) => set(r.key, { attendance: int(e.target.value) })} className={inputClass} />
                    </label>
                    {meeting && (
                      <label className={smallLabel}>
                        Sq ft
                        <input type="number" min={0} value={r.areaSqFt ?? ""} onChange={(e) => set(r.key, { areaSqFt: int(e.target.value) })} className={inputClass} />
                      </label>
                    )}
                    <label className={smallLabel}>
                      Room
                      <input value={r.room ?? ""} onChange={(e) => set(r.key, { room: e.target.value || null })} className={inputClass} />
                    </label>
                    <label className={`${smallLabel} col-span-2`}>
                      A/V
                      <input value={r.av ?? ""} onChange={(e) => set(r.key, { av: e.target.value || null })} className={inputClass} />
                    </label>
                    {meeting && (
                      <label className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300 sm:mt-5">
                        <input type="checkbox" checked={r.hold24} onChange={(e) => set(r.key, { hold24: e.target.checked })} className={checkClass} />
                        24-hr hold
                      </label>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </fieldset>
      {canWrite && candidates && <FromFunctions rows={rows} candidates={candidates} onAdd={append} onClose={() => setCandidates(null)} />}
      {canWrite && (
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={onSave} disabled={pending || !dirty} className={`${btnPrimary} disabled:opacity-50`}>
            {pending ? "Saving..." : "Save function space"}
          </button>
          <button type="button" onClick={() => append([blank("MEETING")])} className={btnSecondary}>
            + Meeting space
          </button>
          <button type="button" onClick={() => append([blank("FB")])} className={btnSecondary}>
            + Food & beverage
          </button>
          {!candidates && (
            <button
              type="button"
              disabled={loading}
              onClick={() => startLoading(async () => setCandidates(await loadCandidates()))}
              className={`${btnSecondary} disabled:opacity-50`}
            >
              {loading ? "Loading..." : "Add from functions"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
