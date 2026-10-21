"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import type { ConcessionMet, HotelChargeScope, HotelContractType } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import type { OfferHotel } from "@/lib/inboundParse";
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
import { NEW_HOTEL } from "./proposalArgs";
import { RoomGrid, type GridNight } from "./RoomGrid";
import { ConcessionOptions, OTHER_CONCESSION } from "../rfps/RfpConcessionsEditor";
import { gridNights, overNights, RoomGridEditor, toGridState, type GridEdge, type GridState } from "./RoomGridEditor";

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
  // concessions: the hotel's standing ones, which a new proposal starts with.
  venues: { id: string; label: string; isLodging: boolean; concessions: { label: string; value: string | null }[] }[];
  // The rfp_concession list, for concessions the hotel offers unasked.
  concessionOptions: { label: string; group: string | null }[];
  statuses: { label: string; group: string | null; color: string | null }[];
  roomTypes: string[];
  guestTypes: string[];
  amenities: string[];
  leadSources: string[];
};

const inputClass =
  "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm";
// Inputs sized by their row (concessions, charges), not the full width.
const inlineInputClass =
  "px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm";
const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300";
const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6";

function SaveButton({ label, disabled = false }: { label: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} className={`${btnPrimary} disabled:opacity-50`}>
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
    // min-w-0: a fieldset is min-content wide by default, so the room grid
    // would widen the page instead of scrolling.
    <fieldset className="space-y-4 min-w-0">
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

// A concession the hotel offers unasked: label and terms.
export type OfferedConcession = { label: string; offered: string | null };

// standing: copied from the hotel's standing concessions and not edited, so
// picking another hotel swaps it out.
type OfferedRow = OfferedConcession & { key: number; custom: boolean; standing: boolean };

// Row keys only (never rendered), so a module counter is safe.
let offeredKey = 0;

const sameLabel = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// The hotel's standing concessions folded into a new proposal: a requested one
// fills that answer's offer (when blank), the rest are offered unasked.
function withStanding(standing: { label: string; value: string | null }[], answers: ConcessionAnswer[], offered: OfferedConcession[]) {
  const requested = (label: string) => answers.some((a) => sameLabel(a.label, label));
  return {
    answers: answers.map((a) => {
      const s = standing.find((c) => sameLabel(c.label, a.label));
      return s && !a.offered && !a.met ? { ...a, offered: s.value ?? s.label } : a;
    }),
    extra: standing.filter((c) => !requested(c.label) && !offered.some((o) => sameLabel(o.label, c.label))).map((c) => ({ label: c.label, offered: c.value })),
  };
}

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

// The RFP blocks an emailed offer could answer, each with its concessions
// (prefilled with the offer's answers for the block it was read as).
export type RfpChoice = {
  id: string;
  label: string;
  contractType: HotelContractType;
  guestType: string | null;
  concessions: ConcessionAnswer[];
};

const NEW_HOTEL_FIELDS: { key: keyof OfferHotel; label: string; wide?: boolean; type?: string }[] = [
  { key: "name", label: "Hotel name *", wide: true },
  { key: "address", label: "Address", wide: true },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "zip", label: "ZIP" },
  { key: "contactTitle", label: "Contact title" },
  { key: "contactFirstName", label: "Contact first name" },
  { key: "contactLastName", label: "Contact last name" },
  { key: "contactEmail", label: "Contact email", type: "email" },
  { key: "contactPhone", label: "Contact phone", type: "tel" },
];

