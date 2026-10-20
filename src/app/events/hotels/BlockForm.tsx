"use client";

import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { HotelChargeScope } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import { CHARGE_SCOPE_LABELS, CHARGE_SCOPES, formatDateKey, formatMoney, formatNight, nightKeys, roomTypeLabel, RUN_OF_HOUSE } from "@/lib/hotels";
import type { NightPickup } from "@/lib/hotelPickup";

export type BlockValues = {
  isHq: boolean;
  checkIn: string | null;
  checkOut: string | null;
  reservationMethod: string | null;
  groupCode: string | null;
  bookingLink: string | null;
  bookingPhone: string | null;
  cutoffDate: string | null;
  contractedOn: string | null;
  cutoffExercised: boolean | null;
  allowedAttrition: string | null;
  guaranteedRevenue: string | null;
  distanceMiles: string | null;
  driveMinutes: number | null;
  compRooms: number | null;
  staffRooms: number | null;
  notes: string | null;
  nights: {
    id: string;
    roomType: string | null;
    night: string;
    rate: string | null;
    contractedRooms: number | null;
    rooms: number;
    otherReservations: number;
  }[];
  charges: { chargeType: string; amount: string | null; scope: HotelChargeScope | null }[];
};

const inputClass =
  "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm";
const cellInputClass =
  "w-20 px-1.5 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm text-right";
const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300";
const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6";
const thClass = "py-2 px-2 text-left font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap";
const tdClass = "py-2 px-2 text-gray-900 dark:text-white whitespace-nowrap";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${btnPrimary} disabled:opacity-50`}>
      {pending ? "Saving..." : "Save"}
    </button>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
      </label>
      {children}
    </div>
  );
}

const NIGHT_FIELD_LABELS = { rate: "rate", contractedRooms: "contracted", rooms: "blocked", otherReservations: "other reservations" } as const;

const pct = (picked: number, blocked: number) => (blocked > 0 ? `${Math.round((picked / blocked) * 100)}%` : "—");

// Nights with pickup, read-only. Rows below the attrition floor are flagged.
export function PickupTable({ rows, attritionFloor }: { rows: NightPickup[]; attritionFloor: number | null }) {
  if (rows.length === 0) return <p className="text-sm text-gray-500 dark:text-gray-400">No nights.</p>;
  const showType = rows.some((r) => r.roomType !== null);
  const totals = rows.reduce(
    (t, r) => ({ blocked: t.blocked + r.blocked, contracted: t.contracted + (r.contracted ?? 0), picked: t.picked + r.pickedUp }),
    { blocked: 0, contracted: 0, picked: 0 },
  );
  const low = (r: NightPickup) => attritionFloor != null && r.blocked > 0 && (r.pickedUp / r.blocked) * 100 < 100 - attritionFloor;
  return (
    <>
      {/* Mobile cards */}
      <ul className="sm:hidden divide-y divide-gray-200 dark:divide-gray-700 text-sm">
        {rows.map((r) => (
          <li key={`${r.night}-${r.roomType}`} className="py-2">
            <div className="flex justify-between gap-3">
              <span className="font-medium text-gray-900 dark:text-white">
                {formatNight(r.night)}
                {showType && <span className="font-normal text-gray-500 dark:text-gray-400"> · {roomTypeLabel(r.roomType)}</span>}
              </span>
              <span className={low(r) ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white"}>
                {r.pickedUp}/{r.blocked} · {pct(r.pickedUp, r.blocked)}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden sm:block overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className={thClass}>Night</th>
              {showType && <th className={thClass}>Room type</th>}
              <th className={`${thClass} text-right`}>Contracted</th>
              <th className={`${thClass} text-right`}>Blocked</th>
              <th className={`${thClass} text-right`}>Picked up</th>
              <th className={`${thClass} text-right`}>Remaining</th>
              <th className={`${thClass} text-right`}>%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {rows.map((r) => (
              <tr key={`${r.night}-${r.roomType}`}>
                <td className={tdClass}>{formatNight(r.night)}</td>
                {showType && <td className={tdClass}>{roomTypeLabel(r.roomType)}</td>}
                <td className={`${tdClass} text-right`}>{r.contracted ?? "—"}</td>
                <td className={`${tdClass} text-right`}>{r.blocked}</td>
                <td className={`${tdClass} text-right`}>{r.pickedUp}</td>
                <td className={`${tdClass} text-right`}>{r.blocked - r.pickedUp}</td>
                <td className={`${tdClass} text-right ${low(r) ? "text-red-600 dark:text-red-400 font-medium" : ""}`}>{pct(r.pickedUp, r.blocked)}</td>
              </tr>
            ))}
            <tr className="font-medium">
              <td className={tdClass} colSpan={showType ? 2 : 1}>
                Total
              </td>
              <td className={`${tdClass} text-right`}>{totals.contracted || "—"}</td>
              <td className={`${tdClass} text-right`}>{totals.blocked}</td>
              <td className={`${tdClass} text-right`}>{totals.picked}</td>
              <td className={`${tdClass} text-right`}>{totals.blocked - totals.picked}</td>
              <td className={`${tdClass} text-right`}>{pct(totals.picked, totals.blocked)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function Details({ block }: { block: BlockValues }) {
  const rows: [string, ReactNode][] = [
    ["HQ hotel", block.isHq ? "Yes" : "No"],
    ["Check-in", formatDateKey(block.checkIn)],
    ["Check-out", formatDateKey(block.checkOut)],
    ["Cut-off", formatDateKey(block.cutoffDate)],
    ["Cut-off exercised", block.cutoffExercised == null ? "—" : block.cutoffExercised ? "Yes" : "No"],
    ["Contracted", formatDateKey(block.contractedOn)],
    ["Reservations", block.reservationMethod ?? "—"],
    ["Group code", block.groupCode ?? "—"],
    ["Booking phone", block.bookingPhone ?? "—"],
    [
      "Booking link",
      block.bookingLink ? (
        <a href={block.bookingLink} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline break-all">
          {block.bookingLink}
        </a>
      ) : (
        "—"
      ),
    ],
    ["Allowed attrition", block.allowedAttrition != null ? `${Number(block.allowedAttrition)}%` : "—"],
    ["Guaranteed revenue", formatMoney(block.guaranteedRevenue)],
    [
      "From venue",
      [block.distanceMiles != null ? `${Number(block.distanceMiles)} mi` : null, block.driveMinutes != null ? `${block.driveMinutes} min drive` : null]
        .filter(Boolean)
        .join(" · ") || "—",
    ],
    ["Comp / staff rooms", [block.compRooms ?? "—", block.staffRooms ?? "—"].join(" / ")],
  ];
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
            <dd className="text-gray-900 dark:text-white">{value}</dd>
          </div>
        ))}
        {block.notes && (
          <div className="sm:col-span-2">
            <dt className="text-gray-500 dark:text-gray-400">Notes</dt>
            <dd className="text-gray-900 dark:text-white whitespace-pre-wrap">{block.notes}</dd>
          </div>
        )}
      </dl>
      {block.charges.length > 0 && (
        <ul className="text-sm divide-y divide-gray-100 dark:divide-gray-700">
          {block.charges.map((c, i) => (
            <li key={i} className="flex justify-between gap-3 py-1.5 text-gray-900 dark:text-white">
              <span>{c.chargeType}</span>
              <span className="text-gray-500 dark:text-gray-400">
                {formatMoney(c.amount)}
                {c.scope ? ` ${CHARGE_SCOPE_LABELS[c.scope].toLowerCase()}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type EditNight = {
  key: string;
  id: string | null;
  roomType: string | null;
  night: string;
  rate: string;
  contractedRooms: string;
  rooms: string;
  otherReservations: string;
};

