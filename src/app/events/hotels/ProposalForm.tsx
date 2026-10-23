"use client";

import { DateInput } from "@/components/ui/DateInput";
import { rangeEndFor, rangeEndMin, syncRangeEnd } from "@/lib/dateRange";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAutosave } from "@/lib/useAutosave";
import { AutosaveStatus } from "@/components/AutosaveStatus";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import type { ConcessionMet, HotelChargeScope, HotelContractType } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import type { OfferHotel } from "@/lib/inboundParse";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import {
  addDays,
  CHARGE_SCOPES,
  CONTRACT_TYPES,
  coveredByProfile,
  labelKey,
  MET_LABELS,
  nightKeys,
  stageOf,
} from "@/lib/hotels";
import { LEAD_SOURCE_DIRECT, NEW_HOTEL, NEW_HOTEL_FIELDS } from "./proposalArgs";
import { StatusCycle, type StatusCycleOption } from "@/components/ui/StatusCycle";
import {
  BLANK_SPACE,
  mealRows,
  spaceAnswers,
  spaceArgs,
  WAIVER_TYPES,
  type SpaceAnswer,
  type SpaceRequestDoc,
  type StoredSpace,
} from "@/lib/rfp/proposalSpace";
import type { HotelWaiverType } from "@prisma/client";
import { ConcessionOptions } from "../rfps/RfpConcessionsEditor";
import { AmenityEditor, type ProposalAmenity } from "./ProposalAmenities";
import { gridNights, overNights, RoomGridEditor, toGridState, type GridEdge, type GridState, type StoredNight } from "./RoomGridEditor";

export type ProposalValues = {
  venueId: string;
  status: string;
  leadSourceDirect: boolean;
  leadSourceVendorId: string | null;
  leadSourceContactId: string | null;
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
  validUntil: string | null;
  taxIncluded: boolean | null;
  // The amenities the offer states (Confirmed / Unavailable); the hotel's
  // profile covers the rest.
  amenities: ProposalAmenity[];
  nights: StoredNight[];
  charges: ChargeValue[];
  // Absent: a form source without them (left as the proposal has them).
  meetingCharges?: ChargeValue[];
  spaces?: StoredSpace[];
  fbMinimum?: string | null;
  fbMinimumScope?: HotelChargeScope | null;
  fbMinimumNote?: string | null;
  fbTaxRate?: string | null;
  fbServiceCharge?: string | null;
  meals?: { mealType: string; price: string | null }[];
};

type ChargeValue = { chargeType: string; amount: string | null; scope: HotelChargeScope | null };

