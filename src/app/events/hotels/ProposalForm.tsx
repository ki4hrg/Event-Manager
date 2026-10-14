"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import type { HotelBlockType, HotelChargeScope } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import {
  BLOCK_TYPE_LABELS,
  BLOCK_TYPES,
  CHARGE_SCOPE_LABELS,
  CHARGE_SCOPES,
  formatDateKey,
  formatMoney,
  formatNight,
  nightKeys,
  stageOf,
} from "@/lib/hotels";
import { RoomGrid, type GridNight } from "./RoomGrid";

export type ProposalValues = {
  venueId: string;
  status: string;
  leadSource: string | null;
  blockType: HotelBlockType | null;
  submittedOn: string | null;
  checkIn: string | null;
  checkOut: string | null;
  declinedReason: string | null;
  notes: string | null;
  revision: number;
  isRunOfHouse: boolean;
  allowedAttrition: string | null;
  guaranteedRevenue: string | null;
  amenities: string[];
  nights: GridNight[];
  charges: { chargeType: string; amount: string | null; scope: HotelChargeScope | null }[];
};

export type ProposalChoices = {
  venues: { id: string; label: string; isLodging: boolean }[];
  statuses: { label: string; group: string | null; color: string | null }[];
  roomTypes: string[];
  amenities: string[];
  leadSources: string[];
};

const inputClass =
  "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm";
const cellInputClass =
  "w-16 px-1.5 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm text-right";
