"use client";

import { Fragment, useRef, useState, useTransition } from "react";
import type { PermissionResource, RfpSpaceKind } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import { DateInput } from "@/components/ui/DateInput";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import { formatNight } from "@/lib/hotels";
import { DAY_TBD, formatClockRange, sortSpaceRows, type SpaceRow } from "@/lib/rfp/space";
import { useAutosave } from "@/lib/useAutosave";
import { AutosaveStatus } from "./AutosaveStatus";
import type { RfpSpaceArgs } from "./core";

// One kind of the RFP's function-space rows (APEX function grid), grouped by
// day: meeting space, copied from the event's functions, or food &
// beverage, copied from its catering orders — or entered by hand. Rows not
// scheduled yet sit under "Day TBD".

type Row = SpaceRow & { key: number; id: string | null };

const COPY = {
  MEETING: { title: "Function space", add: "+ Meeting space", from: "Add from functions", source: "functions", empty: "No function space requested.", name: "Function" },
  FB: { title: "Food & beverage", add: "+ Food & beverage", from: "Add from catering orders", source: "catering orders", empty: "No food & beverage requested.", name: "Meal" },
} as const;

const inputClass =
  "mt-1 block w-full px-2 py-1.5 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 text-sm";
const smallLabel = "block text-xs font-medium text-gray-600 dark:text-gray-400";
const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6";
const rowCard = "border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2";
const checkClass = "rounded border-gray-300 dark:border-gray-600";
const dayHeading = "text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400";

const dayLabel = (day: string | null) => (day ? formatNight(day) : DAY_TBD);

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