function Details({
  values,
  choices,
  concessions,
  offered,
}: {
  values: ProposalValues;
  choices: ProposalChoices;
  concessions: ConcessionAnswer[];
  offered: OfferedConcession[];
}) {
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
      {(concessions.length > 0 || offered.length > 0) && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Concessions</h3>
          <ul className="text-sm divide-y divide-gray-100 dark:divide-gray-700">
            {offered.map((c) => (
              <li key={`offered-${c.label}`} className="flex flex-wrap justify-between gap-x-3 py-1.5 text-gray-900 dark:text-white">
                <span>{c.label}</span>
                <span className="text-gray-500 dark:text-gray-400">{c.offered ?? "Offered"}</span>
              </li>
            ))}
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
  draft,
  rfpChoices,
  newHotel,
  concessions = [],
  offeredConcessions = [],
  action,
  cancelHref,
}: {
  proposal?: ProposalValues | null;
  // A new proposal's starting values (one read from an emailed offer).
  draft?: ProposalValues;
  fromRfp?: ProposalTemplate;
  // An emailed offer: pick the RFP block it answers, or none (standalone).
  rfpChoices?: RfpChoice[];
  // An emailed offer from a hotel not in Venues: offered as a new hotel.
  newHotel?: OfferHotel | null;
  concessions?: ConcessionAnswer[];
  // Concessions offered unasked (a new proposal adds the hotel's standing ones).
  offeredConcessions?: OfferedConcession[];
  choices: ProposalChoices;
  defaultCheckIn?: string | null;
  defaultCheckOut?: string | null;
  defaultVenueId?: string;
  action: (formData: FormData) => Promise<void>;
  cancelHref: string;
}) {
  const isEdit = !!proposal;
  const initial = proposal ?? draft;
  const canWrite = useCanWrite("HOTELS");
  const [editing, setEditing] = useState(!isEdit);
  const [status, setStatus] = useState(initial?.status ?? fromRfp?.status ?? choices.statuses[0]?.label ?? "");
  const [revision, setRevision] = useState(proposal?.revision ?? 1);
  const [checkIn, setCheckIn] = useState(initial ? initial.checkIn ?? "" : defaultCheckIn ?? "");
  const [checkOut, setCheckOut] = useState(initial ? initial.checkOut ?? "" : defaultCheckOut ?? "");
  const [grid, setGrid] = useState<GridState>(() => toGridState(initial?.nights ?? fromRfp?.nights ?? []));
  const [charges, setCharges] = useState(
    (initial?.charges ?? []).map((c) => ({ chargeType: c.chargeType, amount: c.amount ?? "", scope: c.scope ?? "" })),
  );

  const [rfpBlockId, setRfpBlockId] = useState(fromRfp?.rfpBlockId ?? "");
  const [venueId, setVenueId] = useState(initial?.venueId || defaultVenueId || (newHotel ? NEW_HOTEL : ""));
  const standingOf = (id: string) => (isEdit ? [] : (choices.venues.find((v) => v.id === id)?.concessions ?? []));
  const toRows = (list: OfferedConcession[], standing: boolean): OfferedRow[] =>
    list.map((c) => ({ ...c, key: offeredKey++, standing, custom: !choices.concessionOptions.some((o) => o.label === c.label) }));
  const [seeded] = useState(() => withStanding(standingOf(venueId), concessions, offeredConcessions));
  const [answers, setAnswers] = useState(seeded.answers);
  const [offered, setOffered] = useState<OfferedRow[]>(() => [...toRows(offeredConcessions, false), ...toRows(seeded.extra, true)]);
  // Swap the standing concessions for another hotel's or RFP's requests.
  const reseed = (venue: string, nextAnswers: ConcessionAnswer[], kept: OfferedRow[]) => {
    const own = kept.filter((r) => !r.standing);
    const next = withStanding(standingOf(venue), nextAnswers, own);
    setAnswers(next.answers);
    setOffered([...own, ...toRows(next.extra, true)]);
  };
  const rfpChoice = rfpChoices?.find((c) => c.id === rfpBlockId);
  const pickRfp = (id: string) => {
    setRfpBlockId(id);
    // Leaving the RFP keeps what the hotel offered against its requests.
    const kept = id
      ? offered
      : [
          ...offered,
          ...toRows(
            answers
              .filter((a) => (a.offered || a.met) && a.met !== "NOT_MET" && !offered.some((o) => sameLabel(o.label, a.label)))
              .map((a) => ({ label: a.label, offered: a.offered })),
            false,
          ),
        ];
    reseed(venueId, rfpChoices?.find((c) => c.id === id)?.concessions ?? [], kept);
  };
  const pickVenue = (id: string) => {
    setVenueId(id);
    if (!isEdit) reseed(id, answers, offered);
  };
  const addOffered = (label: string, custom: boolean) => {
    setOffered((prev) => [...prev, { key: offeredKey++, label, offered: null, custom, standing: false }]);
  };
  const setOfferedRow = (key: number, patch: Partial<OfferedRow>) =>
    setOffered((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch, standing: false } : r)));
  // A draft's block type follows the RFP block it answers.
  const defaultContractType = rfpChoices ? (rfpChoice?.contractType ?? null) : (initial?.contractType ?? fromRfp?.contractType ?? null);
  const defaultGuestType = rfpChoices ? (rfpChoice?.guestType ?? null) : initial ? initial.guestType : (fromRfp?.guestType ?? null);

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
        {proposal && <Details values={proposal} choices={choices} concessions={concessions} offered={offeredConcessions} />}
      </div>
    );
  }

  const keys = nightKeys(checkIn || null, checkOut || null);
  const stage = stageOf(status, choices.statuses);
  // The grid's edge-day links move check-in / check-out.
  const addDay = (edge: GridEdge) => (edge === "before" ? setCheckIn(addDays(checkIn, -1)) : setCheckOut(addDays(checkOut, 1)));
  const removeDay = (edge: GridEdge) => (edge === "before" ? setCheckIn(addDays(checkIn, 1)) : setCheckOut(addDays(checkOut, -1)));

  const nightsJson = JSON.stringify(gridNights(keys, grid));
  const gridOver = overNights(keys, grid).length > 0;
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
      {!isEdit && rfpBlockId && <input type="hidden" name="rfpBlockId" value={rfpBlockId} />}
      {answers.length > 0 && (
        <input
          type="hidden"
          name="concessions"
          value={JSON.stringify(answers.map((a) => ({ concessionId: a.id, offered: a.offered, met: a.met })))}
        />
      )}
      <input type="hidden" name="offeredConcessions" value={JSON.stringify(offered.map((r) => ({ label: r.label, offered: r.offered })))} />

      {!isEdit && rfpChoices && rfpChoices.length > 0 && (
        <Fieldset title="Source">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="radio" checked={!!rfpBlockId} onChange={() => pickRfp(rfpChoices[0].id)} />
              Answers an RFP
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="radio" checked={!rfpBlockId} onChange={() => pickRfp("")} />
              Standalone proposal
            </label>
          </div>
          {rfpBlockId && (
            <Field label="RFP block" htmlFor="p-rfpBlockId">
              <select id="p-rfpBlockId" value={rfpBlockId} onChange={(e) => pickRfp(e.target.value)} className={inputClass}>
                {rfpChoices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </Fieldset>
      )}

      <Fieldset title="Proposal">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Hotel *" htmlFor="p-venueId" wide>
            <select id="p-venueId" name="venueId" required value={venueId} onChange={(e) => pickVenue(e.target.value)} className={inputClass}>
              <option value="">Select a hotel</option>
              {newHotel && <option value={NEW_HOTEL}>New hotel{newHotel.name ? `: ${newHotel.name}` : ""}</option>}
              {choices.venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                  {v.isLodging ? "" : " (not lodging)"}
                </option>
              ))}
            </select>
          </Field>
          {newHotel && venueId === NEW_HOTEL && (
            <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-md border border-gray-200 dark:border-gray-700 p-3 sm:p-4">
              {NEW_HOTEL_FIELDS.map((f) => (
                <Field key={f.key} label={f.label} htmlFor={`p-newHotel-${f.key}`} wide={f.wide}>
                  <input
                    id={`p-newHotel-${f.key}`}
                    name={`newHotel.${f.key}`}
                    type={f.type ?? "text"}
                    required={f.key === "name"}
                    defaultValue={newHotel[f.key] ?? ""}
                    className={inputClass}
                  />
                </Field>
              ))}
            </div>
          )}
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
            <select key={rfpBlockId} id="p-contractType" name="contractType" defaultValue={defaultContractType ?? ""} className={inputClass}>
              <option value="">Not set</option>
              {CONTRACT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Guest type" htmlFor="p-guestType">
            <OptionSelect key={rfpBlockId} id="p-guestType" name="guestType" value={defaultGuestType} options={choices.guestTypes} />
          </Field>
          {stage === "DECLINED" && (
            <Field label="Declined reason" htmlFor="p-declinedReason" wide>
              <input id="p-declinedReason" name="declinedReason" defaultValue={initial?.declinedReason ?? ""} className={inputClass} />
            </Field>
          )}
          <Field label="Lead source" htmlFor="p-leadSource">
            <select id="p-leadSource" name="leadSource" defaultValue={initial?.leadSource ?? ""} className={inputClass}>
              <option value="">Not set</option>
              {initial?.leadSource && !choices.leadSources.includes(initial.leadSource) && (
                <option value={initial.leadSource}>{initial.leadSource}</option>
              )}
              {choices.leadSources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Submitted" htmlFor="p-submittedOn">
            <input id="p-submittedOn" type="date" name="submittedOn" defaultValue={initial?.submittedOn ?? ""} className={inputClass} />
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
          <RoomGridEditor keys={keys} state={grid} roomTypes={choices.roomTypes} withRate onChange={setGrid} onAddDay={addDay} onRemoveDay={removeDay} />
        )}
      </Fieldset>

      <Fieldset title="Concessions">
          {answers.length > 0 && <div className="space-y-2">
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
                    className={inlineInputClass}
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
                    className={`${inlineInputClass} flex-1 min-w-[8rem]`}
                  />
                </div>
              );
            })}
          </div>}
          <div className="space-y-2">
            {answers.length > 0 && offered.length > 0 && <p className={labelClass}>Also offered</p>}
            {offered.map((r) => (
              <div key={r.key} className="flex flex-wrap items-center gap-2">
                {r.custom ? (
                  <input
                    aria-label="Concession"
                    placeholder="Concession"
                    value={r.label}
                    onChange={(e) => setOfferedRow(r.key, { label: e.target.value })}
                    className={`${inlineInputClass} flex-1 min-w-[10rem]`}
                  />
                ) : (
                  <select
                    aria-label="Concession"
                    value={r.label}
                    onChange={(e) =>
                      setOfferedRow(r.key, e.target.value === OTHER_CONCESSION ? { custom: true, label: "" } : { label: e.target.value })
                    }
                    className={`${inlineInputClass} flex-1 min-w-[10rem]`}
                  >
                    <ConcessionOptions options={choices.concessionOptions} available={(l) => l === r.label || !offered.some((o) => o.label === l)} />
                  </select>
                )}
                <input
                  aria-label={`${r.label || "Concession"} terms`}
                  placeholder="Included, $10/night…"
                  value={r.offered ?? ""}
                  onChange={(e) => setOfferedRow(r.key, { offered: e.target.value || null })}
                  className={`${inlineInputClass} flex-1 min-w-[8rem]`}
                />
                <button
                  type="button"
                  onClick={() => setOffered((prev) => prev.filter((x) => x.key !== r.key))}
                  className="text-sm text-red-600 dark:text-red-400 hover:underline"
                >
                  Remove
                </button>
              </div>
            ))}
            <select
              aria-label="Add concession"
              value=""
              onChange={(e) => {
                if (e.target.value === OTHER_CONCESSION) addOffered("", true);
                else if (e.target.value) addOffered(e.target.value, false);
              }}
              className={inlineInputClass}
            >
              <option value="">+ Concession</option>
              <ConcessionOptions
                options={choices.concessionOptions}
                available={(l) => !offered.some((o) => o.label === l) && !answers.some((a) => sameLabel(a.label, l))}
              />
            </select>
          </div>
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
              defaultValue={initial?.allowedAttrition ?? ""}
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
              defaultValue={initial?.guaranteedRevenue ?? ""}
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
                  className={`${inlineInputClass} flex-1 min-w-[10rem]`}
                />
                <input
                  aria-label="Amount"
                  type="number"
                  step="0.01"
                  placeholder="$"
                  value={c.amount}
                  onChange={(e) => setCharges((prev) => prev.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                  className={`${inlineInputClass} w-24`}
                />
                <select
                  aria-label="Scope"
                  value={c.scope}
                  onChange={(e) => setCharges((prev) => prev.map((x, j) => (j === i ? { ...x, scope: e.target.value as HotelChargeScope } : x)))}
                  className={inlineInputClass}
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
              {Array.from(new Set([...choices.amenities, ...(initial?.amenities ?? [])])).map((a) => (
                <label key={a} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    name="amenities"
                    value={a}
                    defaultChecked={initial?.amenities.includes(a)}
                    className="rounded border-gray-300 dark:border-gray-600"
                  />
                  {a}
                </label>
              ))}
            </div>
          </div>
        )}
        <Field label="Notes" htmlFor="p-notes">
          <textarea id="p-notes" name="notes" rows={3} defaultValue={initial?.notes ?? ""} className={inputClass} />
        </Field>
      </Fieldset>

      <div className="flex flex-wrap gap-3">
        <SaveButton label={isEdit ? "Save" : "Create Proposal"} disabled={gridOver} />
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
