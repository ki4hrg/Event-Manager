"use client";

import { formatNight } from "@/lib/hotels";

// Room type × night grid editor shared by proposals (rooms + rate per cell)
// and RFP blocks (rooms only). The parent owns the rows; run of house is a
// single row with a null room type.

export type GridCell = { rooms: string; rate: string };
export type GridRow = { roomType: string | null; cells: Record<string, GridCell> };

const EMPTY: GridCell = { rooms: "", rate: "" };
const ROH = "__roh__";

const cellInputClass =
  "w-16 px-1.5 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm text-right";

// The rows the grid shows: the run-of-house row, or the typed rows.
export function visibleGridRows(rows: GridRow[], runOfHouse: boolean): GridRow[] {
  const shown = runOfHouse ? rows.filter((r) => r.roomType === null) : rows.filter((r) => r.roomType !== null);
  return runOfHouse && shown.length === 0 ? [{ roomType: null, cells: {} }] : shown;
}

export function RoomGridEditor({
  keys,
  rows,
  runOfHouse,
  roomTypes,
  withRate,
  onChange,
}: {
  keys: string[];
  rows: GridRow[];
  runOfHouse: boolean;
  roomTypes: string[];
  withRate: boolean;
  onChange: (rows: GridRow[]) => void;
}) {
  const visibleRows = visibleGridRows(rows, runOfHouse);
  const usedTypes = new Set(visibleRows.map((r) => r.roomType));
  const unusedTypes = roomTypes.filter((t) => !usedTypes.has(t));

  const setCell = (roomType: string | null, night: string, field: keyof GridCell, value: string) => {
    const base = rows.some((r) => r.roomType === roomType) ? rows : [...rows, { roomType, cells: {} }];
    onChange(
      base.map((r) => (r.roomType === roomType ? { ...r, cells: { ...r.cells, [night]: { ...(r.cells[night] ?? EMPTY), [field]: value } } } : r)),
    );
  };
  // Copies the first night across the stay.
  const fillRow = (roomType: string | null) =>
    onChange(
      rows.map((r) => {
        if (r.roomType !== roomType || keys.length === 0) return r;
        const first = r.cells[keys[0]] ?? EMPTY;
        return { ...r, cells: { ...r.cells, ...Object.fromEntries(keys.map((k) => [k, { ...first }])) } };
      }),
    );

  return (
    <>
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr>
              <th className="py-1 pr-3 text-left font-medium text-gray-700 dark:text-gray-300">Room type</th>
              {keys.map((k) => (
                <th key={k} className="py-1 px-1 text-center font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  {formatNight(k)}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => (
              <tr key={r.roomType ?? ROH} className="align-top">
                <td className="py-1 pr-3 text-gray-900 dark:text-white whitespace-nowrap">
                  {r.roomType ?? "Run of house"}
                  {withRate && <div className="text-xs text-gray-500 dark:text-gray-400">rooms / rate</div>}
                </td>
                {keys.map((k) => {
                  const c = r.cells[k] ?? EMPTY;
                  return (
                    <td key={k} className="py-1 px-1">
                      <div className="flex flex-col gap-1">
                        <input
                          aria-label={`${r.roomType ?? "Run of house"} ${k} rooms`}
                          type="number"
                          min={0}
                          value={c.rooms}
                          onChange={(e) => setCell(r.roomType, k, "rooms", e.target.value)}
                          className={cellInputClass}
                        />
                        {withRate && (
                          <input
                            aria-label={`${r.roomType ?? "Run of house"} ${k} rate`}
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
                <td className="py-1 pl-2 whitespace-nowrap">
                  <button type="button" onClick={() => fillRow(r.roomType)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                    Fill →
                  </button>
                  {!runOfHouse && (
                    <button
                      type="button"
                      onClick={() => onChange(rows.filter((x) => x.roomType !== r.roomType))}
                      className="block text-xs text-red-600 dark:text-red-400 hover:underline mt-1"
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!runOfHouse && unusedTypes.length > 0 && (
        <select
          aria-label="Add room type"
          value=""
          onChange={(e) => e.target.value && onChange([...rows, { roomType: e.target.value, cells: {} }])}
          className="px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
        >
          <option value="">+ Room type</option>
          {unusedTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      )}
    </>
  );
}
