"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import type { ConcessionMet, HotelChargeScope, HotelContractType } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import {
  addDays,
  blockTypeLabel,
  CHARGE_SCOPE_LABELS,
  CHARGE_SCOPES,
  CONTRACT_TYPES,
  formatDateKey,
  formatMoney,
  MET_LABELS,
  nightKeys,
  stageOf,
} from "@/lib/hotels";
import { RoomGrid, type GridNight } from "./RoomGrid";
import { RoomGridEditor, type GridEdge, type GridRow } from "./RoomGridEditor";

export type ProposalValues = {
  venueId: string;
  status: string;
  leadSource: string | null;
  contractType: HotelContractType | null;
  guestType: string | null;
  submittedOn: string | null;
  checkIn: string | null;
  checkOut: string | null;
  declinedReason: string | null;
  notes: string | null;
  revision: number;
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
  guestTypes: string[];
  amenities: string[];
  leadSources: string[];
};

const inputClass =
  "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm";
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

// A select over an option list that keeps a stored label no longer in it.
function OptionSelect({ id, name, value, options }: { id: string; name: string; value: string | null; options: string[] }) {
  return (
    <select id={id} name={name} defaultValue={value ?? ""} className={inputClass}>
      <option value="">Not set</option>
      {value && !options.includes(value) && <option value={value}>{value}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
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

// The RFP's requested concessions with this proposal's answers.
export type ConcessionAnswer = { id: string; label: string; value: string | null; required: boolean; offered: string | null; met: ConcessionMet | null };

function concessionLine(c: ConcessionAnswer) {
  return [c.met ? MET_LABELS[c.met] : null, c.offered].filter(Boolean).join(" · ") || "—";
}

// A new proposal answering a requested RFP block starts as a copy of it.
export type ProposalTemplate = {
  rfpBlockId: string;
  contractType: HotelContractType;
  guestType: string | null;
  status: string | null;
  nights: GridNight[];
};

// One column per room type in the nights; Run of House when there are none.
function initialRows(values: Pick<ProposalValues, "nights"> | null): GridRow[] {
  if (!values || values.nights.length === 0) return [{ roomType: null, cells: {} }];
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

function Details({ values, choices, concessions }: { values: ProposalValues; choices: ProposalChoices; concessions: ConcessionAnswer[] }) {
  const rows: [string, ReactNode][] = [
    ["Hotel", choices.venues.find((v) => v.id === values.venueId)?.label ?? "—"],
    ["Status", values.status],
    ["Revision", values.revision],
    ["Block type", blockTypeLabel(values.contractType, values.guestType) ?? "—"],
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
      {concessions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Concessions</h3>
          <ul className="text-sm divide-y divide-gray-100 dark:divide-gray-700">
            {concessions.map((c) => (
              <li key={c.id} className="flex flex-wrap justify-between gap-x-3 py-1.5 text-gray-900 dark:text-white">
                <span>
                  {c.label}
                  {c.value && <span className="text-gray-500 dark:text-gray-400"> (asked {c.value})</span>}
                </span>
                <span className={c.met === "NOT_MET" ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"}>{concessionLine(c)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
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
  fromRfp,
  concessions = [],
  action,
  cancelHref,
}: {
  proposal?: ProposalValues | null;
  fromRfp?: ProposalTemplate;
  concessions?: ConcessionAnswer[];
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
  const [status, setStatus] = useState(proposal?.status ?? fromRfp?.status ?? choices.statuses[0]?.label ?? "");
  const [revision, setRevision] = useState(proposal?.revision ?? 1);
  const [checkIn, setCheckIn] = useState(proposal ? proposal.checkIn ?? "" : defaultCheckIn ?? "");
  const [checkOut, setCheckOut] = useState(proposal ? proposal.checkOut ?? "" : defaultCheckOut ?? "");
  const [rows, setRows] = useState<GridRow[]>(() => initialRows(proposal ?? fromRfp ?? null));
  const [charges, setCharges] = useState(
    (proposal?.charges ?? []).map((c) => ({ chargeType: c.chargeType, amount: c.amount ?? "", scope: c.scope ?? "" })),
  );

  const [answers, setAnswers] = useState(concessions);

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
        {proposal && <Details values={proposal} choices={choices} concessions={concessions} />}
      </div>
    );
  }

  const keys = nightKeys(checkIn || null, checkOut || null);
  const stage = stageOf(status, choices.statuses);
  // The grid's edge-day links move check-in / check-out.
  const addDay = (edge: GridEdge) => (edge === "before" ? setCheckIn(addDays(checkIn, -1)) : setCheckOut(addDays(checkOut, 1)));
  const removeDay = (edge: GridEdge) => (edge === "before" ? setCheckIn(addDays(checkIn, 1)) : setCheckOut(addDays(checkOut, -1)));

  const nightsJson = JSON.stringify(
    rows.flatMap((r) =>
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
      {!isEdit && fromRfp && <input type="hidden" name="rfpBlockId" value={fromRfp.rfpBlockId} />}
      {answers.length > 0 && (
        <input
          type="hidden"
          name="concessions"
          value={JSON.stringify(answers.map((a) => ({ concessionId: a.id, offered: a.offered, met: a.met })))}
        />
      )}

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
          <Field label="Contract type" htmlFor="p-contractType">
            <select id="p-contractType" name="contractType" defaultValue={proposal?.contractType ?? fromRfp?.contractType ?? ""} className={inputClass}>
              <option value="">Not set</option>
              {CONTRACT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Guest type" htmlFor="p-guestType">
            <OptionSelect id="p-guestType" name="guestType" value={proposal ? proposal.guestType : (fromRfp?.guestType ?? null)} options={choices.guestTypes} />
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

      <Fieldset title="Rooms">
        {keys.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Set check-in and check-out to enter rooms.</p>
        ) : (
          <RoomGridEditor keys={keys} rows={rows} roomTypes={choices.roomTypes} withRate onChange={setRows} onAddDay={addDay} onRemoveDay={removeDay} />
        )}
      </Fieldset>

      {answers.length > 0 && (
        <Fieldset title="Concessions">
          <div className="space-y-2">
            {answers.map((a, i) => {
              const set = (patch: Partial<ConcessionAnswer>) => setAnswers((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <div key={a.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-gray-900 dark:text-white min-w-[10rem] flex-1">
                    {a.label}
                    {a.value && <span className="text-gray-500 dark:text-gray-400"> (asked {a.value})</span>}
                    {a.required && <span className="text-gray-500 dark:text-gray-400"> · required</span>}
                  </span>
                  <select
                    aria-label={`${a.label} met`}
                    value={a.met ?? ""}
                    onChange={(e) => set({ met: (e.target.value || null) as ConcessionMet | null })}
                    className={`${inputClass} mt-0 w-auto`}
                  >
                    <option value="">—</option>
                    {(Object.keys(MET_LABELS) as ConcessionMet[]).map((m) => (
                      <option key={m} value={m}>
                        {MET_LABELS[m]}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label={`${a.label} offered`}
                    placeholder="Offered"
                    value={a.offered ?? ""}
                    onChange={(e) => set({ offered: e.target.value || null })}
                    className={`${inputClass} mt-0 flex-1 min-w-[8rem]`}
                  />
                </div>
              );
            })}
          </div>
        </Fieldset>
      )}

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

      <div className="flex flex-wrap gap-3">
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
