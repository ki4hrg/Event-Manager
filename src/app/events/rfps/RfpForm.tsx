"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import type { PermissionResource, RfpKind, RfpStatus } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import { RichTextEditor } from "@/components/RichTextEditor";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import { formatDateKey, formatMoney } from "@/lib/hotels";
import { FB_INCLUDES, RFP_STATUS_LABELS, sectionsFor } from "@/lib/rfp/sections";

export type RfpValues = {
  title: string;
  status: RfpStatus;
  responseDue: string | null;
  decisionBy: string | null;
  siteVisitBy: string | null;
  decisionMakerId: string | null;
  decisionMakerName: string | null; // the contact's name, for a contact outside key staff
  decisionMaker: string | null; // typed when not a contact
  areas: string[];
  eventAreas: string[]; // used when areas is empty
  sections: string[];
  introduction: string | null;
  requirements: string | null;
  contactId: string | null;
  contactName: string | null;
  arrivalDate: string | null;
  departureDate: string | null;
  datesFlexible: boolean;
  dateNotes: string | null;
  alternateDates: { startDate: string; endDate: string }[];
  peakRooms: number | null;
  reservationMethod: string | null;
  commissionNotes: string | null;
  fbMinimum: string | null;
  fbIncludes: string[];
  fbHistoricalSpend: string | null;
  amenities: string[];
};

export type RfpFormChoices = {
  contacts: { id: string; label: string }[];
  areas: { label: string; region: string | null }[];
  reservationMethods: string[];
  amenities: string[];
};

const MAX_ALTERNATES = 3;
const OTHER = "__other__";

const inputClass =
  "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm";
const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300";
const checkClass = "rounded border-gray-300 dark:border-gray-600";
const checkLabel = "flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300";
const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6";
const legendClass = "text-sm font-semibold text-gray-900 dark:text-white";

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

const span = (a: string | null, b: string | null) => (a || b ? `${formatDateKey(a)} – ${formatDateKey(b)}` : "—");

