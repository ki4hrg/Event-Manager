"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import type { HotelPickupMethod } from "@prisma/client";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import { formatNight, nightKeys, roomTypeLabel } from "@/lib/hotels";

type GuestArgs = {
  guestName: string | null;
  confirmationNumber: string | null;
  checkIn: string | null;
  checkOut: string | null;
  roomType: string | null;
  cancelled: boolean;
  rawStatus: string | null;
  bookedOn: string | null;
  cancelledOn: string | null;
};
type CountArgs = { night: string; roomType: string | null; rooms: number };
type ImportMethod = Exclude<HotelPickupMethod, "COUNTS">;

const FIELDS = [
  { key: "cancelledOn", label: "Cancel date", guess: /(cancel|cxl)\w*\s*(date|dt)\b|(cancel|cxl)\w*\s+on\b|date\s*(cancel|cxl)/i },
  { key: "bookedOn", label: "Booked date", guess: /book(ed|ing)?\s*(date|dt)\b|booked\s+on\b|res(ervation)?\s*(made|date|created)|date\s*(booked|made|created)|^created/i },
  { key: "confirmation", label: "Confirmation #", guess: /conf|confirmation|res(ervation)?\s*(#|no|num|id)/i },
  { key: "fullName", label: "Guest name", guess: /^(guest\s*)?name$|guest|full\s*name/i },
  { key: "firstName", label: "First name", guess: /first/i },
  { key: "lastName", label: "Last name", guess: /last|surname/i },
  { key: "checkIn", label: "Check-in", guess: /arriv|check.?in|^in$/i },
  { key: "checkOut", label: "Check-out", guess: /depart|check.?out|^out$/i },
  { key: "roomType", label: "Room type", guess: /room\s*type|room|type/i },
  { key: "status", label: "Status", guess: /status|state/i },
] as const;
type FieldKey = (typeof FIELDS)[number]["key"];

const selectClass =
  "mt-1 block w-full px-2 py-1.5 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm";
const cellInputClass =
  "w-16 px-1.5 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm text-right";
const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6 space-y-4";
const headingClass = "text-sm font-semibold text-gray-900 dark:text-white";

// MM/DD/YYYY, M/D/YY or YYYY-MM-DD (optionally with a time) → YYYY-MM-DD.
export function parseCsvDate(raw: string | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})\b/);
  if (m) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return null;
}

function guessColumns(headers: string[]): Record<FieldKey, string> {
  const used = new Set<string>();
  const out = {} as Record<FieldKey, string>;
  for (const f of FIELDS) {
    const hit = headers.find((h) => !used.has(h) && f.guess.test(h));
    out[f.key] = hit ?? "";
    if (hit) used.add(hit);
  }
  // A full-name column beats first/last guesses that came from it.
  if (out.fullName && (out.firstName === out.fullName || out.lastName === out.fullName)) {
    out.firstName = "";
    out.lastName = "";
  }
  return out;
}

