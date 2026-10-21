"use client";

import { useRef, useState, useTransition } from "react";
import type { HotelContractType } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnSecondary } from "@/lib/buttonStyles";
import { addDays, CONTRACT_TYPES } from "@/lib/hotels";
import type { PatternBasis } from "@/lib/hotelPattern";
import { useAutosave } from "@/lib/useAutosave";
import { emptyGridState, gridNights, overNights, RoomGridEditor, toGridState, type GridEdge, type GridState } from "../hotels/RoomGridEditor";
import { AutosaveStatus } from "./AutosaveStatus";
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
  contractType: HotelContractType;
  guestType: string;
  targetRate: string;
  notes: string;
  // Nights shown, first to last; each block keeps its own range.
  from: string;
  to: string;
  grid: GridState;
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

const basisText = (basis: PatternBasis, events: number) => {
  const of = `${events} event${events === 1 ? "" : "s"}`;
  switch (basis) {
    case "average":
      return `Average pickup per night across ${of}`;
    case "highest":
      return `Highest pickup per night across ${of}`;
    case "latest":
      return "Pickup of the most recent event";
    default: {
      const _exhaustive: never = basis;
      throw new Error(`Unhandled basis: ${_exhaustive}`);
    }
  }
};

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
      const pct = Number(adjust) || 0;
      setMessage(`${basisText(basis, result.events)}${pct ? `, ${pct > 0 ? "+" : ""}${pct}%` : ""}.`);
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
        <option value="average">Average pickup per night</option>
        <option value="highest">Highest pickup per night</option>
        <option value="latest">Most recent event&apos;s pickup</option>
      </select>
      <label className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
        Adjust ±
        <input aria-label="Adjust by percent" type="number" step={5} value={adjust} onChange={(e) => setAdjust(e.target.value)} className={`${smallInput} w-20`} />%
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
  save: (blocks: RfpBlockArgs[]) => Promise<(string | null)[]>;
  fill: (args: RfpFillArgs) => Promise<FillResult>;
}) {
  const canWrite = useCanWrite("HOTELS");
  // Saved ids by local block id: a block created by one save is updated by the next.
  const ids = useRef(new Map(initial.map((b, i) => [i, b.id] as const)));
  const [nextId, setNextId] = useState(initial.length);
  // A block's nights start at the RFP's, widened to any it already requests.
  const lastNight = departure > arrival ? addDays(departure, -1) : arrival;
  const range = (nights: string[]) => ({ from: [arrival, ...nights].sort()[0], to: [lastNight, ...nights].sort().reverse()[0] });
  const [blocks, setBlocks] = useState<BlockState[]>(() =>
    initial.map((b, i) => ({
      id: i,
      contractType: b.contractType,
      guestType: b.guestType ?? "",
      targetRate: b.targetRate ?? "",
      notes: b.notes ?? "",
      ...range(b.nights.map((n) => n.night)),
      grid: toGridState(b.nights),
    })),
  );

  const change = (id: number, patch: Partial<BlockState>) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };
  const addBlock = () => {
    setBlocks((prev) => [
      ...prev,
      {
        id: nextId,
        contractType: "CONTRACT",
        guestType: guestTypes[0] ?? "",
        targetRate: "",
        notes: "",
        ...range([]),
        grid: emptyGridState(keysBetween(arrival, lastNight), peakRooms),
      },
    ]);
    setNextId((n) => n + 1);
  };
  // A new day starts at the peak rooms.
  const addDay = (b: BlockState, edge: GridEdge) => {
    const night = edge === "before" ? addDays(b.from, -1) : addDays(b.to, 1);
    const grid = peakRooms ? { ...b.grid, totals: { ...b.grid.totals, [night]: String(peakRooms) } } : b.grid;
    change(b.id, { ...(edge === "before" ? { from: night } : { to: night }), grid });
  };
  const removeDay = (b: BlockState, edge: GridEdge) =>
    change(b.id, edge === "before" ? { from: addDays(b.from, 1) } : { to: addDays(b.to, -1) });
  // Sets each night's total; typed rooms stay and Run of House takes the rest.
  const applyFill = (b: BlockState, nights: FillResult["nights"]) => {
    const sorted = nights.map((n) => n.night).sort();
    change(b.id, {
      from: sorted[0] < b.from ? sorted[0] : b.from,
      to: sorted[sorted.length - 1] > b.to ? sorted[sorted.length - 1] : b.to,
      grid: { ...b.grid, totals: { ...b.grid.totals, ...Object.fromEntries(nights.map((n) => [n.night, String(n.rooms)])) } },
    });
  };
  const over = blocks.some((b) => overNights(keysBetween(b.from, b.to), b.grid).length > 0);
  const status = useAutosave(
    blocks,
    async (sent) => {
      const saved = await save(
        sent.map((b) => {
          const keys = keysBetween(b.from, b.to);
          return {
            id: ids.current.get(b.id) ?? null,
            contractType: b.contractType,
            guestType: b.guestType || null,
            targetRate: b.targetRate !== "" ? Number(b.targetRate) : null,
            notes: b.notes || null,
            nights: gridNights(keys, b.grid).map(({ roomType, night, rooms }) => ({ roomType, night, rooms })),
          };
        }),
      );
      sent.forEach((b, i) => {
        const id = saved[i];
        if (id) ids.current.set(b.id, id);
      });
    },
    { invalid: over ? "room types add up to more than a night's total" : null },
  );

  return (
    <div className={`${cardClass} space-y-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Room blocks</h2>
        <AutosaveStatus {...status} />
      </div>
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
              state={b.grid}
              roomTypes={roomTypes}
              withRate={false}
              onChange={(grid) => change(b.id, { grid })}
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
                  onClick={() => setBlocks((prev) => prev.filter((x) => x.id !== b.id))}
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
          <button type="button" onClick={addBlock} className={btnSecondary}>
            Add block
          </button>
        </div>
      )}
    </div>
  );
}