export function RfpForm({
  kind,
  resource,
  values,
  choices,
  action,
  cancelHref,
  hiddenFields,
}: {
  kind: RfpKind;
  resource: PermissionResource;
  values: RfpValues;
  choices: RfpFormChoices;
  action: (formData: FormData) => Promise<void>;
  // Set on create only; an edit form toggles back to view mode instead.
  cancelHref?: string;
  // Extra payload for create (e.g. blocks filled from history).
  hiddenFields?: Record<string, string>;
}) {
  const isEdit = !cancelHref;
  const canWrite = useCanWrite(resource);
  const [editing, setEditing] = useState(!isEdit);
  const [sections, setSections] = useState(new Set(values.sections));
  const [alternates, setAlternates] = useState(values.alternateDates);
  // The decision maker is a contact id, or OTHER for a typed name.
  const [decider, setDecider] = useState(values.decisionMakerId ?? (values.decisionMaker ? OTHER : ""));
  const parts = sectionsFor(kind);

  if (!editing || !canWrite) {
    const rows: [string, ReactNode][] = [
      ["Status", RFP_STATUS_LABELS[values.status]],
      ["Contact", values.contactName ?? "—"],
      ["Arrival – departure", span(values.arrivalDate, values.departureDate)],
      ["Peak rooms", values.peakRooms ?? "—"],
      ["Responses due", formatDateKey(values.responseDue)],
      ["Decision by", formatDateKey(values.decisionBy)],
    ];
    if (values.datesFlexible || values.alternateDates.length) {
      rows.push(["Alternates", [values.datesFlexible ? "Flexible" : null, ...values.alternateDates.map((a) => span(a.startDate, a.endDate))].filter(Boolean).join(" · ")]);
    }
    if (values.siteVisitBy) rows.push(["Site visit by", formatDateKey(values.siteVisitBy)]);
    const deciderName = values.decisionMakerId
      ? (choices.contacts.find((c) => c.id === values.decisionMakerId)?.label ?? values.decisionMakerName)
      : values.decisionMaker;
    if (deciderName) rows.push(["Decision maker", deciderName]);
    const areas = values.areas.length ? values.areas : values.eventAreas;
    if (areas.length) rows.push(["Hotel areas", `${areas.join(", ")}${values.areas.length ? "" : " (event)"}`]);
    if (values.reservationMethod) rows.push(["Reservations", values.reservationMethod]);
    if (sections.has("fb") && values.fbMinimum) rows.push(["F&B minimum", formatMoney(values.fbMinimum)]);
    if (values.amenities.length) rows.push(["Amenities", values.amenities.join(", ")]);
    rows.push(["Parts", parts.filter((p) => sections.has(p.key)).map((p) => p.label).join(", ") || "—"]);
    return (
      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Details</h2>
          {canWrite && (
            <button onClick={() => setEditing(true)} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
              Edit
            </button>
          )}
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
              <dd className="text-gray-900 dark:text-white">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  const toggle = (key: string, on: boolean) =>
    setSections((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  const setAlternate = (i: number, patch: Partial<{ startDate: string; endDate: string }>) =>
    setAlternates((prev) => prev.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  return (
    <form
      action={async (formData) => {
        await action(formData);
        if (isEdit) setEditing(false);
      }}
      className={`${cardClass} space-y-6`}
    >
      {Object.entries(hiddenFields ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <input type="hidden" name="alternateDates" value={JSON.stringify(alternates.filter((a) => a.startDate || a.endDate))} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Title *" htmlFor="rfp-title" wide>
          <input id="rfp-title" name="title" required defaultValue={values.title} className={inputClass} />
        </Field>
        {isEdit && (
          <Field label="Status" htmlFor="rfp-status">
            <select id="rfp-status" name="status" defaultValue={values.status} className={inputClass}>
              {(Object.keys(RFP_STATUS_LABELS) as RfpStatus[]).map((s) => (
                <option key={s} value={s}>
                  {RFP_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Contact" htmlFor="rfp-contactId">
          <select id="rfp-contactId" name="contactId" defaultValue={values.contactId ?? ""} className={inputClass}>
            <option value="">None</option>
            {values.contactId && !choices.contacts.some((c) => c.id === values.contactId) && <option value={values.contactId}>{values.contactName}</option>}
            {choices.contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <fieldset className="space-y-3">
        <legend className={legendClass}>Dates & rooms</legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Arrival" htmlFor="rfp-arrivalDate">
            <input id="rfp-arrivalDate" type="date" name="arrivalDate" defaultValue={values.arrivalDate ?? ""} className={inputClass} />
          </Field>
          <Field label="Departure" htmlFor="rfp-departureDate">
            <input id="rfp-departureDate" type="date" name="departureDate" defaultValue={values.departureDate ?? ""} className={inputClass} />
          </Field>
          <Field label="Peak rooms" htmlFor="rfp-peakRooms">
            <input id="rfp-peakRooms" type="number" min={0} name="peakRooms" defaultValue={values.peakRooms ?? ""} className={inputClass} />
          </Field>
        </div>
        <label className={checkLabel}>
          <input type="checkbox" name="datesFlexible" value="true" defaultChecked={values.datesFlexible} className={checkClass} />
          Dates flexible
        </label>
        {alternates.map((a, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <label className={labelClass}>
              Alternate arrival
              <input type="date" value={a.startDate} onChange={(e) => setAlternate(i, { startDate: e.target.value })} className={inputClass} />
            </label>
            <label className={labelClass}>
              Departure
              <input type="date" value={a.endDate} onChange={(e) => setAlternate(i, { endDate: e.target.value })} className={inputClass} />
            </label>
            <button type="button" onClick={() => setAlternates((prev) => prev.filter((_, j) => j !== i))} className="pb-2 text-sm text-red-600 dark:text-red-400 hover:underline">
              Remove
            </button>
          </div>
        ))}
        {alternates.length < MAX_ALTERNATES && (
          <button
            type="button"
            onClick={() => setAlternates((prev) => [...prev, { startDate: "", endDate: "" }])}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            + Alternate dates
          </button>
        )}
        <Field label="Date notes" htmlFor="rfp-dateNotes" wide>
          <textarea id="rfp-dateNotes" name="dateNotes" rows={2} defaultValue={values.dateNotes ?? ""} className={inputClass} />
        </Field>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className={legendClass}>Decision</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Responses due" htmlFor="rfp-responseDue">
            <input id="rfp-responseDue" type="date" name="responseDue" defaultValue={values.responseDue ?? ""} className={inputClass} />
          </Field>
          <Field label="Decision by" htmlFor="rfp-decisionBy">
            <input id="rfp-decisionBy" type="date" name="decisionBy" defaultValue={values.decisionBy ?? ""} className={inputClass} />
          </Field>
          <Field label="Site visit by" htmlFor="rfp-siteVisitBy">
            <input id="rfp-siteVisitBy" type="date" name="siteVisitBy" defaultValue={values.siteVisitBy ?? ""} className={inputClass} />
          </Field>
          <Field label="Decision maker" htmlFor="rfp-decisionMakerId">
            <input type="hidden" name="decisionMakerId" value={decider === OTHER ? "" : decider} />
            <select id="rfp-decisionMakerId" value={decider} onChange={(e) => setDecider(e.target.value)} className={inputClass}>
              <option value="">Not set</option>
              {values.decisionMakerId && !choices.contacts.some((c) => c.id === values.decisionMakerId) && (
                <option value={values.decisionMakerId}>{values.decisionMakerName}</option>
              )}
              {choices.contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
              <option value={OTHER}>Other…</option>
            </select>
            {decider === OTHER && (
              <input aria-label="Decision maker name" name="decisionMaker" placeholder="Name & role" defaultValue={values.decisionMaker ?? ""} className={inputClass} />
            )}
          </Field>
        </div>
      </fieldset>

      <div>
        <p className={labelClass}>Parts</p>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
          {parts.map((p) => (
            <label key={p.key} className={checkLabel}>
              <input type="checkbox" name="sections" value={p.key} checked={sections.has(p.key)} onChange={(e) => toggle(p.key, e.target.checked)} className={checkClass} />
              {p.label}
            </label>
          ))}
        </div>
      </div>

      {choices.areas.length > 0 && (
        <div>
          <p className={labelClass}>Hotel areas</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
            {Array.from(new Set([...choices.areas.map((a) => a.label), ...values.areas])).map((a) => (
              <label key={a} className={checkLabel}>
                <input type="checkbox" name="areas" value={a} defaultChecked={values.areas.includes(a)} className={checkClass} />
                {a}
                {choices.areas.find((x) => x.label === a)?.region && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">{choices.areas.find((x) => x.label === a)!.region}</span>
                )}
              </label>
            ))}
          </div>
          {values.eventAreas.length > 0 && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Event: {values.eventAreas.join(", ")}</p>}
        </div>
      )}

      {sections.has("blocks") ? (
        <fieldset className="space-y-3">
          <legend className={legendClass}>Guest rooms</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Reservations" htmlFor="rfp-reservationMethod">
              <OptionSelect id="rfp-reservationMethod" name="reservationMethod" value={values.reservationMethod} options={choices.reservationMethods} />
            </Field>
            <Field label="Rebates / commissions" htmlFor="rfp-commissionNotes">
              <input id="rfp-commissionNotes" name="commissionNotes" defaultValue={values.commissionNotes ?? ""} className={inputClass} />
            </Field>
          </div>
        </fieldset>
      ) : (
        <>
          <input type="hidden" name="reservationMethod" value={values.reservationMethod ?? ""} />
          <input type="hidden" name="commissionNotes" value={values.commissionNotes ?? ""} />
        </>
      )}

      {choices.amenities.length > 0 && (
        <div>
          <p className={labelClass}>Requested amenities</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
            {Array.from(new Set([...choices.amenities, ...values.amenities])).map((a) => (
              <label key={a} className={checkLabel}>
                <input type="checkbox" name="amenities" value={a} defaultChecked={values.amenities.includes(a)} className={checkClass} />
                {a}
              </label>
            ))}
          </div>
        </div>
      )}

      {sections.has("fb") ? (
        <fieldset className="space-y-3">
          <legend className={legendClass}>Food & beverage</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="F&B minimum" htmlFor="rfp-fbMinimum">
              <input id="rfp-fbMinimum" type="number" min={0} step="0.01" placeholder="$" name="fbMinimum" defaultValue={values.fbMinimum ?? ""} className={inputClass} />
            </Field>
            <Field label="F&B historical spend" htmlFor="rfp-fbHistoricalSpend">
              <input
                id="rfp-fbHistoricalSpend"
                type="number"
                min={0}
                step="0.01"
                placeholder="$"
                name="fbHistoricalSpend"
                defaultValue={values.fbHistoricalSpend ?? ""}
                className={inputClass}
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className={labelClass}>Minimum includes</span>
            {FB_INCLUDES.map((f) => (
              <label key={f.value} className={checkLabel}>
                <input type="checkbox" name="fbIncludes" value={f.value} defaultChecked={values.fbIncludes.includes(f.value)} className={checkClass} />
                {f.label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <>
          <input type="hidden" name="fbMinimum" value={values.fbMinimum ?? ""} />
          <input type="hidden" name="fbHistoricalSpend" value={values.fbHistoricalSpend ?? ""} />
          {values.fbIncludes.map((f) => (
            <input key={f} type="hidden" name="fbIncludes" value={f} />
          ))}
        </>
      )}

      <div>
        <p className={labelClass}>Statement of need</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">The services this RFP seeks and the length of the contract, in years.</p>
        <div className="mt-1">
          <RichTextEditor name="introduction" defaultValue={values.introduction ?? ""} />
        </div>
      </div>
      {sections.has("requirements") ? (
        <div>
          <p className={labelClass}>Other requirements</p>
          <div className="mt-1">
            <RichTextEditor name="requirements" defaultValue={values.requirements ?? ""} />
          </div>
        </div>
      ) : (
        <input type="hidden" name="requirements" value={values.requirements ?? ""} />
      )}

      <div className="flex flex-wrap gap-3">
        <SaveButton label={isEdit ? "Save" : "Create RFP"} />
        {isEdit ? (
          <button type="button" onClick={() => setEditing(false)} className={btnSecondary}>
            Cancel
          </button>
        ) : (
          <Link href={cancelHref!} className={btnSecondary}>
            Cancel
          </Link>
        )}
      </div>
    </form>
  );
}