function GuestImport({
  roomTypes,
  hasGuests,
  importGuests,
  done,
}: {
  roomTypes: string[];
  hasGuests: boolean;
  importGuests: (method: ImportMethod, fileName: string | null, guests: GuestArgs[]) => Promise<void>;
  done: (message: string) => void;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [columns, setColumns] = useState<Record<FieldKey, string>>(() => guessColumns([]));
  const [roomMap, setRoomMap] = useState<Record<string, string>>({});
  const [statusMap, setStatusMap] = useState<Record<string, boolean>>({});
  const [method, setMethod] = useState<ImportMethod>(hasGuests ? "MERGE" : "APPEND");
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
      },
      error: (err) => setError(err.message),
    });
  };

  const distinct = (col: string) =>
    col ? Array.from(new Set(rows.map((r) => (r[col] ?? "").trim()).filter(Boolean))).sort() : [];
  const rawRoomTypes = distinct(columns.roomType);
  const rawStatuses = distinct(columns.status);

  const mappedRoom = (raw: string) => {
    if (raw in roomMap) return roomMap[raw] || null;
    return roomTypes.find((t) => t.toLowerCase() === raw.toLowerCase()) ?? raw;
  };
  const isCancelled = (raw: string) => (raw in statusMap ? statusMap[raw] : /cancel|no.?show|void/i.test(raw));

  const guests: GuestArgs[] = rows.map((r) => {
    const get = (k: FieldKey) => (columns[k] ? (r[columns[k]] ?? "").trim() : "");
    const name = get("fullName") || [get("firstName"), get("lastName")].filter(Boolean).join(" ");
    const status = get("status");
    const room = get("roomType");
    const cancelledOn = parseCsvDate(get("cancelledOn"));
    return {
      guestName: name || null,
      confirmationNumber: get("confirmation") || null,
      checkIn: parseCsvDate(get("checkIn")),
      checkOut: parseCsvDate(get("checkOut")),
      roomType: room ? mappedRoom(room) : null,
      cancelled: cancelledOn ? true : status ? isCancelled(status) : false,
      rawStatus: status || null,
      bookedOn: parseCsvDate(get("bookedOn")),
      cancelledOn,
    };
  });
  const badDates = guests.filter((g) => !g.checkIn || !g.checkOut || g.checkOut <= g.checkIn).length;
  const usable = guests.filter((g) => g.checkIn && g.checkOut && g.checkOut > g.checkIn);

  const submit = () =>
    startTransition(async () => {
      setError(null);
      try {
        await importGuests(method, fileName, usable);
        done(`Imported ${usable.length} guest${usable.length === 1 ? "" : "s"}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Import failed");
      }
    });

  return (
    <div className={cardClass}>
      <h2 className="text-lg font-medium text-gray-900 dark:text-white">Guest list</h2>
      <input
        type="file"
        aria-label="Guest list CSV"
        accept=".csv,text/csv"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        className="block text-sm text-gray-700 dark:text-gray-300"
      />
      {rows.length > 0 && (
        <>
          <div>
            <h3 className={headingClass}>Columns</h3>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {FIELDS.map((f) => (
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
            </div>
          </div>

          {rawRoomTypes.length > 0 && (
            <div>
              <h3 className={headingClass}>Room types</h3>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {rawRoomTypes.map((raw) => (
                  <label key={raw} className="flex items-center justify-between gap-3 text-sm text-gray-700 dark:text-gray-300">
                    <span className="truncate">{raw}</span>
                    <select
                      value={mappedRoom(raw) ?? ""}
                      onChange={(e) => setRoomMap((m) => ({ ...m, [raw]: e.target.value }))}
                      className={`${selectClass} mt-0 w-48`}
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
                <input type="radio" name="method" checked={method === value} onChange={() => setMethod(value)} />
                {label}
              </label>
            ))}
          </div>

          <p className="text-sm text-gray-700 dark:text-gray-300">
            {usable.length} guest{usable.length === 1 ? "" : "s"} · {usable.filter((g) => g.cancelled).length} cancelled ·{" "}
            {usable.filter((g) => g.bookedOn).length} with booked date
            {badDates > 0 && <span className="text-red-600 dark:text-red-400"> · {badDates} skipped (dates)</span>}
          </p>
          <button type="button" disabled={pending || usable.length === 0} onClick={submit} className={`${btnPrimary} disabled:opacity-50`}>
            {pending ? "Importing..." : "Import"}
          </button>
        </>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

function CountEntry({
  nights,
  roomTypes,
  initial,
  saveCounts,
  done,
}: {
  nights: string[];
  roomTypes: (string | null)[];
  initial: CountArgs[];
  saveCounts: (counts: CountArgs[]) => Promise<void>;
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
        await saveCounts(
          roomTypes.flatMap((t) =>
            nights.map((n) => ({ night: n, roomType: t, rooms: parseInt(values[cellKey(t, n)] || "0") || 0 })),
          ),
        );
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
  importGuests: (method: ImportMethod, fileName: string | null, guests: GuestArgs[]) => Promise<void>;
  saveCounts: (counts: CountArgs[]) => Promise<void>;
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
