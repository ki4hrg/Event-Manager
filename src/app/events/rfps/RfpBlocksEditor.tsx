"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { HotelBlockType } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import { BLOCK_TYPES, dateFromKey, dateKey } from "@/lib/hotels";
import type { PatternBasis } from "@/lib/hotelPattern";
import { RoomGridEditor, visibleGridRows, type GridRow } from "../hotels/RoomGridEditor";
import type { RfpBlockArgs } from "./core";

export type RfpBlockValues = {
  id: string;
  blockType: HotelBlockType;
  isRunOfHouse: boolean;
  targetRate: string | null;
  notes: string | null;
  nights: { roomType: string | null; night: string; rooms: number }[];
};

type FillArgs = { seriesId: string | null; blockType: HotelBlockType | null; basis: PatternBasis; adjust: number };
type FillResult = { events: number; nights: { night: string; rooms: number }[] };

type BlockState = {
  id: number;
  savedId: string | null;
  blockType: HotelBlockType;
  isRunOfHouse: boolean;
  targetRate: string;
  notes: string;
  rows: GridRow[];
};

const inputClass =
  "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm";
const smallInput =
  "px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm";
const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300";
const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6";
const linkButton = "text-sm text-blue-600 dark:text-blue-400 hover:underline";

const DAY = 86_400_000;
const addDays = (key: string, n: number) => dateKey(new Date(dateFromKey(key).getTime() + n * DAY));

function keysBetween(from: string, to: string) {
  const out: string[] = [];
  for (let k = from; k <= to && out.length < 90; k = addDays(k, 1)) out.push(k);
  return out;
}

function toRows(b: RfpBlockValues): GridRow[] {
  const types = Array.from(new Set(b.nights.map((n) => n.roomType)));
  if (types.length === 0) return [];
  return types.map((t) => ({
    roomType: t,
    cells: Object.fromEntries(b.nights.filter((n) => n.roomType === t).map((n) => [n.night, { rooms: String(n.rooms), rate: "" }])),
  }));
}

