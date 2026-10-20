"use client";

import { formatNight, roomTypeLabel, RUN_OF_HOUSE } from "@/lib/hotels";

// Night × room-type grid editor shared by proposals (rooms + rate per cell)
// and RFP blocks (rooms only), laid out like the APEX / hotel RFP forms: one
// row per night. Each night has a Total; typed room columns (Suite, King…)
// are counts within it, and Run of House is the remainder — never entered,
// so the typed rooms can't push a night past its total. Run of House keeps
// its own rate. The parent owns the state and the nights shown; onAddDay /
// onRemoveDay, when given, grow or trim the range at either edge.

export type GridCell = { rooms: string; rate: string };
export type GridRow = { roomType: string; cells: Record<string, GridCell> };
export type GridState = {
  totals: Record<string, string>; // night → total rooms ("" = the typed rooms' sum)
  rows: GridRow[]; // typed room columns
  rohRates: Record<string, string>; // night → Run of House rate (proposals)
};
export type GridEdge = "before" | "after";
export type GridNight = { roomType: string | null; night: string; rooms: number; rate: number | null };

const EMPTY: GridCell = { rooms: "", rate: "" };

const cellInputClass =
  "w-16 px-1.5 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm text-right";
const overClass = "border-red-500 dark:border-red-500";
const linkClass = "text-sm text-blue-600 dark:text-blue-400 hover:underline";

