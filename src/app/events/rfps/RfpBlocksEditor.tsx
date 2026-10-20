"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { HotelContractType } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import { addDays, CONTRACT_TYPES } from "@/lib/hotels";
import type { PatternBasis } from "@/lib/hotelPattern";
import { RoomGridEditor, type GridEdge, type GridRow } from "../hotels/RoomGridEditor";
import type { RfpBlockArgs, RfpFillArgs } from "./core";

export type RfpBlockValues = {
  id: string;
  contractType: HotelContractType;
  guestType: string | null;
  targetRate: string | null;
  notes: string | null;
  nights: { roomType: string | null; night: string; rooms: number }[];
};

type FillResult = { events: number; nights: { night: string; rooms: number }[] };

type BlockState = {
  id: number;
  savedId: string | null;
  contractType: HotelContractType;
  guestType: string;
  targetRate: string;
  notes: string;
  // Nights shown, first to last; each block keeps its own range.
  from: string;
  to: string;
  rows: GridRow[];
};

const inputClass =
  "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm";
const smallInput =
  "px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm";
const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300";
const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6";
const linkButton = "text-sm text-blue-600 dark:text-blue-400 hover:underline";

function keysBetween(from: string, to: string) {
  const out: string[] = [];
  for (let k = from; k <= to && out.length < 90; k = addDays(k, 1)) out.push(k);
  return out;
}

// One column per room type; for a new block, one Run of House column with
// the RFP's peak rooms on each night.
function toRows(nights: RfpBlockValues["nights"], keys: string[] = [], peakRooms: number | null = null): GridRow[] {
  const types = Array.from(new Set(nights.map((n) => n.roomType)));
  if (types.length === 0) {
    const cells = peakRooms ? Object.fromEntries(keys.map((k) => [k, { rooms: String(peakRooms), rate: "" }])) : {};
    return [{ roomType: null, cells }];
  }
  return types.map((t) => ({
    roomType: t,
    cells: Object.fromEntries(nights.filter((n) => n.roomType === t).map((n) => [n.night, { rooms: String(n.rooms), rate: "" }])),
  }));
}