export function BlockForm({
  block,
  pickup,
  roomTypes,
  reservationMethods,
  action,
}: {
  block: BlockValues;
  pickup: NightPickup[];
  roomTypes: string[];
  reservationMethods: string[];
  action: (formData: FormData) => Promise<void>;
}) {
  const canWrite = useCanWrite("HOTELS");
  const [editing, setEditing] = useState(false);
  const [checkIn, setCheckIn] = useState(block.checkIn ?? "");
  const [checkOut, setCheckOut] = useState(block.checkOut ?? "");
  const [nights, setNights] = useState<EditNight[]>(() =>
    block.nights.map((n) => ({
      key: n.id,
      id: n.id,
      roomType: n.roomType,
      night: n.night,
      rate: n.rate ?? "",
      contractedRooms: n.contractedRooms?.toString() ?? "",
      rooms: n.rooms.toString(),
      otherReservations: n.otherReservations.toString(),
    })),
  );
  const [charges, setCharges] = useState(block.charges.map((c) => ({ chargeType: c.chargeType, amount: c.amount ?? "", scope: c.scope ?? "" })));
  const [addType, setAddType] = useState("");

  const attrition = block.allowedAttrition != null ? Number(block.allowedAttrition) : null;

  if (!editing || !canWrite) {
    return (
      <div className="space-y-6">
        <div className={cardClass}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">Block</h2>
            {canWrite && (
              <button onClick={() => setEditing(true)} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                Edit
              </button>
            )}
          </div>
          <Details block={block} />
        </div>
        <div className={cardClass}>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Nights</h2>
          <PickupTable rows={pickup} attritionFloor={attrition} />
        </div>
      </div>
    );
  }

  const keys = nightKeys(checkIn || null, checkOut || null);
  const keySet = new Set(keys);
  const visible = nights
    .filter((n) => keySet.has(n.night))
    .sort((a, b) => a.night.localeCompare(b.night) || (a.roomType ?? "").localeCompare(b.roomType ?? ""));
  const types = Array.from(new Set(nights.map((n) => n.roomType)));
  const set = (key: string, field: keyof EditNight, value: string) =>
    setNights((prev) => prev.map((n) => (n.key === key ? { ...n, [field]: value } : n)));
  // Adds a row for each stay night the room type doesn't have yet.
  const addRoomType = (roomType: string | null) => {
    setNights((prev) => [
      ...prev,
      ...keys
        .filter((k) => !prev.some((n) => n.night === k && n.roomType === roomType))
        .map((k) => ({ key: `new-${roomType}-${k}`, id: null, roomType, night: k, rate: "", contractedRooms: "", rooms: "0", otherReservations: "0" })),
    ]);
  };
  const toInt = (v: string) => (v === "" ? 0 : parseInt(v));

  const nightsJson = JSON.stringify(
    visible.map((n) => ({
      id: n.id,
      roomType: n.roomType,
      night: n.night,
      rate: n.rate !== "" ? Number(n.rate) : null,
      contractedRooms: n.contractedRooms !== "" ? parseInt(n.contractedRooms) : null,
      rooms: toInt(n.rooms),
      otherReservations: toInt(n.otherReservations),
    })),
  );
  const chargesJson = JSON.stringify(
    charges
      .filter((c) => c.chargeType.trim())
      .map((c) => ({ chargeType: c.chargeType, amount: c.amount !== "" ? Number(c.amount) : null, scope: c.scope || null })),
  );

  return (
    <form
      action={async (formData) => {
        await action(formData);
        setEditing(false);
      }}
      className={`${cardClass} space-y-6`}
    >
      <input type="hidden" name="nights" value={nightsJson} />
      <input type="hidden" name="charges" value={chargesJson} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Check-in" htmlFor="b-checkIn">
          <input id="b-checkIn" type="date" name="checkIn" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Check-out" htmlFor="b-checkOut">
          <input id="b-checkOut" type="date" name="checkOut" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Cut-off" htmlFor="b-cutoffDate">
          <input id="b-cutoffDate" type="date" name="cutoffDate" defaultValue={block.cutoffDate ?? ""} className={inputClass} />
        </Field>
        <Field label="Cut-off exercised" htmlFor="b-cutoffExercised">
          <select id="b-cutoffExercised" name="cutoffExercised" defaultValue={block.cutoffExercised == null ? "" : String(block.cutoffExercised)} className={inputClass}>
            <option value="">Not set</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </Field>
        <Field label="Contracted" htmlFor="b-contractedOn">
          <input id="b-contractedOn" type="date" name="contractedOn" defaultValue={block.contractedOn ?? ""} className={inputClass} />
        </Field>
        <Field label="Reservations" htmlFor="b-reservationMethod">
          <select id="b-reservationMethod" name="reservationMethod" defaultValue={block.reservationMethod ?? ""} className={inputClass}>
            <option value="">Not set</option>
            {block.reservationMethod && !reservationMethods.includes(block.reservationMethod) && (
              <option value={block.reservationMethod}>{block.reservationMethod}</option>
            )}
            {reservationMethods.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Group code" htmlFor="b-groupCode">
          <input id="b-groupCode" name="groupCode" defaultValue={block.groupCode ?? ""} className={inputClass} />
        </Field>
        <Field label="Booking phone" htmlFor="b-bookingPhone">
          <input id="b-bookingPhone" name="bookingPhone" defaultValue={block.bookingPhone ?? ""} className={inputClass} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Booking link" htmlFor="b-bookingLink">
            <input id="b-bookingLink" type="url" name="bookingLink" defaultValue={block.bookingLink ?? ""} className={inputClass} />
          </Field>
        </div>
        <Field label="Allowed attrition %" htmlFor="b-allowedAttrition">
          <input id="b-allowedAttrition" type="number" min={0} max={100} step="0.01" name="allowedAttrition" defaultValue={block.allowedAttrition ?? ""} className={inputClass} />
        </Field>
        <Field label="Guaranteed revenue" htmlFor="b-guaranteedRevenue">
          <input id="b-guaranteedRevenue" type="number" min={0} step="0.01" name="guaranteedRevenue" defaultValue={block.guaranteedRevenue ?? ""} className={inputClass} />
        </Field>
        <Field label="Miles from venue" htmlFor="b-distanceMiles">
          <input id="b-distanceMiles" type="number" min={0} step="0.1" name="distanceMiles" defaultValue={block.distanceMiles ?? ""} className={inputClass} />
        </Field>
        <Field label="Drive minutes" htmlFor="b-driveMinutes">
          <input id="b-driveMinutes" type="number" min={0} name="driveMinutes" defaultValue={block.driveMinutes ?? ""} className={inputClass} />
        </Field>
        <Field label="Comp rooms" htmlFor="b-compRooms">
          <input id="b-compRooms" type="number" min={0} name="compRooms" defaultValue={block.compRooms ?? ""} className={inputClass} />
        </Field>
        <Field label="Staff rooms" htmlFor="b-staffRooms">
          <input id="b-staffRooms" type="number" min={0} name="staffRooms" defaultValue={block.staffRooms ?? ""} className={inputClass} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input type="checkbox" name="isHq" value="true" defaultChecked={block.isHq} className="rounded border-gray-300 dark:border-gray-600" />
          HQ hotel
        </label>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Nights</h3>
        <div className="overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr>
                <th className={thClass}>Night</th>
                <th className={thClass}>Room type</th>
                <th className={`${thClass} text-right`}>Rate</th>
                <th className={`${thClass} text-right`}>Contracted</th>
                <th className={`${thClass} text-right`}>Blocked</th>
                <th className={`${thClass} text-right`}>Other res.</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((n) => (
                <tr key={n.key}>
                  <td className={tdClass}>{formatNight(n.night)}</td>
                  <td className={tdClass}>{roomTypeLabel(n.roomType)}</td>
                  {(["rate", "contractedRooms", "rooms", "otherReservations"] as const).map((f) => (
                    <td key={f} className="py-1 px-1 text-right">
                      <input
                        aria-label={`${formatNight(n.night)}${n.roomType ? ` ${n.roomType}` : ""} ${NIGHT_FIELD_LABELS[f]}`}
                        type="number"
                        min={0}
                        step={f === "rate" ? "0.01" : "1"}
                        value={n[f]}
                        onChange={(e) => set(n.key, f, e.target.value)}
                        className={cellInputClass}
                      />
                    </td>
                  ))}
                  <td className="py-1 pl-2">
                    <button
                      type="button"
                      onClick={() => setNights((prev) => prev.filter((x) => x.key !== n.key))}
                      className="text-xs text-red-600 dark:text-red-400 hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {keys.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              aria-label="Room type"
              value={addType}
              onChange={(e) => setAddType(e.target.value)}
              className="px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
            >
              <option value="">Room type…</option>
              <option value="__blank__">{RUN_OF_HOUSE}</option>
              {Array.from(new Set([...types.filter((t): t is string => !!t), ...roomTypes])).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!addType}
              onClick={() => addRoomType(addType === "__blank__" ? null : addType)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
            >
              + Add nights
            </button>
          </div>
        )}
      </div>

      <div>
        <p className={labelClass}>Charges</p>
        <div className="mt-1 space-y-2">
          {charges.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                aria-label="Charge"
                placeholder="Resort fee, parking…"
                value={c.chargeType}
                onChange={(e) => setCharges((prev) => prev.map((x, j) => (j === i ? { ...x, chargeType: e.target.value } : x)))}
                className={`${inputClass} mt-0 flex-1 min-w-[10rem]`}
              />
              <input
                aria-label="Amount"
                type="number"
                step="0.01"
                placeholder="$"
                value={c.amount}
                onChange={(e) => setCharges((prev) => prev.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                className={`${inputClass} mt-0 w-24`}
              />
              <select
                aria-label="Scope"
                value={c.scope}
                onChange={(e) => setCharges((prev) => prev.map((x, j) => (j === i ? { ...x, scope: e.target.value as HotelChargeScope } : x)))}
                className={`${inputClass} mt-0 w-auto`}
              >
                <option value="">—</option>
                {CHARGE_SCOPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => setCharges((prev) => prev.filter((_, j) => j !== i))} className="text-sm text-red-600 dark:text-red-400 hover:underline">
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setCharges((prev) => [...prev, { chargeType: "", amount: "", scope: "" }])}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            + Charge
          </button>
        </div>
      </div>

      <Field label="Notes" htmlFor="b-notes">
        <textarea id="b-notes" name="notes" rows={3} defaultValue={block.notes ?? ""} className={inputClass} />
      </Field>

      <div className="flex flex-wrap gap-3">
        <SaveButton />
        <button type="button" onClick={() => setEditing(false)} className={btnSecondary}>
          Cancel
        </button>
      </div>
    </form>
  );
}