export type ProposalChoices = {
  // amenities: the hotel's profile.
  venues: { id: string; label: string; isLodging: boolean; amenities: string[] }[];
  // The rfp_concession list, for concessions the hotel offers unasked.
  concessionOptions: { label: string; group: string | null }[];
  statuses: { label: string; group: string | null; color: string | null }[];
  roomTypes: string[];
  guestTypes: string[];
  amenities: string[];
  mealTypes: string[];
  // Vendors tagged LEAD_SOURCE (CVBs, third-party planners), with their contacts.
  leadSources: { id: string; name: string; contacts: { id: string; name: string }[] }[];
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

type ChargeRow = { chargeType: string; amount: string; scope: HotelChargeScope | "" };

const chargeRowsOf = (list: ChargeValue[] | undefined): ChargeRow[] => (list ?? []).map((c) => ({ chargeType: c.chargeType, amount: c.amount ?? "", scope: c.scope ?? "" }));

const chargesJsonOf = (rows: ChargeRow[]) =>
  JSON.stringify(
    rows.filter((c) => c.chargeType.trim()).map((c) => ({ chargeType: c.chargeType, amount: c.amount !== "" ? Number(c.amount) : null, scope: c.scope || null })),
  );

function ScopeSelect({ label, value, onChange, name }: { label: string; value?: HotelChargeScope | ""; onChange?: (v: HotelChargeScope | "") => void; name?: string }) {
  return (
    <select
      aria-label={label}
      name={name}
      value={onChange ? value : undefined}
      defaultValue={onChange ? undefined : value}
      onChange={onChange ? (e) => onChange(e.target.value as HotelChargeScope | "") : undefined}
      className={inlineInputClass}
    >
      <option value="">—</option>
      {CHARGE_SCOPES.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

function ChargeList({ label, placeholder, rows, onChange }: { label: string; placeholder: string; rows: ChargeRow[]; onChange: (rows: ChargeRow[]) => void }) {
  const set = (i: number, patch: Partial<ChargeRow>) => onChange(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div>
      <p className={labelClass}>{label}</p>
      <div className="mt-1 space-y-2">
        {rows.map((c, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input
              aria-label="Charge"
              placeholder={placeholder}
              value={c.chargeType}
              onChange={(e) => set(i, { chargeType: e.target.value })}
              className={`${inlineInputClass} flex-1 min-w-[10rem]`}
            />
            <input
              aria-label="Amount"
              type="number"
              step="0.01"
              placeholder="$"
              value={c.amount}
              onChange={(e) => set(i, { amount: e.target.value })}
              className={`${inlineInputClass} w-24`}
            />
            <ScopeSelect label="Scope" value={c.scope} onChange={(scope) => set(i, { scope })} />
            <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="text-sm text-red-600 dark:text-red-400 hover:underline">
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...rows, { chargeType: "", amount: "", scope: "" }])}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          + Charge
        </button>
      </div>
    </div>
  );
}

// The function space offered: a row per RFP meeting space request (room,
// capacity, 24-hr hold, rental), then rooms offered unasked.
function SpaceEditor({ rows, onChange }: { rows: SpaceAnswer[]; onChange: (rows: SpaceAnswer[]) => void }) {
  const set = (i: number, patch: Partial<SpaceAnswer>) => onChange(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={r.request?.id ?? `extra-${i}`} className="space-y-2 rounded-md border border-gray-200 dark:border-gray-700 p-3">
          {r.request ? (
            <p className="text-sm text-gray-900 dark:text-white">
              <span className="text-gray-500 dark:text-gray-400">{r.request.when} · </span>
              {r.request.name}
              {r.request.asked && <span className="text-gray-500 dark:text-gray-400"> (asked {r.request.asked})</span>}
            </p>
          ) : (
            <input
              aria-label="Function"
              placeholder="Function or room"
              value={r.name}
              onChange={(e) => set(i, { name: e.target.value })}
              className={`${inlineInputClass} w-full`}
            />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input
              aria-label="Room offered"
              placeholder="Room offered"
              value={r.room}
              onChange={(e) => set(i, { room: e.target.value })}
              className={`${inlineInputClass} flex-1 min-w-[10rem]`}
            />
            <input
              aria-label="Capacity"
              type="number"
              min={0}
              placeholder="Capacity"
              value={r.capacity}
              onChange={(e) => set(i, { capacity: e.target.value })}
              className={`${inlineInputClass} w-28`}
            />
            <select
              aria-label="24-hr hold"
              value={r.hold24 == null ? "" : String(r.hold24)}
              onChange={(e) => set(i, { hold24: e.target.value === "" ? null : e.target.value === "true" })}
              className={inlineInputClass}
            >
              <option value="">24-hr hold —</option>
              <option value="true">24-hr hold</option>
              <option value="false">No 24-hr hold</option>
            </select>
            <input
              aria-label="Rental"
              type="number"
              step="0.01"
              min={0}
              placeholder="Rental $"
              value={r.rental}
              onChange={(e) => set(i, { rental: e.target.value })}
              className={`${inlineInputClass} w-28`}
            />
            <ScopeSelect label="Rental scope" value={r.rentalScope} onChange={(rentalScope) => set(i, { rentalScope })} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Rental waived with"
              value={r.waiverType}
              onChange={(e) => set(i, { waiverType: e.target.value as HotelWaiverType | "" })}
              className={inlineInputClass}
            >
              <option value="">Not waived</option>
              {WAIVER_TYPES.map((w) => (
                <option key={w.value} value={w.value}>
                  Waived with {w.label.toLowerCase()}
                </option>
              ))}
            </select>
            {r.waiverType && (
              <>
                <input
                  aria-label="Waiver amount"
                  type="number"
                  step={r.waiverType === "ROOM_NIGHTS" ? "1" : "0.01"}
                  min={0}
                  placeholder={r.waiverType === "ROOM_NIGHTS" ? "Room nights" : "$"}
                  value={r.waiverAmount}
                  onChange={(e) => set(i, { waiverAmount: e.target.value })}
                  className={`${inlineInputClass} w-28`}
                />
                <ScopeSelect label="Waiver scope" value={r.waiverScope} onChange={(waiverScope) => set(i, { waiverScope })} />
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              aria-label="Note"
              placeholder="Note"
              value={r.note}
              onChange={(e) => set(i, { note: e.target.value })}
              className={`${inlineInputClass} flex-1 min-w-[10rem]`}
            />
            {!r.request && (
              <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="text-sm text-red-600 dark:text-red-400 hover:underline">
                Remove
              </button>
            )}
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, { request: null, ...BLANK_SPACE }])}
        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
      >
        + Room
      </button>
    </div>
  );
}

type MealRow = { mealType: string; price: string; asked: boolean };

function MealEditor({ rows, options, onChange }: { rows: MealRow[]; options: string[]; onChange: (rows: MealRow[]) => void }) {
  return (
    <div>
      <p className={labelClass}>Average price per person</p>
      <div className="mt-1 space-y-2">
        {rows.map((m, i) => (
          <div key={m.mealType} className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-900 dark:text-white min-w-[10rem] flex-1">{m.mealType}</span>
            <input
              aria-label={`${m.mealType} price`}
              type="number"
              step="0.01"
              min={0}
              placeholder="$"
              value={m.price}
              onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))}
              className={`${inlineInputClass} w-28`}
            />
            {!m.asked && (
              <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="text-sm text-red-600 dark:text-red-400 hover:underline">
                Remove
              </button>
            )}
          </div>
        ))}
        <select
          aria-label="Add meal"
          value=""
          onChange={(e) => e.target.value && onChange([...rows, { mealType: e.target.value, price: "", asked: false }])}
          className={inlineInputClass}
        >
          <option value="">+ Meal</option>
          {options
            .filter((o) => !rows.some((m) => m.mealType.toLowerCase() === o.toLowerCase()))
            .map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
        </select>
      </div>
    </div>
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

// custom: a label held from before the concession list was strict.
type OfferedRow = OfferedConcession & { key: number; custom: boolean };

// Row keys only (never rendered), so a module counter is safe.
let offeredKey = 0;

// Requested concessions the hotel's profile covers start Met
// (coveredByProfile). auto: the answers filled that way, undone when the
// hotel changes.
function metByProfile(answers: ConcessionAnswer[], profile: string[], auto: string[]) {
  const covered = coveredByProfile(profile);
  const cleared = answers.map((a) => (auto.includes(a.id) ? { ...a, met: null } : a));
  const filled = cleared.filter((a) => !a.met && !a.offered && covered(a.label)).map((a) => a.id);
  return { answers: cleared.map((a) => (filled.includes(a.id) ? { ...a, met: "MET" as const } : a)), auto: filled };
}

// A new proposal answering a requested RFP block starts as a copy of it.
export type ProposalTemplate = {
  rfpBlockId: string;
  contractType: HotelContractType;
  guestType: string | null;
  status: string | null;
  nights: StoredNight[];
};

// The RFP blocks an emailed offer could answer, each with its concessions
// (prefilled with the offer's answers for the block it was read as).
export type RfpChoice = {
  id: string;
  label: string;
  contractType: HotelContractType;
  guestType: string | null;
  concessions: ConcessionAnswer[];
  spaceRequests: SpaceRequestDoc[];
  mealTypes: string[];
};

const MET_OPTIONS: StatusCycleOption<ConcessionMet | "">[] = [
  { value: "", label: "—", color: "gray" },
  { value: "MET", label: MET_LABELS.MET, color: "green" },
  { value: "PARTIAL", label: MET_LABELS.PARTIAL, color: "yellow" },
  { value: "NOT_MET", label: MET_LABELS.NOT_MET, color: "red" },
];


// Three modes: create (no proposal: submits, then the detail page autosaves),
// edit (a proposal: autosaves through a non-redirecting action), and revise
// (a proposal plus a draft, from the Inbox: submits as the next revision).
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
  canAddHotel = false,
  concessions = [],
  offeredConcessions = [],
  spaceRequests = [],
  mealTypes = [],
  addAmenityToHotel,
  extraFields,
  action,
  cancelHref,
}: {
  proposal?: ProposalValues | null;
  // A new proposal's starting values (one read from an emailed offer); with
  // proposal, a revision of it, opened for editing.
  draft?: ProposalValues;
  fromRfp?: ProposalTemplate;
  // An emailed offer: pick the RFP block it answers, or none (standalone).
  rfpChoices?: RfpChoice[];
  // An emailed offer from a hotel not in Venues: "New hotel", prefilled and picked.
  newHotel?: OfferHotel | null;
  // VENUES WRITE: "New hotel" is offered, creating a lodging venue on save.
  canAddHotel?: boolean;
  concessions?: ConcessionAnswer[];
  // Concessions offered unasked.
  offeredConcessions?: OfferedConcession[];
  // The RFP's meeting space requests and the meal types it asks prices for.
  spaceRequests?: SpaceRequestDoc[];
  mealTypes?: string[];
  // VENUES WRITE: put an amenity the offer confirms on the hotel's profile.
  addAmenityToHotel?: (label: string) => Promise<void>;
  // Submitted with the form, above its buttons (the Inbox's attachment pick).
  extraFields?: ReactNode;
  choices: ProposalChoices;
  defaultCheckIn?: string | null;
  defaultCheckOut?: string | null;
  defaultVenueId?: string;
  action: (formData: FormData) => Promise<void>;
  cancelHref: string;
}) {
  const isEdit = !!proposal;
  const revising = isEdit && !!draft;
  const autosaving = isEdit && !revising;
  // Uncontrolled and autosaving, so it keeps the values it mounted with; the
  // refreshed ones after each save would only reset it.
  const [initial] = useState(draft ?? proposal);
  const [mountRevision] = useState(proposal?.revision ?? 1);
  // The lowest revision the server takes: raised by each saved bump.
  const [floor, setFloor] = useState(mountRevision);
  const canWrite = useCanWrite("HOTELS");
  const [status, setStatus] = useState(initial?.status ?? fromRfp?.status ?? choices.statuses[0]?.label ?? "");
  const [revision, setRevision] = useState(initial?.revision ?? 1);
  const [checkIn, setCheckIn] = useState(initial ? initial.checkIn ?? "" : defaultCheckIn ?? "");
  const [checkOut, setCheckOut] = useState(initial ? initial.checkOut ?? "" : defaultCheckOut ?? "");
  const [grid, setGrid] = useState<GridState>(() => toGridState(initial?.nights ?? fromRfp?.nights ?? []));
  const [charges, setCharges] = useState(() => chargeRowsOf(initial?.charges));
  const [meetingCharges, setMeetingCharges] = useState(() => chargeRowsOf(initial?.meetingCharges));
  const [spaces, setSpaces] = useState(() => spaceAnswers(spaceRequests, initial?.spaces ?? []));
  const [meals, setMeals] = useState<MealRow[]>(() => mealRows(mealTypes, initial?.meals ?? []));

  const [rfpBlockId, setRfpBlockId] = useState(fromRfp?.rfpBlockId ?? "");
  const [leadSource, setLeadSource] = useState(initial?.leadSourceDirect ? LEAD_SOURCE_DIRECT : (initial?.leadSourceVendorId ?? ""));
  const leadContacts = choices.leadSources.find((l) => l.id === leadSource)?.contacts ?? [];
  const [venueId, setVenueId] = useState(initial?.venueId || defaultVenueId || (newHotel && canAddHotel ? NEW_HOTEL : ""));
  const profileOf = (id: string) => choices.venues.find((v) => v.id === id)?.amenities ?? [];
  const [amenities, setAmenities] = useState<ProposalAmenity[]>(initial?.amenities ?? []);
  const [addedAmenities, setAddedAmenities] = useState<string[]>([]);
  // What the profile covers for this offer: not an amenity it says is unavailable.
  const coverOf = (id: string) => profileOf(id).filter((l) => !amenities.some((a) => a.label === l && a.status === "UNAVAILABLE"));
  const [seeded] = useState(() => (isEdit ? { answers: concessions, auto: [] } : metByProfile(concessions, coverOf(venueId), [])));
  const [answers, setAnswers] = useState(seeded.answers);
  const [autoMet, setAutoMet] = useState(seeded.auto);
  const toRows = (list: OfferedConcession[]): OfferedRow[] =>
    list.map((c) => ({ ...c, key: offeredKey++, custom: !choices.concessionOptions.some((o) => o.label === c.label) }));
  const [offered, setOffered] = useState<OfferedRow[]>(() => toRows(offeredConcessions));
  const reseed = (venue: string, nextAnswers: ConcessionAnswer[], auto: string[]) => {
    const next = metByProfile(nextAnswers, coverOf(venue), auto);
    setAnswers(next.answers);
    setAutoMet(next.auto);
  };
  const rfpChoice = rfpChoices?.find((c) => c.id === rfpBlockId);
  const pickRfp = (id: string) => {
    setRfpBlockId(id);
    // Answers to another RFP's requests carry over as rooms offered unasked;
    // meal prices carry over too.
    const next = rfpChoices?.find((c) => c.id === id);
    setSpaces((prev) => spaceAnswers(next?.spaceRequests ?? [], spaceArgs(prev)));
    setMeals((prev) => mealRows(next?.mealTypes ?? [], prev.map((m) => ({ mealType: m.mealType, price: m.price || null }))));
    // Leaving the RFP keeps what the hotel offered against its requests (not
    // what the profile answered).
    if (!id) {
      const kept = answers.filter(
        (a) => !autoMet.includes(a.id) && (a.offered || a.met) && a.met !== "NOT_MET" && !offered.some((o) => labelKey(o.label) === labelKey(a.label)),
      );
      setOffered((prev) => [...prev, ...toRows(kept.map((a) => ({ label: a.label, offered: a.offered })))]);
    }
    reseed(venueId, rfpChoices?.find((c) => c.id === id)?.concessions ?? [], []);
  };
  const pickVenue = (id: string) => {
    setVenueId(id);
    if (!isEdit) reseed(id, answers, autoMet);
  };
  const addOffered = (label: string) => setOffered((prev) => [...prev, { key: offeredKey++, label, offered: null, custom: false }]);
  const setOfferedRow = (key: number, patch: Partial<OfferedRow>) => setOffered((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  // A draft's block type follows the RFP block it answers.
  const defaultContractType = rfpChoices ? (rfpChoice?.contractType ?? null) : (initial?.contractType ?? fromRfp?.contractType ?? null);
  const defaultGuestType = rfpChoices ? (rfpChoice?.guestType ?? null) : initial ? initial.guestType : (fromRfp?.guestType ?? null);

  const keys = nightKeys(checkIn || null, checkOut || null);
  const stage = stageOf(status, choices.statuses);
  // The grid's edge-day links move check-in / check-out.
  const addDay = (edge: GridEdge) => (edge === "before" ? setCheckIn(addDays(checkIn, -1)) : setCheckOut(addDays(checkOut, 1)));
  const removeDay = (edge: GridEdge) => (edge === "before" ? setCheckIn(addDays(checkIn, 1)) : setCheckOut(addDays(checkOut, -1)));

  const nightsJson = JSON.stringify(gridNights(keys, grid));
  const gridOver = overNights(keys, grid).length > 0;
  const mealsJson = JSON.stringify(meals.map((m) => ({ mealType: m.mealType, price: m.price !== "" ? Number(m.price) : null })));

  // Autosave: the form's payload is read after each render (so state-driven
  // hidden inputs are current) and kept for a save after unmount. The saved
  // value is every edit: native input events bump formVersion, and the state
  // the buttons and status cycles change is in sig.
  const formRef = useRef<HTMLFormElement>(null);
  const payload = useRef<FormData | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  useEffect(() => {
    if (formRef.current) payload.current = new FormData(formRef.current);
  });
  const sig = JSON.stringify([status, revision, checkIn, checkOut, grid, charges, meetingCharges, spaces, meals, leadSource, amenities, answers, offered]);
  const autosave = useAutosave(
    autosaving && canWrite ? `${formVersion}|${sig}` : "",
    async () => {
      const data = payload.current;
      if (!data) return;
      await action(data);
      setFloor(parseInt(data.get("revision") as string) || 1);
    },
    { invalid: gridOver ? "Typed rooms exceed a night's total" : null },
  );

  return (
    <form
      ref={formRef}
      action={autosaving ? undefined : action}
      onChange={autosaving ? () => setFormVersion((v) => v + 1) : undefined}
      onSubmit={autosaving ? (e) => e.preventDefault() : undefined}
      className={`${cardClass} space-y-6`}
    >
      {autosaving && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Proposal</h2>
          <AutosaveStatus {...autosave} />
        </div>
      )}
      <fieldset disabled={!canWrite} className="space-y-6 min-w-0">
        <input type="hidden" name="nights" value={nightsJson} />
        <input type="hidden" name="charges" value={chargesJsonOf(charges)} />
        <input type="hidden" name="meetingCharges" value={chargesJsonOf(meetingCharges)} />
        <input type="hidden" name="spaces" value={JSON.stringify(spaceArgs(spaces))} />
        <input type="hidden" name="meals" value={mealsJson} />
        {!isEdit && rfpBlockId && <input type="hidden" name="rfpBlockId" value={rfpBlockId} />}
        {answers.length > 0 && (
          <input
            type="hidden"
            name="concessions"
            value={JSON.stringify(answers.map((a) => ({ concessionId: a.id, offered: a.offered, met: a.met })))}
          />
        )}
        <input type="hidden" name="offeredConcessions" value={JSON.stringify(offered.map((r) => ({ label: r.label, offered: r.offered })))} />
        <input type="hidden" name="amenities" value={JSON.stringify(amenities)} />

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

        <Fieldset title="Details">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Hotel *" htmlFor="p-venueId" wide>
              <select id="p-venueId" name="venueId" required value={venueId} onChange={(e) => pickVenue(e.target.value)} className={inputClass}>
                <option value="">Select a hotel</option>
                {canAddHotel && !isEdit && <option value={NEW_HOTEL}>New hotel</option>}
                {choices.venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                    {v.isLodging ? "" : " (not lodging)"}
                  </option>
                ))}
              </select>
            </Field>
            {venueId === NEW_HOTEL && (
              <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-md border border-gray-200 dark:border-gray-700 p-3 sm:p-4">
                {NEW_HOTEL_FIELDS.map((f) => (
                  <Field key={f.key} label={f.label} htmlFor={`p-newHotel-${f.key}`} wide={f.wide}>
                    <input
                      id={`p-newHotel-${f.key}`}
                      name={`newHotel.${f.key}`}
                      type={f.type ?? "text"}
                      required={f.key === "name"}
                      defaultValue={newHotel?.[f.key] ?? ""}
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
              <select id="p-leadSource" name="leadSource" value={leadSource} onChange={(e) => setLeadSource(e.target.value)} className={inputClass}>
                <option value="">Not set</option>
                <option value={LEAD_SOURCE_DIRECT}>Direct</option>
                {choices.leadSources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            {leadContacts.length > 0 && (
              <Field label="Lead source contact" htmlFor="p-leadSourceContactId">
                <select id="p-leadSourceContactId" name="leadSourceContactId" defaultValue={initial?.leadSourceContactId ?? ""} className={inputClass}>
                  <option value="">Not set</option>
                  {leadContacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Submitted" htmlFor="p-submittedOn">
              <input
                id="p-submittedOn"
                type="date"
                name="submittedOn"
                defaultValue={initial?.submittedOn ?? ""}
                onChange={(e) => syncRangeEnd(e.currentTarget, "validUntil", { fillEmpty: false })}
                className={inputClass}
              />
            </Field>
            <Field label="Revision" htmlFor="p-revision">
              <input
                id="p-revision"
                type="number"
                name="revision"
                min={floor}
                value={revision}
                onChange={(e) => setRevision(parseInt(e.target.value) || 1)}
                className={inputClass}
              />
            </Field>
            {isEdit && revision > mountRevision && (
              <Field label="What changed" htmlFor="p-revisionSummary">
                <input id="p-revisionSummary" name="revisionSummary" className={inputClass} />
              </Field>
            )}
          </div>
        </Fieldset>

        <Fieldset title="Stay">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Earliest check-in" htmlFor="p-checkIn">
              <DateInput
                id="p-checkIn"
                name="checkIn"
                value={checkIn}
                onChange={(v) => {
                  setCheckIn(v);
                  setCheckOut(rangeEndFor(v, checkOut, 1));
                }}
                className={inputClass}
              />
            </Field>
            <Field label="Latest check-out" htmlFor="p-checkOut">
              <DateInput id="p-checkOut" name="checkOut" min={rangeEndMin(checkIn, 1)} value={checkOut} onChange={setCheckOut} className={inputClass} />
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

        <Fieldset title="Function space">
          <SpaceEditor rows={spaces} onChange={setSpaces} />
          <ChargeList label="Meeting space charges" placeholder="AV, room rental…" rows={meetingCharges} onChange={setMeetingCharges} />
        </Fieldset>

        <Fieldset title="Food & beverage">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="p-fbMinimum" className={labelClass}>
                F&B minimum
              </label>
              <div className="mt-1 flex flex-wrap gap-2">
                <input
                  id="p-fbMinimum"
                  type="number"
                  name="fbMinimum"
                  min={0}
                  step="0.01"
                  placeholder="$"
                  defaultValue={initial?.fbMinimum ?? ""}
                  className={`${inlineInputClass} flex-1 min-w-[6rem]`}
                />
                <ScopeSelect label="F&B minimum scope" name="fbMinimumScope" value={initial?.fbMinimumScope ?? ""} />
              </div>
            </div>
            <Field label="Minimum applies to" htmlFor="p-fbMinimumNote">
              <input
                id="p-fbMinimumNote"
                name="fbMinimumNote"
                placeholder="Waives meeting room rental"
                defaultValue={initial?.fbMinimumNote ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="F&B tax %" htmlFor="p-fbTaxRate">
              <input id="p-fbTaxRate" type="number" name="fbTaxRate" min={0} max={100} step="0.01" defaultValue={initial?.fbTaxRate ?? ""} className={inputClass} />
            </Field>
            <Field label="Service charge %" htmlFor="p-fbServiceCharge">
              <input
                id="p-fbServiceCharge"
                type="number"
                name="fbServiceCharge"
                min={0}
                max={100}
                step="0.01"
                defaultValue={initial?.fbServiceCharge ?? ""}
                className={inputClass}
              />
            </Field>
          </div>
          <MealEditor rows={meals} options={choices.mealTypes} onChange={setMeals} />
        </Fieldset>

        <Fieldset title="Amenities">
          <AmenityEditor
            profile={venueId === NEW_HOTEL ? [] : profileOf(venueId)}
            list={choices.amenities}
            value={amenities}
            added={addedAmenities}
            onChange={setAmenities}
            onAdd={(label) => setAddedAmenities((prev) => [...prev, label])}
            addToHotel={venueId === proposal?.venueId ? addAmenityToHotel : undefined}
          />
        </Fieldset>

        <Fieldset title="Concessions">
          {answers.length > 0 && (
            <div className="space-y-2">
              {answers.map((a, i) => {
                const set = (patch: Partial<ConcessionAnswer>) => {
                  setAnswers((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  setAutoMet((prev) => prev.filter((id) => id !== a.id));
                };
                return (
                  <div key={a.id} className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-gray-900 dark:text-white min-w-[10rem] flex-1">
                      {a.label}
                      {a.value && <span className="text-gray-500 dark:text-gray-400"> (asked {a.value})</span>}
                      {a.required && <span className="text-gray-500 dark:text-gray-400"> · required</span>}
                    </span>
                    <StatusCycle
                      label={`${a.label} met`}
                      value={a.met ?? ""}
                      options={MET_OPTIONS}
                      onChange={(met) => set({ met: met || null })}
                    />
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
            </div>
          )}
          <div className="space-y-2">
            {answers.length > 0 && offered.length > 0 && <p className={labelClass}>Also offered</p>}
            {offered.map((r) => (
              <div key={r.key} className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Concession"
                  value={r.label}
                  onChange={(e) => setOfferedRow(r.key, { label: e.target.value, custom: false })}
                  className={`${inlineInputClass} flex-1 min-w-[10rem]`}
                >
                  {r.custom && <option value={r.label}>{r.label} (not in list)</option>}
                  <ConcessionOptions options={choices.concessionOptions} available={(l) => l === r.label || !offered.some((o) => o.label === l)} />
                </select>
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
              onChange={(e) => e.target.value && addOffered(e.target.value)}
              className={inlineInputClass}
            >
              <option value="">+ Concession</option>
              <ConcessionOptions
                options={choices.concessionOptions}
                available={(l) => !offered.some((o) => o.label === l) && !answers.some((a) => labelKey(a.label) === labelKey(l))}
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
            <Field label="Valid until" htmlFor="p-validUntil">
              <input id="p-validUntil" type="date" name="validUntil" min={rangeEndMin(initial?.submittedOn)} defaultValue={initial?.validUntil ?? ""} className={inputClass} />
            </Field>
            <Field label="Rates include taxes" htmlFor="p-taxIncluded">
              <select
                id="p-taxIncluded"
                name="taxIncluded"
                defaultValue={initial?.taxIncluded == null ? "" : String(initial.taxIncluded)}
                className={inputClass}
              >
                <option value="">Not stated</option>
                <option value="false">No, plus taxes</option>
                <option value="true">Yes</option>
              </select>
            </Field>
          </div>
          <ChargeList label="Guest charges" placeholder="Resort fee, parking…" rows={charges} onChange={setCharges} />
          <Field label="Notes" htmlFor="p-notes">
            <textarea id="p-notes" name="notes" rows={3} defaultValue={initial?.notes ?? ""} className={inputClass} />
          </Field>
        </Fieldset>

        {extraFields}

        {!autosaving && (
          <div className="flex flex-wrap gap-3">
            <SaveButton label={revising ? "Apply Revision" : "Create Proposal"} disabled={gridOver} />
            <Link href={cancelHref} className={btnSecondary}>
              Cancel
            </Link>
          </div>
        )}
      </fieldset>
    </form>
  );
}