function HistoryFill({
  block,
  series,
  defaultSeriesId,
  fill,
  onFilled,
}: {
  block: BlockState;
  series: { id: string; name: string }[];
  defaultSeriesId: string | null;
  fill: (args: FillArgs) => Promise<FillResult>;
  onFilled: (nights: FillResult["nights"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [seriesId, setSeriesId] = useState(defaultSeriesId ?? "");
  const [basis, setBasis] = useState<PatternBasis>("average");
  const [adjust, setAdjust] = useState("0");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={linkButton}>
        Fill from history
      </button>
    );
  }
  const run = () =>
    startTransition(async () => {
      const result = await fill({ seriesId: seriesId || null, blockType: block.blockType, basis, adjust: Number(adjust) || 0 });
      if (result.nights.length === 0) {
        setMessage("No past pickup for this block type.");
        return;
      }
      onFilled(result.nights);
      setMessage(`Filled from ${result.events} event${result.events === 1 ? "" : "s"}.`);
    });
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <select aria-label="Series" value={seriesId} onChange={(e) => setSeriesId(e.target.value)} className={smallInput}>
        <option value="">All series</option>
        {series.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <select aria-label="Basis" value={basis} onChange={(e) => setBasis(e.target.value as PatternBasis)} className={smallInput}>
        <option value="average">Average</option>
        <option value="highest">Highest</option>
        <option value="latest">Latest</option>
      </select>
      <label className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
        <input aria-label="Adjust %" type="number" value={adjust} onChange={(e) => setAdjust(e.target.value)} className={`${smallInput} w-20`} />%
      </label>
      <button type="button" onClick={run} disabled={pending} className={`${btnSecondary} disabled:opacity-50`}>
        {pending ? "Filling..." : "Fill"}
      </button>
      {message && <span className="text-gray-500 dark:text-gray-400">{message}</span>}
    </div>
  );
}

export function RfpBlocksEditor({
  blocks: initial,
  eventStart,
  eventEnd,
  roomTypes,
  series,
  defaultSeriesId,
  save,
  fill,
}: {
  blocks: RfpBlockValues[];
  eventStart: string;
  eventEnd: string;
  roomTypes: string[];
  series: { id: string; name: string }[];
  defaultSeriesId: string | null;
  save: (blocks: RfpBlockArgs[]) => Promise<void>;
  fill: (args: FillArgs) => Promise<FillResult>;
}) {
  const router = useRouter();
  const canWrite = useCanWrite("HOTELS");
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);
  const [nextId, setNextId] = useState(initial.length);
  const [blocks, setBlocks] = useState<BlockState[]>(() =>
    initial.map((b, i) => ({
      id: i,
      savedId: b.id,
      blockType: b.blockType,
      isRunOfHouse: b.isRunOfHouse,
      targetRate: b.targetRate ?? "",
      notes: b.notes ?? "",
      rows: toRows(b),
    })),
  );
  // Nights shown: the event's nights, widened to any requested night outside them.
  const lastNight = eventEnd > eventStart ? addDays(eventEnd, -1) : eventStart;
  const saved = initial.flatMap((b) => b.nights.map((n) => n.night));
  const [range, setRange] = useState(() => ({
    from: [eventStart, ...saved].sort()[0],
    to: [lastNight, ...saved].sort().reverse()[0],
  }));
  const keys = keysBetween(range.from, range.to);

  const change = (id: number, patch: Partial<BlockState>) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    setDirty(true);
  };
  const addBlock = () => {
    const used = new Set(blocks.map((b) => b.blockType));
    const blockType = BLOCK_TYPES.find((t) => !used.has(t.value))?.value ?? "CONTRACT";
    setBlocks((prev) => [...prev, { id: nextId, savedId: null, blockType, isRunOfHouse: false, targetRate: "", notes: "", rows: roomTypes.slice(0, 1).map((t) => ({ roomType: t, cells: {} })) }]);
    setNextId((n) => n + 1);
    setDirty(true);
  };
  const applyFill = (b: BlockState, nights: FillResult["nights"]) => {
    const sorted = nights.map((n) => n.night).sort();
    setRange((r) => ({ from: sorted[0] < r.from ? sorted[0] : r.from, to: sorted[sorted.length - 1] > r.to ? sorted[sorted.length - 1] : r.to }));
    const roomType = b.isRunOfHouse ? null : (visibleGridRows(b.rows, false)[0]?.roomType ?? roomTypes[0] ?? null);
    const cells = Object.fromEntries(nights.map((n) => [n.night, { rooms: String(n.rooms), rate: "" }]));
    change(b.id, { isRunOfHouse: b.isRunOfHouse || roomType === null, rows: [{ roomType, cells }] });
  };
  const onSave = () =>
    startTransition(async () => {
      await save(
        blocks.map((b) => ({
          id: b.savedId,
          blockType: b.blockType,
          isRunOfHouse: b.isRunOfHouse,
          targetRate: b.targetRate !== "" ? Number(b.targetRate) : null,
          notes: b.notes || null,
          nights: visibleGridRows(b.rows, b.isRunOfHouse).flatMap((r) =>
            keys.flatMap((k) => {
              const rooms = parseInt(r.cells[k]?.rooms ?? "");
              return rooms > 0 ? [{ roomType: r.roomType, night: k, rooms }] : [];
            }),
          ),
        })),
      );
      setDirty(false);
      router.refresh();
    });

  return (
    <div className={`${cardClass} space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Room blocks</h2>
        {canWrite && (
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setRange((r) => ({ ...r, from: addDays(r.from, -1) }))} className={linkButton}>
              ← Night
            </button>
            <button type="button" onClick={() => setRange((r) => ({ ...r, to: addDays(r.to, 1) }))} className={linkButton}>
              Night →
            </button>
          </div>
        )}
      </div>
      <fieldset disabled={!canWrite} className="space-y-6">
        {blocks.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No blocks requested.</p>}
        {blocks.map((b) => (
          <div key={b.id} className="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-4 first:border-0 first:pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor={`b-${b.id}-type`} className={labelClass}>
                  Block
                </label>
                <select
                  id={`b-${b.id}-type`}
                  value={b.blockType}
                  onChange={(e) => change(b.id, { blockType: e.target.value as HotelBlockType })}
                  className={inputClass}
                >
                  {BLOCK_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`b-${b.id}-rate`} className={labelClass}>
                  Target rate
                </label>
                <input
                  id={`b-${b.id}-rate`}
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="$"
                  value={b.targetRate}
                  onChange={(e) => change(b.id, { targetRate: e.target.value })}
                  className={inputClass}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 sm:mt-6">
                <input
                  type="checkbox"
                  checked={b.isRunOfHouse}
                  onChange={(e) => change(b.id, { isRunOfHouse: e.target.checked })}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                Run of house
              </label>
            </div>
            <RoomGridEditor
              keys={keys}
              rows={b.rows}
              runOfHouse={b.isRunOfHouse}
              roomTypes={roomTypes}
              withRate={false}
              onChange={(rows) => change(b.id, { rows })}
            />
            <div>
              <label htmlFor={`b-${b.id}-notes`} className={labelClass}>
                Notes
              </label>
              <textarea id={`b-${b.id}-notes`} rows={2} value={b.notes} onChange={(e) => change(b.id, { notes: e.target.value })} className={inputClass} />
            </div>
            {canWrite && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <HistoryFill block={b} series={series} defaultSeriesId={defaultSeriesId} fill={fill} onFilled={(nights) => applyFill(b, nights)} />
                <button
                  type="button"
                  onClick={() => {
                    setBlocks((prev) => prev.filter((x) => x.id !== b.id));
                    setDirty(true);
                  }}
                  className="text-sm text-red-600 dark:text-red-400 hover:underline"
                >
                  Remove block
                </button>
              </div>
            )}
          </div>
        ))}
      </fieldset>
      {canWrite && (
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={onSave} disabled={pending || !dirty} className={`${btnPrimary} disabled:opacity-50`}>
            {pending ? "Saving..." : "Save blocks"}
          </button>
          <button type="button" onClick={addBlock} className={btnSecondary}>
            Add block
          </button>
        </div>
      )}
    </div>
  );
}
