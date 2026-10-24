"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import type { HotelPickupMethod } from "@prisma/client";
import { btnDanger, btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import { isUserError, type UserError } from "@/lib/userErrors";
import { formatNight, nightKeys, roomTypeLabel } from "@/lib/hotels";
import {
  DATE_ORDERS,
  DEFAULT_CANCELLED,
  PICKUP_FIELDS,
  distinctValues,
  guessColumns,
  guessDateOrder,
  hasSlashedDates,
  hasUsableDates,
  rowsToGuests,
  type DateOrder,
  type PickupColumns,
  type PickupGuestRow,
  type SheetRow,
} from "@/lib/pickupMapping";

type GuestArgs = PickupGuestRow;
type CountArgs = { night: string; roomType: string | null; rooms: number };
type ImportMethod = Exclude<HotelPickupMethod, "COUNTS">;

const selectClass =
  "mt-1 block w-full px-2 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm";
// The block's room type a raw value maps to; fixed width so the raw value
// beside it stays readable.
const roomSelectClass =
  "w-48 shrink-0 px-2 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm";
const cellInputClass =
  "w-16 px-1.5 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm text-right";
const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6 space-y-4";
const headingClass = "text-sm font-semibold text-gray-900 dark:text-white";

// A spreadsheet already read (from an inbox attachment), with the mapping to
// start from. Without it the wizard asks for a CSV.
export type GuestImportSource = {
  fileName: string;
  headers: string[];
  rows: SheetRow[];
  columns: PickupColumns;
  roomMap: Record<string, string>;
  statusMap: Record<string, boolean>;
  // The order the inbox reader saw; null leaves it to the guess.
  dateOrder: DateOrder | null;
};

export function GuestImport({
  roomTypes,
  hasGuests,
  importGuests,
  done,
  source,
}: {
  roomTypes: string[];
  hasGuests: boolean;
  importGuests: (method: ImportMethod, fileName: string | null, guests: GuestArgs[]) => Promise<void | UserError>;
  done: (message: string) => void;
  source?: GuestImportSource;
}) {
  const [fileName, setFileName] = useState<string | null>(source?.fileName ?? null);
  const [headers, setHeaders] = useState<string[]>(source?.headers ?? []);
  const [rows, setRows] = useState<SheetRow[]>(source?.rows ?? []);
  const [columns, setColumns] = useState<PickupColumns>(() => source?.columns ?? guessColumns([]));
  const [roomMap, setRoomMap] = useState<Record<string, string>>(source?.roomMap ?? {});
  const [statusMap, setStatusMap] = useState<Record<string, boolean>>(source?.statusMap ?? {});
  // null follows the guess from the mapped date columns.
  const [chosenDateOrder, setChosenDateOrder] = useState<DateOrder | null>(source?.dateOrder ?? null);
  const [method, setMethod] = useState<ImportMethod>(hasGuests ? "MERGE" : "APPEND");
  // Replacing an existing guest list asks once more on the button.
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onFile = (file: File) => {
    setError(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const hs = (res.meta.fields ?? []).filter(Boolean);
        setFileName(file.name);
        setHeaders(hs);
        setRows(res.data);
        setColumns(guessColumns(hs));
        setRoomMap({});
        setStatusMap({});
        setChosenDateOrder(null);
      },
      error: (err) => setError(err.message),
    });
  };

  const rawRoomTypes = distinctValues(rows, columns.roomType);
  const rawStatuses = distinctValues(rows, columns.status);

  const mappedRoom = (raw: string) => {
    if (raw in roomMap) return roomMap[raw] || null;
    return roomTypes.find((t) => t.toLowerCase() === raw.toLowerCase()) ?? raw;
  };
  const isCancelled = (raw: string) => (raw in statusMap ? statusMap[raw] : DEFAULT_CANCELLED.test(raw));

  const dateOrder = chosenDateOrder ?? guessDateOrder(rows, columns);
  const guests = rowsToGuests(rows, columns, mappedRoom, isCancelled, dateOrder);
  const usable = guests.filter(hasUsableDates);
  const badDates = guests.length - usable.length;

  const submit = () =>
    startTransition(async () => {
      setError(null);
      try {
        const result = await importGuests(method, fileName, usable);
        if (isUserError(result)) {
          setError(result.error);
          return;
        }
        done(`Imported ${usable.length} guest${usable.length === 1 ? "" : "s"}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Import failed");
      }
    });

  return (
    <div className={cardClass}>
      <h2 className="text-lg font-medium text-gray-900 dark:text-white">Guest list</h2>
      {source ? (
        <p className="text-sm text-gray-700 dark:text-gray-300 break-words">{source.fileName}</p>
      ) : (
        <input
          type="file"
          aria-label="Guest list CSV"
          accept=".csv,text/csv"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          className="block text-sm text-gray-700 dark:text-gray-300"
        />
      )}
      {rows.length > 0 && (
        <>
          <div>
            <h3 className={headingClass}>Columns</h3>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {PICKUP_FIELDS.map((f) => (
                <label key={f.key} className="text-sm text-gray-700 dark:text-gray-300">
                  {f.label}
                  <select value={columns[f.key]} onChange={(e) => setColumns((c) => ({ ...c, [f.key]: e.target.value }))} className={selectClass}>
                    <option value="">—</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              {hasSlashedDates(rows, columns) && (
                <label className="text-sm text-gray-700 dark:text-gray-300">
                  Date order
                  <select value={dateOrder} onChange={(e) => setChosenDateOrder(e.target.value as DateOrder)} className={selectClass}>
                    {DATE_ORDERS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>

          {rawRoomTypes.length > 0 && (
            <div>
              <h3 className={headingClass}>Room types</h3>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {rawRoomTypes.map((raw) => (
                  <label key={raw} className="flex items-center justify-between gap-3 text-sm text-gray-700 dark:text-gray-300">
                    <span className="min-w-0 break-words">{raw}</span>
                    <select
                      value={mappedRoom(raw) ?? ""}
                      onChange={(e) => setRoomMap((m) => ({ ...m, [raw]: e.target.value }))}
                      className={roomSelectClass}
                    >
                      <option value="">None</option>
                      {Array.from(new Set([...roomTypes, mappedRoom(raw) ?? ""].filter(Boolean))).map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          )}

          {rawStatuses.length > 0 && (
            <div>
              <h3 className={headingClass}>Cancelled statuses</h3>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                {rawStatuses.map((raw) => (
                  <label key={raw} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={isCancelled(raw)}
                      onChange={(e) => setStatusMap((m) => ({ ...m, [raw]: e.target.checked }))}
                      className="rounded border-gray-300 dark:border-gray-600"
                    />
                    {raw}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-700 dark:text-gray-300">
            {(
              [
                ["MERGE", "Merge by confirmation #"],
                ["APPEND", "Add all"],
                ["REPLACE", "Replace all"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-1.5">
                <input
                  type="radio"
                  name="method"
                  checked={method === value}
                  onChange={() => {
                    setMethod(value);
                    setConfirmReplace(false);
                  }}
                />
                {label}
              </label>
            ))}
          </div>

          <p className="text-sm text-gray-700 dark:text-gray-300">
            {usable.length} guest{usable.length === 1 ? "" : "s"} · {usable.filter((g) => g.cancelled).length} cancelled ·{" "}
            {usable.filter((g) => g.bookedOn).length} with booked date
            {badDates > 0 && <span className="text-red-600 dark:text-red-400"> · {badDates} skipped (dates)</span>}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={pending || usable.length === 0}
              onClick={() => (method === "REPLACE" && hasGuests && !confirmReplace ? setConfirmReplace(true) : submit())}
              className={`${method === "REPLACE" && confirmReplace ? btnDanger : btnPrimary} disabled:opacity-50`}
            >
              {pending ? "Importing..." : method === "REPLACE" && confirmReplace ? "Replace every guest?" : "Import"}
            </button>
            {confirmReplace && method === "REPLACE" && !pending && (
              <button type="button" onClick={() => setConfirmReplace(false)} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
                Cancel
              </button>
            )}
          </div>
        </>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

export function CountEntry({
  nights,
  roomTypes,
  initial,
  saveCounts,
  done,
}: {
  nights: string[];
  roomTypes: (string | null)[];
  initial: CountArgs[];
  saveCounts: (counts: CountArgs[]) => Promise<void | UserError>;
  done: (message: string) => void;
}) {
  const cellKey = (t: string | null, n: string) => `${t ?? ""}|${n}`;
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(initial.map((c) => [cellKey(c.roomType, c.night), String(c.rooms)])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      setError(null);
      try {
        const result = await saveCounts(
          roomTypes.flatMap((t) =>
            nights.map((n) => ({ night: n, roomType: t, rooms: parseInt(values[cellKey(t, n)] || "0") || 0 })),
          ),
        );
        if (isUserError(result)) {
          setError(result.error);
          return;
        }
        done("Counts saved");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });

  return (
    <div className={cardClass}>
      <h2 className="text-lg font-medium text-gray-900 dark:text-white">Nightly counts</h2>
      {nights.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Set the block&apos;s check-in and check-out first.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr>
                  <th className="py-1 pr-3 text-left font-medium text-gray-700 dark:text-gray-300">Room type</th>
                  {nights.map((n) => (
                    <th key={n} className="py-1 px-1 text-center font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {formatNight(n)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roomTypes.map((t) => (
                  <tr key={t ?? "__all__"}>
                    <td className="py-1 pr-3 text-gray-900 dark:text-white whitespace-nowrap">{roomTypeLabel(t)}</td>
                    {nights.map((n) => (
                      <td key={n} className="py-1 px-1">
                        <input
                          aria-label={`${roomTypeLabel(t)} ${n}`}
                          type="number"
                          min={0}
                          value={values[cellKey(t, n)] ?? ""}
                          onChange={(e) => setValues((v) => ({ ...v, [cellKey(t, n)]: e.target.value }))}
                          className={cellInputClass}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" disabled={pending} onClick={submit} className={`${btnPrimary} disabled:opacity-50`}>
            {pending ? "Saving..." : "Save counts"}
          </button>
        </>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

export function PickupImport({
  blockHref,
  checkIn,
  checkOut,
  blockRoomTypes,
  tenantRoomTypes,
  hasGuests,
  counts,
  importGuests,
  saveCounts,
}: {
  blockHref: string;
  checkIn: string | null;
  checkOut: string | null;
  // The block's room types; null is its Run of House allotment.
  blockRoomTypes: (string | null)[];
  tenantRoomTypes: string[];
  hasGuests: boolean;
  counts: CountArgs[];
  importGuests: (method: ImportMethod, fileName: string | null, guests: GuestArgs[]) => Promise<void | UserError>;
  saveCounts: (counts: CountArgs[]) => Promise<void | UserError>;
}) {
  const router = useRouter();
  const done = (message: string) => {
    router.push(`${blockHref}?success=${encodeURIComponent(message)}`);
    router.refresh();
  };
  const countTypes = blockRoomTypes.length === 0 ? [null] : blockRoomTypes;
  const typed = blockRoomTypes.filter((t): t is string => t != null);
  return (
    <div className="space-y-6">
      <GuestImport
        roomTypes={Array.from(new Set([...typed, ...tenantRoomTypes]))}
        hasGuests={hasGuests}
        importGuests={importGuests}
        done={done}
      />
      <CountEntry nights={nightKeys(checkIn, checkOut)} roomTypes={countTypes} initial={counts} saveCounts={saveCounts} done={done} />
      <Link href={blockHref} className={btnSecondary}>
        Back to block
      </Link>
    </div>
  );
}
