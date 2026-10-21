"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PermissionResource } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import { DateInput } from "@/components/ui/DateInput";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import { formatNight } from "@/lib/hotels";
import { formatClockRange } from "@/lib/rfp/space";
import type { LineItemRow } from "@/lib/rfp/lineItems";
import type { RfpLineItemArgs } from "./core";

// A vendor RFP's line items: copied from the event's orders of the RFP's
// kind ("Add from AV orders") or typed in. Rows keep their place while
// edited; the group is the heading each prints under.

type Row = LineItemRow & { key: number; id: string | null };

const inputClass =
  "mt-1 block w-full px-2 py-1.5 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 text-sm";
const smallLabel = "block text-xs font-medium text-gray-600 dark:text-gray-400";
const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6";
const rowCard = "border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2";
const checkClass = "rounded border-gray-300 dark:border-gray-600";
const groupHeading = "text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400";

// The order item a row came from, to mark candidates already copied in.
const sourceKey = (r: LineItemRow) =>
  r.equipmentItemId ?? r.printItemId ?? r.cateringLineItemId ?? (r.cateringOrderId ? `meal:${r.cateringOrderId}` : null);

const when = (r: LineItemRow) =>
  [r.day ? `${formatNight(r.day)}${r.endDay ? ` – ${formatNight(r.endDay)}` : ""}` : null, r.startTime ? formatClockRange(r.startTime, r.endTime) : null]
    .filter(Boolean)
    .join(" · ");

