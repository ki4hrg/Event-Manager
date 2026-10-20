"use client";

import { formatNight, roomTypeLabel, RUN_OF_HOUSE } from "@/lib/hotels";

// Night × room-type grid editor shared by proposals (rooms + rate per cell)
// and RFP blocks (rooms only), laid out like the APEX / hotel RFP forms: one
// row per night, one column per room type, a Total column. A null room type
// is the Run of House allotment and can sit beside typed rooms. The parent
// owns the rows (one GridRow per room-type column) and the nights shown;
// onAddDay / onRemoveDay, when given, grow or trim the range at either edge.

export type GridCell = { rooms: string; rate: string };
export type GridRow = { roomType: string | null; cells: Record<string, GridCell> };
export type GridEdge = "before" | "after";

const EMPTY: GridCell = { rooms: "", rate: "" };
const ROH = "__blank__";

const cellInputClass =
  "w-16 px-1.5 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm text-right";
const linkClass = "text-sm text-blue-600 dark:text-blue-400 hover:underline";

const roomsOf = (c: GridCell | undefined) => parseInt(c?.rooms ?? "") || 0;

// Rooms per night across every column, and the peak / total they make.
export function gridTotals(keys: string[], rows: GridRow[]) {
  const byNight = Object.fromEntries(keys.map((k) => [k, rows.reduce((s, r) => s + roomsOf(r.cells[k]), 0)]));
  const values = Object.values(byNight);
  return { byNight, peak: Math.max(0, ...values), roomNights: values.reduce((s, n) => s + n, 0) };
}

export function RoomGridEditor({
  keys,
  rows,
  roomTypes,
  withRate,
  onChange,
  onAddDay,
  onRemoveDay,
}: {
  keys: string[];
  rows: GridRow[];
  roomTypes: string[];
  withRate: boolean;
  onChange: (rows: GridRow[]) => void;
  onAddDay?: (edge: GridEdge) => void;
  onRemoveDay?: (edge: GridEdge) => void;
}) {
  const used = new Set(rows.map((r) => r.roomType));
  const unusedTypes = roomTypes.filter((t) => !used.has(t));
  const totals = gridTotals(keys, rows);

  const setCell = (roomType: string | null, night: string, field: keyof GridCell, value: string) =>
    onChange(rows.map((r) => (r.roomType === roomType ? { ...r, cells: { ...r.cells, [night]: { ...(r.cells[night] ?? EMPTY), [field]: value } } } : r)));
  // Copies the first night down the column.
  const fillColumn = (roomType: string | null) =>
    onChange(
      rows.map((r) => {
        if (r.roomType !== roomType || keys.length === 0) return r;
        const first = r.cells[keys[0]] ?? EMPTY;
        return { ...r, cells: { ...r.cells, ...Object.fromEntries(keys.map((k) => [k, { ...first }])) } };
      }),
    );
  const addColumn = (value: string) => onChange([...rows, { roomType: value === ROH ? null : value, cells: {} }]);

  const edgeRemove = (edge: GridEdge) =>
    onRemoveDay && keys.length > 1 ? (
      <button type="button" onClick={() => onRemoveDay(edge)} aria-label={`Remove ${edge === "before" ? "first" : "last"} night`} className="ml-2 text-xs text-red-600 dark:text-red-400 hover:underline">
        ×
      </button>
    ) : null;

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
              <th className="py-1 pr-3 text-left font-medium text-gray-700 dark:text-gray-300">Night</th>
              {rows.map((r) => (
                <th key={r.roomType ?? ROH} className="py-1 px-1 text-center font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap align-bottom">
                  {roomTypeLabel(r.roomType)}
                  {withRate && <div className="text-xs font-normal text-gray-500 dark:text-gray-400">rooms / rate</div>}
                  <div className="flex justify-center gap-2 text-xs font-normal">
                    <button type="button" onClick={() => fillColumn(r.roomType)} className="text-blue-600 dark:text-blue-400 hover:underline">
                      Fill ↓
                    </button>
                    <button type="button" onClick={() => onChange(rows.filter((x) => x.roomType !== r.roomType))} className="text-red-600 dark:text-red-400 hover:underline">
                      Remove
                    </button>
                  </div>
                </th>
              ))}
              {rows.length > 1 && <th className="py-1 pl-3 text-right font-medium text-gray-700 dark:text-gray-300 align-bottom">Total</th>}
              <th className="py-1 pl-3 text-left align-bottom">
                {(!used.has(null) || unusedTypes.length > 0) && (
                  <select
                    aria-label="Add room type"
                    value=""
                    onChange={(e) => e.target.value && addColumn(e.target.value)}
                    className="px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm font-normal"
                  >
                    <option value="">+ Room type</option>
                    {!used.has(null) && <option value={ROH}>{RUN_OF_HOUSE}</option>}
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
            {keys.map((k, i) => (
              <tr key={k} className="align-top">
                <td className="py-1 pr-3 text-gray-900 dark:text-white whitespace-nowrap">
                  {formatNight(k)}
                  {i === 0 && edgeRemove("before")}
                  {i === keys.length - 1 && i > 0 && edgeRemove("after")}
                </td>
                {rows.map((r) => {
                  const c = r.cells[k] ?? EMPTY;
                  const label = `${roomTypeLabel(r.roomType)} ${k}`;
                  return (
                    <td key={r.roomType ?? ROH} className="py-1 px-1">
                      <div className="flex justify-center gap-1">
                        <input
                          aria-label={`${label} rooms`}
                          type="number"
                          min={0}
                          value={c.rooms}
                          onChange={(e) => setCell(r.roomType, k, "rooms", e.target.value)}
                          className={cellInputClass}
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
                {rows.length > 1 && <td className="py-1 pl-3 text-right tabular-nums text-gray-900 dark:text-white">{totals.byNight[k]}</td>}
                <td />
              </tr>
            ))}
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
    </div>
  );
}