function Picker({ kind, rows, candidates, onAdd, onClose }: { kind: RfpSpaceKind; rows: Row[]; candidates: SpaceRow[]; onAdd: (rows: SpaceRow[]) => void; onClose: () => void }) {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [type, setType] = useState("");
  const [day, setDay] = useState<string>("");
  const [withRooms, setWithRooms] = useState(false);

  // Already copied in: the same function or catering order at the same day and start.
  const copied = (c: SpaceRow) =>
    rows.some((r) => (kind === "MEETING" ? r.functionId === c.functionId : r.cateringOrderId === c.cateringOrderId) && r.day === c.day && r.startTime === c.startTime);
  const dayKey = (d: string | null) => d ?? DAY_TBD;
  const shown = candidates.map((c, i) => ({ c, i })).filter(({ c }) => (!type || c.functionType === type) && (!day || dayKey(c.day) === day));
  const days = Array.from(new Set(candidates.map((c) => c.day)));
  const types = Array.from(new Set(candidates.flatMap((c) => (c.functionType ? [c.functionType] : [])))).sort();
  const pickable = shown.filter(({ c }) => !copied(c));
  const allPicked = pickable.length > 0 && pickable.every(({ i }) => picked.has(i));
  const toggle = (ids: number[], on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const i of ids) {
        if (on) next.add(i);
        else next.delete(i);
      }
      return next;
    });

  if (candidates.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
        No {COPY[kind].source} yet.
        <button type="button" onClick={onClose} className="text-blue-600 dark:text-blue-400 hover:underline">
          Close
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-3 border border-blue-200 dark:border-blue-900 rounded-lg p-3">
      <div className="flex flex-wrap items-end gap-2 text-sm">
        {types.length > 1 && (
          <select aria-label="Type" value={type} onChange={(e) => setType(e.target.value)} className={`${inputClass} mt-0 w-auto`}>
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
        {days.length > 1 && (
          <select aria-label="Day" value={day} onChange={(e) => setDay(e.target.value)} className={`${inputClass} mt-0 w-auto`}>
            <option value="">All days</option>
            {days.map((d) => (
              <option key={dayKey(d)} value={dayKey(d)}>
                {dayLabel(d)}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300 pb-1.5">
          <input type="checkbox" checked={withRooms} onChange={(e) => setWithRooms(e.target.checked)} className={checkClass} />
          Include room names
        </label>
      </div>
      <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
        <input type="checkbox" checked={allPicked} onChange={(e) => toggle(pickable.map(({ i }) => i), e.target.checked)} className={checkClass} />
        Select all shown
      </label>
      <div className="max-h-80 overflow-y-auto space-y-3">
        {days
          .filter((d) => shown.some(({ c }) => c.day === d))
          .map((d) => (
            <div key={dayKey(d)}>
              <p className={dayHeading}>{dayLabel(d)}</p>
              {shown
                .filter(({ c }) => c.day === d)
                .map(({ c, i }) => {
                  const done = copied(c);
                  return (
                    <label key={i} className={`flex items-start gap-2 py-1 text-sm ${done ? "text-gray-400 dark:text-gray-500" : "text-gray-900 dark:text-white"}`}>
                      <input type="checkbox" disabled={done} checked={done || picked.has(i)} onChange={(e) => toggle([i], e.target.checked)} className={`${checkClass} mt-0.5`} />
                      <span>
                        {c.name}
                        <span className="text-gray-500 dark:text-gray-400">
                          {" "}
                          · {[c.endDay ? `through ${formatNight(c.endDay)}` : null, c.startTime ? formatClockRange(c.startTime, c.endTime) : null, c.functionType, c.attendance != null ? `${c.attendance}` : null].filter(Boolean).join(" · ")}
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
  kind,
  resource,
  rows: initial,
  defaultDay,
  types,
  setupTypes,
  loadCandidates,
  save,
}: {
  kind: RfpSpaceKind;
  resource: PermissionResource;
  rows: (SpaceRow & { id: string })[];
  defaultDay: string | null;
  // function_type labels for meeting space, meal_type labels for F&B.
  types: string[];
  setupTypes: string[];
  loadCandidates: () => Promise<SpaceRow[]>;
  save: (rows: RfpSpaceArgs[]) => Promise<(string | null)[]>;
}) {
  const canWrite = useCanWrite(resource);
  const copy = COPY[kind];
  const meeting = kind === "MEETING";
  const [candidates, setCandidates] = useState<SpaceRow[] | null>(null);
  const [loading, startLoading] = useTransition();
  const [nextKey, setNextKey] = useState(initial.length);
  // Rows keep their place while being edited — re-sorting on every change
  // would move (and remount) the row under the cursor, closing an open date
  // picker. They're sorted on load, and saved sorted.
  const [rows, setRows] = useState<Row[]>(() => sortSpaceRows(initial).map((r, i) => ({ ...r, key: i })));
  // Saved ids by row key: a row created by one save is updated by the next.
  const ids = useRef(new Map(rows.flatMap((r) => (r.id ? [[r.key, r.id] as const] : []))));
  const status = useAutosave(rows, async (sent) => {
    const sorted = sortSpaceRows(sent);
    const saved = await save(sorted.map(({ key, ...r }) => ({ ...r, id: ids.current.get(key) ?? null })));
    sorted.forEach((r, i) => {
      const id = saved[i];
      if (id) ids.current.set(r.key, id);
    });
  });

  const update = (next: Row[]) => setRows(next);
  const set = (key: number, patch: Partial<Row>) => update(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const append = (added: SpaceRow[]) => {
    update([...rows, ...added.map((r, i) => ({ ...r, key: nextKey + i, id: null }))]);
    setNextKey((k) => k + added.length);
  };
  const blank: SpaceRow = {
    kind,
    functionId: null,
    cateringOrderId: null,
    day: defaultDay,
    endDay: null,
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
  };
  const int = (v: string) => (v === "" ? null : parseInt(v));

  return (
    <div className={`${cardClass} space-y-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">{copy.title}</h2>
        <AutosaveStatus {...status} />
      </div>
      {rows.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">{copy.empty}</p>}
      <fieldset disabled={!canWrite} className="space-y-2">
        {rows.map((r, i) => (
          <Fragment key={r.key}>
            {(i === 0 || rows[i - 1].day !== r.day) && <p className={`${dayHeading} ${i === 0 ? "" : "pt-2"}`}>{dayLabel(r.day)}</p>}
            <div className={rowCard}>
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                <label className={`${smallLabel} col-span-2 sm:col-span-3`}>
                  {copy.name}
                  <input value={r.name} onChange={(e) => set(r.key, { name: e.target.value })} className={inputClass} />
                </label>
                <label className={smallLabel}>
                  Day
                  <DateInput value={r.day ?? ""} onChange={(v) => set(r.key, { day: v || null, ...(v ? {} : { endDay: null }) })} className={inputClass} />
                </label>
                <label className={smallLabel}>
                  Through
                  <DateInput
                    disabled={!r.day}
                    min={r.day ?? undefined}
                    value={r.endDay ?? ""}
                    onChange={(v) => set(r.key, { endDay: v || null })}
                    className={inputClass}
                  />
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
                  <TypeSelect label="Type" value={r.functionType} options={types} onChange={(v) => set(r.key, { functionType: v })} />
                </label>
                {meeting && (
                  <label className={smallLabel}>
                    Requested set-up
                    <TypeSelect label="Requested set-up" value={r.setup} options={setupTypes} onChange={(v) => set(r.key, { setup: v })} />
                  </label>
                )}
                <label className={smallLabel}>
                  Attendees
                  <input type="number" min={0} value={r.attendance ?? ""} onChange={(e) => set(r.key, { attendance: int(e.target.value) })} className={inputClass} />
                </label>
                {meeting && (
                  <label className={smallLabel}>
                    Approx. sq ft
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
              {canWrite && (
                <button type="button" onClick={() => update(rows.filter((x) => x.key !== r.key))} className="text-xs text-red-600 dark:text-red-400 hover:underline">
                  Remove
                </button>
              )}
            </div>
          </Fragment>
        ))}
      </fieldset>
      {canWrite && candidates && <Picker kind={kind} rows={rows} candidates={candidates} onAdd={append} onClose={() => setCandidates(null)} />}
      {canWrite && (
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => append([blank])} className={btnSecondary}>
            {copy.add}
          </button>
          {!candidates && (
            <button
              type="button"
              disabled={loading}
              onClick={() => startLoading(async () => setCandidates((await loadCandidates()).filter((c) => c.kind === kind)))}
              className={`${btnSecondary} disabled:opacity-50`}
            >
              {loading ? "Loading..." : copy.from}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