function HistoryFill({
  block,
  guestTypes,
  series,
  defaultSeriesId,
  fill,
  onFilled,
}: {
  block: BlockState;
  guestTypes: string[];
  series: { id: string; name: string }[];
  defaultSeriesId: string | null;
  fill: (args: RfpFillArgs) => Promise<FillResult>;
  onFilled: (nights: FillResult["nights"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [seriesId, setSeriesId] = useState(defaultSeriesId ?? "");
  // History of this block's own kind by default; "" draws on every kind.
  const [contractType, setContractType] = useState<string>(block.contractType);
  const [guestType, setGuestType] = useState(block.guestType);
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
      const result = await fill({
        seriesId: seriesId || null,
        contractType: (contractType || null) as HotelContractType | null,
        guestType: guestType || null,
        basis,
        adjust: Number(adjust) || 0,
      });
      if (result.nights.length === 0) {
        setMessage("No past pickup matches.");
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
      <select aria-label="Contract type" value={contractType} onChange={(e) => setContractType(e.target.value)} className={smallInput}>
        <option value="">Any contract</option>
        {CONTRACT_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      <select aria-label="Guest type" value={guestType} onChange={(e) => setGuestType(e.target.value)} className={smallInput}>
        <option value="">Any guests</option>
        {guestTypes.map((g) => (
          <option key={g} value={g}>
            {g}
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
  arrival,
  departure,
  peakRooms,
  roomTypes,
  guestTypes,
  series,
  defaultSeriesId,
  save,
  fill,
}: {
  blocks: RfpBlockValues[];
  // The RFP's requested dates (the event's when unset) and peak rooms: a
  // block's default nights and rooms per night.
  arrival: string;
  departure: string;
  peakRooms: number | null;
  roomTypes: string[];
  guestTypes: string[];
  series: { id: string; name: string }[];
  defaultSeriesId: string | null;
  save: (blocks: RfpBlockArgs[]) => Promise<void>;
  fill: (args: RfpFillArgs) => Promise<FillResult>;
}) {
  const router = useRouter();
  const canWrite = useCanWrite("HOTELS");
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);
  const [nextId, setNextId] = useState(initial.length);
  // A block's nights start at the RFP's, widened to any it already requests.
  const lastNight = departure > arrival ? addDays(departure, -1) : arrival;
  const range = (nights: string[]) => ({ from: [arrival, ...nights].sort()[0], to: [lastNight, ...nights].sort().reverse()[0] });
  const [blocks, setBlocks] = useState<BlockState[]>(() =>
    initial.map((b, i) => ({
      id: i,
      savedId: b.id,
      contractType: b.contractType,
      guestType: b.guestType ?? "",
      targetRate: b.targetRate ?? "",
      notes: b.notes ?? "",
      ...range(b.nights.map((n) => n.night)),
      rows: toRows(b.nights),
    })),
  );

  const change = (id: number, patch: Partial<BlockState>) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    setDirty(true);
  };
  const addBlock = () => {
    setBlocks((prev) => [
      ...prev,
      {
        id: nextId,
        savedId: null,
        contractType: "CONTRACT",
        guestType: guestTypes[0] ?? "",
        targetRate: "",
        notes: "",
        ...range([]),
        rows: toRows([], keysBetween(arrival, lastNight), peakRooms),
      },
    ]);
    setNextId((n) => n + 1);
    setDirty(true);
  };
  // A new day starts at the peak rooms in the first column.
  const addDay = (b: BlockState, edge: GridEdge) => {
    const night = edge === "before" ? addDays(b.from, -1) : addDays(b.to, 1);
    const rows = peakRooms && b.rows.length ? [{ ...b.rows[0], cells: { ...b.rows[0].cells, [night]: { rooms: String(peakRooms), rate: "" } } }, ...b.rows.slice(1)] : b.rows;
    change(b.id, { ...(edge === "before" ? { from: night } : { to: night }), rows });
  };
  const removeDay = (b: BlockState, edge: GridEdge) =>
    change(b.id, edge === "before" ? { from: addDays(b.from, 1) } : { to: addDays(b.to, -1) });
  // Fills the first column (Run of House unless the block names a type).
  const applyFill = (b: BlockState, nights: FillResult["nights"]) => {
    const sorted = nights.map((n) => n.night).sort();
    const cells = Object.fromEntries(nights.map((n) => [n.night, { rooms: String(n.rooms), rate: "" }]));
    const [first, ...rest] = b.rows.length ? b.rows : toRows([]);
    change(b.id, {
      from: sorted[0] < b.from ? sorted[0] : b.from,
      to: sorted[sorted.length - 1] > b.to ? sorted[sorted.length - 1] : b.to,
      rows: [{ roomType: first.roomType, cells }, ...rest],
    });
  };
  const onSave = () =>
    startTransition(async () => {
      await save(
        blocks.map((b) => {
          const keys = keysBetween(b.from, b.to);
          return {
            id: b.savedId,
            contractType: b.contractType,
            guestType: b.guestType || null,
            targetRate: b.targetRate !== "" ? Number(b.targetRate) : null,
            notes: b.notes || null,
            nights: b.rows.flatMap((r) =>
              keys.flatMap((k) => {
                const rooms = parseInt(r.cells[k]?.rooms ?? "");
                return rooms > 0 ? [{ roomType: r.roomType, night: k, rooms }] : [];
              }),
            ),
          };
        }),
      );
      setDirty(false);
      router.refresh();
    });

  return (
    <div className={`${cardClass} space-y-4`}>
      <h2 className="text-lg font-medium text-gray-900 dark:text-white">Room blocks</h2>
      <fieldset disabled={!canWrite} className="space-y-6">
        {blocks.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No blocks requested.</p>}
        {blocks.map((b) => (
          <div key={b.id} className="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-4 first:border-0 first:pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor={`b-${b.id}-contract`} className={labelClass}>
                  Contract type
                </label>
                <select
                  id={`b-${b.id}-contract`}
                  value={b.contractType}
                  onChange={(e) => change(b.id, { contractType: e.target.value as HotelContractType })}
                  className={inputClass}
                >
                  {CONTRACT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`b-${b.id}-guest`} className={labelClass}>
                  Guest type
                </label>
                <select id={`b-${b.id}-guest`} value={b.guestType} onChange={(e) => change(b.id, { guestType: e.target.value })} className={inputClass}>
                  <option value="">Not set</option>
                  {b.guestType && !guestTypes.includes(b.guestType) && <option value={b.guestType}>{b.guestType}</option>}
                  {guestTypes.map((g) => (
                    <option key={g} value={g}>
                      {g}
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
            </div>
            <RoomGridEditor
              keys={keysBetween(b.from, b.to)}
              rows={b.rows}
              roomTypes={roomTypes}
              withRate={false}
              onChange={(rows) => change(b.id, { rows })}
              onAddDay={canWrite ? (edge) => addDay(b, edge) : undefined}
              onRemoveDay={canWrite ? (edge) => removeDay(b, edge) : undefined}
            />
            <div>
              <label htmlFor={`b-${b.id}-notes`} className={labelClass}>
                Notes
              </label>
              <textarea id={`b-${b.id}-notes`} rows={2} value={b.notes} onChange={(e) => change(b.id, { notes: e.target.value })} className={inputClass} />
            </div>
            {canWrite && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <HistoryFill
                  block={b}
                  guestTypes={guestTypes}
                  series={series}
                  defaultSeriesId={defaultSeriesId}
                  fill={fill}
                  onFilled={(nights) => applyFill(b, nights)}
                />
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