function Picker({ rows, candidates, source, onAdd, onClose }: { rows: Row[]; candidates: LineItemRow[]; source: string; onAdd: (rows: LineItemRow[]) => void; onClose: () => void }) {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const have = new Set(rows.map(sourceKey).filter(Boolean));
  const copied = (c: LineItemRow) => have.has(sourceKey(c));
  const pickable = candidates.map((c, i) => ({ c, i })).filter(({ c }) => !copied(c));
  const groups = Array.from(new Set(candidates.map((c) => c.group ?? "")));
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
        No {source} yet.
        <button type="button" onClick={onClose} className="text-blue-600 dark:text-blue-400 hover:underline">
          Close
        </button>
      </div>
    );
  }
  const allPicked = pickable.length > 0 && pickable.every(({ i }) => picked.has(i));
  return (
    <div className="space-y-3 border border-blue-200 dark:border-blue-900 rounded-lg p-3">
      <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">
        <input type="checkbox" checked={allPicked} onChange={(e) => toggle(pickable.map(({ i }) => i), e.target.checked)} className={checkClass} />
        Select all
      </label>
      <div className="max-h-80 overflow-y-auto space-y-3">
        {groups.map((g) => {
          const inGroup = candidates.map((c, i) => ({ c, i })).filter(({ c }) => (c.group ?? "") === g);
          const open = inGroup.filter(({ c }) => !copied(c)).map(({ i }) => i);
          return (
            <div key={g}>
              <label className={`flex items-center gap-1.5 ${groupHeading}`}>
                <input
                  type="checkbox"
                  disabled={open.length === 0}
                  checked={open.length > 0 && open.every((i) => picked.has(i))}
                  onChange={(e) => toggle(open, e.target.checked)}
                  className={checkClass}
                />
                {g || "Other"}
              </label>
              {inGroup.map(({ c, i }) => {
                const done = copied(c);
                return (
                  <label key={i} className={`ml-5 flex items-start gap-2 py-1 text-sm ${done ? "text-gray-400 dark:text-gray-500" : "text-gray-900 dark:text-white"}`}>
                    <input type="checkbox" disabled={done} checked={done || picked.has(i)} onChange={(e) => toggle([i], e.target.checked)} className={`${checkClass} mt-0.5`} />
                    <span>
                      {c.description}
                      <span className="text-gray-500 dark:text-gray-400">
                        {" "}
                        · {[c.quantity != null ? `${c.quantity}${c.unit ? ` ${c.unit}` : ""}` : null, when(c) || null].filter(Boolean).join(" · ") || "—"}
                        {done && " · added"}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={picked.size === 0}
          onClick={() => {
            onAdd(candidates.filter((_, i) => picked.has(i)));
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

export function RfpLineItemsEditor({
  resource,
  rows: initial,
  source,
  loadCandidates,
  save,
}: {
  resource: PermissionResource;
  rows: (LineItemRow & { id: string })[];
  // "AV orders", "catering orders"…; null when the kind has none to copy from.
  source: string | null;
  loadCandidates: () => Promise<LineItemRow[]>;
  save: (rows: RfpLineItemArgs[]) => Promise<void>;
}) {
  const router = useRouter();
  const canWrite = useCanWrite(resource);
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<LineItemRow[] | null>(null);
  const [loading, startLoading] = useTransition();
  const [nextKey, setNextKey] = useState(initial.length);
  const [rows, setRows] = useState<Row[]>(() => initial.map((r, i) => ({ ...r, key: i })));

  const update = (next: Row[]) => {
    setRows(next);
    setDirty(true);
  };
  const set = (key: number, patch: Partial<Row>) => update(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const append = (added: LineItemRow[]) => {
    update([...rows, ...added.map((r, i) => ({ ...r, key: nextKey + i, id: null }))]);
    setNextKey((k) => k + added.length);
  };
  const move = (key: number, by: number) => {
    const i = rows.findIndex((r) => r.key === key);
    const j = i + by;
    if (j < 0 || j >= rows.length) return;
    const next = rows.slice();
    [next[i], next[j]] = [next[j], next[i]];
    update(next);
  };
  const blank: LineItemRow = {
    group: rows[rows.length - 1]?.group ?? null,
    description: "",
    quantity: null,
    unit: null,
    day: null,
    endDay: null,
    startTime: null,
    endTime: null,
    notes: null,
    avOrderId: null,
    cateringOrderId: null,
    printOrderId: null,
    equipmentItemId: null,
    printItemId: null,
    cateringLineItemId: null,
  };
  const onSave = () =>
    startTransition(async () => {
      setError(null);
      try {
        await save(rows.map(({ key: _key, ...r }) => r));
        setDirty(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save");
      }
    });
  const int = (v: string) => (v === "" ? null : parseInt(v));

  return (
    <div className={`${cardClass} space-y-4`}>
      <h2 className="text-lg font-medium text-gray-900 dark:text-white">Line items</h2>
      {rows.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No line items yet.</p>}
      <fieldset disabled={!canWrite} className="space-y-2">
        {rows.map((r, i) => (
          <Fragment key={r.key}>
            {(i === 0 || (rows[i - 1].group ?? "") !== (r.group ?? "")) && (
              <p className={`${groupHeading} ${i === 0 ? "" : "pt-2"}`}>{r.group || "No group"}</p>
            )}
            <div className={rowCard}>
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                <label className={`${smallLabel} col-span-2 sm:col-span-3`}>
                  Description
                  <input value={r.description} onChange={(e) => set(r.key, { description: e.target.value })} className={inputClass} />
                </label>
                <label className={smallLabel}>
                  Qty
                  <input type="number" min={0} value={r.quantity ?? ""} onChange={(e) => set(r.key, { quantity: int(e.target.value) })} className={inputClass} />
                </label>
                <label className={smallLabel}>
                  Unit
                  <input value={r.unit ?? ""} placeholder="each, day…" onChange={(e) => set(r.key, { unit: e.target.value || null })} className={inputClass} />
                </label>
                <label className={smallLabel}>
                  Group
                  <input value={r.group ?? ""} onChange={(e) => set(r.key, { group: e.target.value || null })} className={inputClass} />
                </label>
                <label className={smallLabel}>
                  Day
                  <DateInput value={r.day ?? ""} onChange={(v) => set(r.key, { day: v || null, ...(v ? {} : { endDay: null }) })} className={inputClass} />
                </label>
                <label className={smallLabel}>
                  Through
                  <DateInput disabled={!r.day} min={r.day ?? undefined} value={r.endDay ?? ""} onChange={(v) => set(r.key, { endDay: v || null })} className={inputClass} />
                </label>
                <label className={smallLabel}>
                  Start
                  <input type="time" value={r.startTime ?? ""} onChange={(e) => set(r.key, { startTime: e.target.value || null })} className={inputClass} />
                </label>
                <label className={smallLabel}>
                  End
                  <input type="time" value={r.endTime ?? ""} onChange={(e) => set(r.key, { endTime: e.target.value || null })} className={inputClass} />
                </label>
                <label className={`${smallLabel} col-span-2`}>
                  Notes
                  <input value={r.notes ?? ""} onChange={(e) => set(r.key, { notes: e.target.value || null })} className={inputClass} />
                </label>
              </div>
              {canWrite && (
                <div className="flex flex-wrap gap-3 text-sm">
                  <button type="button" onClick={() => move(r.key, -1)} disabled={i === 0} className="text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40">
                    Up
                  </button>
                  <button type="button" onClick={() => move(r.key, 1)} disabled={i === rows.length - 1} className="text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40">
                    Down
                  </button>
                  <button type="button" onClick={() => update(rows.filter((x) => x.key !== r.key))} className="text-red-600 dark:text-red-400 hover:underline">
                    Remove
                  </button>
                </div>
              )}
            </div>
          </Fragment>
        ))}
      </fieldset>
      {candidates && source && <Picker rows={rows} candidates={candidates} source={source} onAdd={append} onClose={() => setCandidates(null)} />}
      {canWrite && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={onSave} disabled={pending || !dirty} className={`${btnPrimary} disabled:opacity-50`}>
            {pending ? "Saving..." : "Save line items"}
          </button>
          <button type="button" onClick={() => append([blank])} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
            + Line item
          </button>
          {source && !candidates && (
            <button
              type="button"
              disabled={loading}
              onClick={() => startLoading(async () => setCandidates(await loadCandidates()))}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
            >
              {loading ? "Loading…" : `Add from ${source}`}
            </button>
          )}
        </div>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