const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300";
const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6";

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${btnPrimary} disabled:opacity-50`}>
      {pending ? "Saving..." : label}
    </button>
  );
}

function Field({ label, htmlFor, wide, children }: { label: string; htmlFor: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Fieldset({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <legend className="text-sm font-semibold text-gray-900 dark:text-white">{title}</legend>
        {aside}
      </div>
      {children}
    </fieldset>
  );
}

type Cell = { rooms: string; rate: string };
type GridRow = { roomType: string | null; cells: Record<string, Cell> };

const ROH = "__roh__";

function initialRows(values: ProposalValues | null, roomTypes: string[]): GridRow[] {
  if (!values || values.nights.length === 0) {
    return values?.isRunOfHouse ? [{ roomType: null, cells: {} }] : roomTypes.slice(0, 1).map((t) => ({ roomType: t, cells: {} }));
  }
  const types = Array.from(new Set(values.nights.map((n) => n.roomType)));
  return types.map((t) => ({
    roomType: t,
    cells: Object.fromEntries(
      values.nights
        .filter((n) => n.roomType === t)
        .map((n) => [n.night, { rooms: n.rooms?.toString() ?? "", rate: n.rate ?? "" }]),
    ),
  }));
}

function Details({ values, choices }: { values: ProposalValues; choices: ProposalChoices }) {
  const rows: [string, ReactNode][] = [
    ["Hotel", choices.venues.find((v) => v.id === values.venueId)?.label ?? "—"],
    ["Status", values.status],
    ["Revision", values.revision],
    ["Block type", values.blockType ? BLOCK_TYPE_LABELS[values.blockType] : "—"],
    ["Lead source", values.leadSource ?? "—"],
    ["Submitted", formatDateKey(values.submittedOn)],
    ["Check-in", formatDateKey(values.checkIn)],
    ["Check-out", formatDateKey(values.checkOut)],
    ["Allowed attrition", values.allowedAttrition != null ? `${Number(values.allowedAttrition)}%` : "—"],
    ["Guaranteed revenue", formatMoney(values.guaranteedRevenue)],
    ["Amenities", values.amenities.join(", ") || "—"],
  ];
  if (values.declinedReason) rows.push(["Declined reason", values.declinedReason]);
  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
            <dd className="text-gray-900 dark:text-white">{value}</dd>
          </div>
        ))}
        {values.notes && (
          <div className="sm:col-span-2">
            <dt className="text-gray-500 dark:text-gray-400">Notes</dt>
            <dd className="text-gray-900 dark:text-white whitespace-pre-wrap">{values.notes}</dd>
          </div>
        )}
      </dl>
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Rooms</h3>
        <RoomGrid nights={values.nights} />
      </div>
      {values.charges.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Charges</h3>
          <ul className="text-sm divide-y divide-gray-100 dark:divide-gray-700">
            {values.charges.map((c, i) => (
              <li key={i} className="flex justify-between gap-3 py-1.5 text-gray-900 dark:text-white">
                <span>{c.chargeType}</span>
                <span className="text-gray-500 dark:text-gray-400">
                  {formatMoney(c.amount)}
                  {c.scope ? ` ${CHARGE_SCOPE_LABELS[c.scope].toLowerCase()}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ProposalForm({
  proposal,
  choices,
  defaultCheckIn,
  defaultCheckOut,
  defaultVenueId,
  action,
  cancelHref,
}: {
  proposal?: ProposalValues | null;
  choices: ProposalChoices;
  defaultCheckIn?: string | null;
  defaultCheckOut?: string | null;
  defaultVenueId?: string;
  action: (formData: FormData) => Promise<void>;
  cancelHref: string;
}) {
  const isEdit = !!proposal;
  const canWrite = useCanWrite("HOTELS");
  const [editing, setEditing] = useState(!isEdit);
  const [status, setStatus] = useState(proposal?.status ?? choices.statuses[0]?.label ?? "");
  const [revision, setRevision] = useState(proposal?.revision ?? 1);
  const [checkIn, setCheckIn] = useState(proposal ? proposal.checkIn ?? "" : defaultCheckIn ?? "");
  const [checkOut, setCheckOut] = useState(proposal ? proposal.checkOut ?? "" : defaultCheckOut ?? "");
  const [runOfHouse, setRunOfHouse] = useState(proposal?.isRunOfHouse ?? false);
  const [rows, setRows] = useState<GridRow[]>(() => initialRows(proposal ?? null, choices.roomTypes));
  const [charges, setCharges] = useState(
    (proposal?.charges ?? []).map((c) => ({ chargeType: c.chargeType, amount: c.amount ?? "", scope: c.scope ?? "" })),
  );

  if (!editing || !canWrite) {
    return (
      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Proposal</h2>
          {canWrite && (
            <button onClick={() => setEditing(true)} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
              Edit
            </button>
          )}
        </div>
        {proposal && <Details values={proposal} choices={choices} />}
      </div>
    );
  }

  const keys = nightKeys(checkIn || null, checkOut || null);
  const stage = stageOf(status, choices.statuses);
  const gridRows = runOfHouse ? rows.filter((r) => r.roomType === null) : rows.filter((r) => r.roomType !== null);
  const visibleRows = runOfHouse && gridRows.length === 0 ? [{ roomType: null, cells: {} }] : gridRows;
  const usedTypes = new Set(visibleRows.map((r) => r.roomType));
  const unusedTypes = choices.roomTypes.filter((t) => !usedTypes.has(t));

  const setCell = (roomType: string | null, night: string, field: keyof Cell, value: string) =>
    setRows((prev) => {
      const exists = prev.some((r) => r.roomType === roomType);
      const base = exists ? prev : [...prev, { roomType, cells: {} }];
      return base.map((r) =>
        r.roomType === roomType
          ? { ...r, cells: { ...r.cells, [night]: { ...(r.cells[night] ?? { rooms: "", rate: "" }), [field]: value } } }
          : r,
      );
    });
  // Copies the first night's rooms and rate across the stay.
  const fillRow = (roomType: string | null) =>
    setRows((prev) =>
      prev.map((r) => {
        if (r.roomType !== roomType || keys.length === 0) return r;
        const first = r.cells[keys[0]] ?? { rooms: "", rate: "" };
        return { ...r, cells: { ...r.cells, ...Object.fromEntries(keys.map((k) => [k, { ...first }])) } };
      }),
    );

  const nightsJson = JSON.stringify(
    visibleRows.flatMap((r) =>
      keys
        .map((k) => ({ k, c: r.cells[k] }))
        .filter(({ c }) => c && (c.rooms !== "" || c.rate !== ""))
        .map(({ k, c }) => ({
          roomType: r.roomType,
          night: k,
          rooms: c.rooms !== "" ? parseInt(c.rooms) : null,
          rate: c.rate !== "" ? Number(c.rate) : null,
        })),
    ),
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
        if (isEdit) setEditing(false);
      }}
      className={`${cardClass} space-y-6`}
    >
      <input type="hidden" name="nights" value={nightsJson} />
      <input type="hidden" name="charges" value={chargesJson} />
      <input type="hidden" name="isRunOfHouse" value={String(runOfHouse)} />

      <Fieldset title="Proposal">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Hotel *" htmlFor="p-venueId" wide>
            <select id="p-venueId" name="venueId" required defaultValue={proposal?.venueId ?? defaultVenueId ?? ""} className={inputClass}>
              <option value="">Select a hotel</option>
              {choices.venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                  {v.isLodging ? "" : " (not lodging)"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status *" htmlFor="p-status">
            <select id="p-status" name="status" required value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
              {status && !choices.statuses.some((s) => s.label === status) && <option value={status}>{status}</option>}
              {choices.statuses.map((s) => (
                <option key={s.label} value={s.label}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Block type" htmlFor="p-blockType">
            <select id="p-blockType" name="blockType" defaultValue={proposal?.blockType ?? ""} className={inputClass}>
              <option value="">Not set</option>
              {BLOCK_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          {stage === "DECLINED" && (
            <Field label="Declined reason" htmlFor="p-declinedReason" wide>
              <input id="p-declinedReason" name="declinedReason" defaultValue={proposal?.declinedReason ?? ""} className={inputClass} />
            </Field>
          )}
          <Field label="Lead source" htmlFor="p-leadSource">
            <select id="p-leadSource" name="leadSource" defaultValue={proposal?.leadSource ?? ""} className={inputClass}>
              <option value="">Not set</option>
              {proposal?.leadSource && !choices.leadSources.includes(proposal.leadSource) && (
                <option value={proposal.leadSource}>{proposal.leadSource}</option>
              )}
              {choices.leadSources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Submitted" htmlFor="p-submittedOn">
            <input id="p-submittedOn" type="date" name="submittedOn" defaultValue={proposal?.submittedOn ?? ""} className={inputClass} />
          </Field>
          <Field label="Revision" htmlFor="p-revision">
            <input
              id="p-revision"
              type="number"
              name="revision"
              min={proposal?.revision ?? 1}
              value={revision}
              onChange={(e) => setRevision(parseInt(e.target.value) || 1)}
              className={inputClass}
            />
          </Field>
          {isEdit && revision > (proposal?.revision ?? 1) && (
            <Field label="What changed" htmlFor="p-revisionSummary">
              <input id="p-revisionSummary" name="revisionSummary" className={inputClass} />
            </Field>
          )}
        </div>
      </Fieldset>

      <Fieldset title="Stay">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Earliest check-in" htmlFor="p-checkIn">
            <input id="p-checkIn" type="date" name="checkIn" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Latest check-out" htmlFor="p-checkOut">
            <input id="p-checkOut" type="date" name="checkOut" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className={inputClass} />
          </Field>
        </div>
      </Fieldset>

      <Fieldset
        title="Rooms"
        aside={
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={runOfHouse}
              onChange={(e) => setRunOfHouse(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            Run of house
          </label>
        }
      >
        {keys.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Set check-in and check-out to enter rooms.</p>
        ) : (
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
                      <div className="text-xs text-gray-500 dark:text-gray-400">rooms / rate</div>
                    </td>
                    {keys.map((k) => {
                      const c = r.cells[k] ?? { rooms: "", rate: "" };
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
                          onClick={() => setRows((prev) => prev.filter((x) => x.roomType !== r.roomType))}
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
        )}
        {!runOfHouse && keys.length > 0 && unusedTypes.length > 0 && (
          <select
            aria-label="Add room type"
            value=""
            onChange={(e) => e.target.value && setRows((prev) => [...prev, { roomType: e.target.value, cells: {} }])}
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
      </Fieldset>

      <Fieldset title="Terms">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Allowed attrition %" htmlFor="p-allowedAttrition">
            <input
              id="p-allowedAttrition"
              type="number"
              name="allowedAttrition"
              min={0}
              max={100}
              step="0.01"
              defaultValue={proposal?.allowedAttrition ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Guaranteed revenue" htmlFor="p-guaranteedRevenue">
            <input
              id="p-guaranteedRevenue"
              type="number"
              name="guaranteedRevenue"
              min={0}
              step="0.01"
              defaultValue={proposal?.guaranteedRevenue ?? ""}
              className={inputClass}
            />
          </Field>
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
                <button
                  type="button"
                  onClick={() => setCharges((prev) => prev.filter((_, j) => j !== i))}
                  className="text-sm text-red-600 dark:text-red-400 hover:underline"
                >
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
        {choices.amenities.length > 0 && (
          <div>
            <p className={labelClass}>Amenities</p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
              {Array.from(new Set([...choices.amenities, ...(proposal?.amenities ?? [])])).map((a) => (
                <label key={a} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    name="amenities"
                    value={a}
                    defaultChecked={proposal?.amenities.includes(a)}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                  {a}
                </label>
              ))}
            </div>
          </div>
        )}
        <Field label="Notes" htmlFor="p-notes">
          <textarea id="p-notes" name="notes" rows={3} defaultValue={proposal?.notes ?? ""} className={inputClass} />
        </Field>
      </Fieldset>

      <div className="flex gap-3">
        <SaveButton label={isEdit ? "Save" : "Create Proposal"} />
        {isEdit ? (
          <button type="button" onClick={() => setEditing(false)} className={btnSecondary}>
            Cancel
          </button>
        ) : (
          <Link href={cancelHref} className={btnSecondary}>
            Cancel
          </Link>
        )}
      </div>
    </form>
  );
}