const int = (v: string | undefined) => {
  const n = parseInt(v ?? "");
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const has = (v: string | undefined) => v != null && v.trim() !== "";

// Loads stored nights (a null room type is Run of House) into grid state:
// each night's total is the sum of its rooms.
export function toGridState(nights: { roomType: string | null; night: string; rooms: number | null; rate?: string | number | null }[]): GridState {
  const totals: Record<string, string> = {};
  const rohRates: Record<string, string> = {};
  const typed = new Map<string, Record<string, GridCell>>();
  for (const n of nights) {
    totals[n.night] = String(int(totals[n.night]) + (n.rooms ?? 0));
    const rate = n.rate == null ? "" : String(n.rate);
    if (n.roomType == null) {
      if (rate) rohRates[n.night] = rate;
      continue;
    }
    typed.set(n.roomType, { ...(typed.get(n.roomType) ?? {}), [n.night]: { rooms: n.rooms == null ? "" : String(n.rooms), rate } });
  }
  return { totals, rows: Array.from(typed, ([roomType, cells]) => ({ roomType, cells })), rohRates };
}

export const emptyGridState = (keys: string[] = [], rooms: number | null = null): GridState => ({
  totals: rooms != null ? Object.fromEntries(keys.map((k) => [k, String(rooms)])) : {},
  rows: [],
  rohRates: {},
});

// Per night: the typed rooms, the total (entered, else the typed sum), and
// Run of House (the remainder, or how far the typed rooms run over).
export function nightMath(state: GridState, night: string) {
  const typed = state.rows.reduce((s, r) => s + int(r.cells[night]?.rooms), 0);
  const total = has(state.totals[night]) ? int(state.totals[night]) : typed;
  return { typed, total, roh: total - typed };
}

export function gridTotals(keys: string[], state: GridState) {
  const byNight = Object.fromEntries(keys.map((k) => [k, nightMath(state, k).total]));
  const values = Object.values(byNight);
  return { byNight, peak: Math.max(0, ...values), roomNights: values.reduce((s, n) => s + n, 0) };
}

// Nights where the typed rooms exceed the total.
export const overNights = (keys: string[], state: GridState) => keys.filter((k) => nightMath(state, k).roh < 0);

// The nights to store: every typed cell on a night that has a total or a
// room count (0 kept as 0), and Run of House when any night has some.
export function gridNights(keys: string[], state: GridState): GridNight[] {
  const out: GridNight[] = [];
  const rate = (v: string | undefined) => (has(v) ? Number(v) : null);
  const active = keys.filter((k) => has(state.totals[k]) || state.rows.some((r) => has(r.cells[k]?.rooms)));
  const pooled = active.some((k) => nightMath(state, k).roh > 0);
  for (const k of active) {
    const { roh } = nightMath(state, k);
    if (pooled) out.push({ roomType: null, night: k, rooms: Math.max(0, roh), rate: rate(state.rohRates[k]) });
    for (const r of state.rows) out.push({ roomType: r.roomType, night: k, rooms: int(r.cells[k]?.rooms), rate: rate(r.cells[k]?.rate) });
  }
  return out;
}

export function RoomGridEditor({
  keys,
  state,
  roomTypes,
  withRate,
  onChange,
  onAddDay,
  onRemoveDay,
}: {
  keys: string[];
  state: GridState;
  roomTypes: string[];
  withRate: boolean;
  onChange: (state: GridState) => void;
  onAddDay?: (edge: GridEdge) => void;
  onRemoveDay?: (edge: GridEdge) => void;
}) {
  const used = new Set(state.rows.map((r) => r.roomType));
  const unusedTypes = roomTypes.filter((t) => !used.has(t));
  const totals = gridTotals(keys, state);
  const over = overNights(keys, state);

  const setRows = (rows: GridRow[]) => onChange({ ...state, rows });
  const setCell = (roomType: string, night: string, field: keyof GridCell, value: string) =>
    setRows(state.rows.map((r) => (r.roomType === roomType ? { ...r, cells: { ...r.cells, [night]: { ...(r.cells[night] ?? EMPTY), [field]: value } } } : r)));
  const setTotal = (night: string, value: string) => onChange({ ...state, totals: { ...state.totals, [night]: value } });
  const setRohRate = (night: string, value: string) => onChange({ ...state, rohRates: { ...state.rohRates, [night]: value } });
  // Copies the first night down a column (or down the totals).
  const fillTotals = () => onChange({ ...state, totals: { ...state.totals, ...Object.fromEntries(keys.map((k) => [k, state.totals[keys[0]] ?? ""])) } });
  const fillColumn = (roomType: string) =>
    setRows(
      state.rows.map((r) => (r.roomType === roomType ? { ...r, cells: { ...r.cells, ...Object.fromEntries(keys.map((k) => [k, { ...(r.cells[keys[0]] ?? EMPTY) }])) } } : r)),
    );
  const fillRohRates = () => onChange({ ...state, rohRates: { ...state.rohRates, ...Object.fromEntries(keys.map((k) => [k, state.rohRates[keys[0]] ?? ""])) } });

  const edgeRemove = (edge: GridEdge) =>
    onRemoveDay && keys.length > 1 ? (
      <button
        type="button"
        onClick={() => onRemoveDay(edge)}
        aria-label={`Remove ${edge === "before" ? "first" : "last"} night`}
        className="ml-2 text-xs text-red-600 dark:text-red-400 hover:underline"
      >
        ×
      </button>
    ) : null;
  const fill = (onClick: () => void) =>
    keys.length > 1 ? (
      <button type="button" onClick={onClick} className="text-xs font-normal text-blue-600 dark:text-blue-400 hover:underline">
        Fill ↓
      </button>
    ) : null;
  const th = "py-1 px-1 text-center font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap align-bottom";

  return (
    <div className="space-y-2">
      {onAddDay && (
        <button type="button" onClick={() => onAddDay("before")} className={linkClass}>
          + Add day before
        </button>
      )}
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr>
              <th className="py-1 pr-3 text-left font-medium text-gray-700 dark:text-gray-300 align-bottom">Night</th>
              <th className={th}>
                Total
                <div>{fill(fillTotals)}</div>
              </th>
              <th className={th}>
                {RUN_OF_HOUSE}
                {withRate && <div className="text-xs font-normal text-gray-500 dark:text-gray-400">rooms / rate</div>}
                {withRate && <div>{fill(fillRohRates)}</div>}
              </th>
              {state.rows.map((r) => (
                <th key={r.roomType} className={th}>
                  {roomTypeLabel(r.roomType)}
                  {withRate && <div className="text-xs font-normal text-gray-500 dark:text-gray-400">rooms / rate</div>}
                  <div className="flex justify-center gap-2 text-xs font-normal">
                    {fill(() => fillColumn(r.roomType))}
                    <button type="button" onClick={() => setRows(state.rows.filter((x) => x.roomType !== r.roomType))} className="text-red-600 dark:text-red-400 hover:underline">
                      Remove
                    </button>
                  </div>
                </th>
              ))}
              <th className="py-1 pl-3 text-left align-bottom">
                {unusedTypes.length > 0 && (
                  <select
                    aria-label="Add room type"
                    value=""
                    onChange={(e) => e.target.value && setRows([...state.rows, { roomType: e.target.value, cells: {} }])}
                    className="px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm font-normal"
                  >
                    <option value="">+ Room type</option>
                    {unusedTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k, i) => {
              const { typed, roh } = nightMath(state, k);
              const isOver = roh < 0;
              return (
                <tr key={k} className="align-top">
                  <td className="py-1 pr-3 text-gray-900 dark:text-white whitespace-nowrap">
                    {formatNight(k)}
                    {i === 0 && edgeRemove("before")}
                    {i === keys.length - 1 && i > 0 && edgeRemove("after")}
                  </td>
                  <td className="py-1 px-1">
                    <input
                      aria-label={`${k} total rooms`}
                      type="number"
                      min={0}
                      placeholder={typed ? String(typed) : ""}
                      value={state.totals[k] ?? ""}
                      onChange={(e) => setTotal(k, e.target.value)}
                      className={`${cellInputClass} ${isOver ? overClass : ""}`}
                    />
                  </td>
                  <td className="py-1 px-1">
                    <div className="flex justify-center items-center gap-1">
                      <span
                        aria-label={`${k} ${RUN_OF_HOUSE} rooms`}
                        className={`w-16 px-1.5 py-1 text-right tabular-nums ${isOver ? "text-red-600 dark:text-red-400" : "text-gray-700 dark:text-gray-300"}`}
                      >
                        {roh}
                      </span>
                      {withRate && (
                        <input
                          aria-label={`${RUN_OF_HOUSE} ${k} rate`}
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="$"
                          value={state.rohRates[k] ?? ""}
                          onChange={(e) => setRohRate(k, e.target.value)}
                          className={cellInputClass}
                        />
                      )}
                    </div>
                  </td>
                  {state.rows.map((r) => {
                    const c = r.cells[k] ?? EMPTY;
                    const label = `${roomTypeLabel(r.roomType)} ${k}`;
                    return (
                      <td key={r.roomType} className="py-1 px-1">
                        <div className="flex justify-center gap-1">
                          <input
                            aria-label={`${label} rooms`}
                            type="number"
                            min={0}
                            value={c.rooms}
                            onChange={(e) => setCell(r.roomType, k, "rooms", e.target.value)}
                            className={`${cellInputClass} ${isOver ? overClass : ""}`}
                          />
                          {withRate && (
                            <input
                              aria-label={`${label} rate`}
                              type="number"
                              min={0}
                              step="0.01"
                              placeholder="$"
                              value={c.rate}
                              onChange={(e) => setCell(r.roomType, k, "rate", e.target.value)}
                              className={cellInputClass}
                            />
                          )}
                        </div>
                      </td>
                    );
                  })}
                  <td />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {onAddDay && (
        <button type="button" onClick={() => onAddDay("after")} className={linkClass}>
          + Add day after
        </button>
      )}
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Peak night {totals.peak} · {totals.roomNights} room nights
      </p>
      {over.length > 0 && (
        <p className="text-sm text-red-600 dark:text-red-400">Room types exceed the total on {over.map(formatNight).join(", ")}.</p>
      )}
    </div>
  );
}
