"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { OptionSelect } from "@/components/ui/OptionSelect";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import type { PermissionResource, RfpKind, RfpStatus } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import { DateInput } from "@/components/ui/DateInput";
import { RichTextEditor } from "@/components/RichTextEditor";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import { BLANK, FB_INCLUDES, RFP_STATUS_LABELS, sectionsFor } from "@/lib/rfp/sections";
import { isEmptyScope, scopeLabels, type AreaOption, type AreaScope } from "@/lib/areas";
import { AreaChecklist } from "@/components/AreaChecklist";
import { useAutosave } from "@/lib/useAutosave";
import { rangeEndFor, rangeEndMin, syncRangeEnd } from "@/lib/dateRange";
import { AutosaveStatus } from "@/components/AutosaveStatus";

export type RfpValues = {
  title: string;
  status: RfpStatus;
  responseDue: string | null;
  decisionBy: string | null;
  siteVisitBy: string | null;
  decisionMakerId: string | null;
  decisionMakerName: string | null; // the contact's name, for a contact outside key staff
  decisionMaker: string | null; // typed when not a contact
  regions: string[];
  areas: string[];
  eventScope: AreaScope; // used when the RFP sets no regions or areas
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
  multiProperty: boolean;
  historyMatching: boolean;
  reservationMethod: string | null;
  commissionNotes: string | null;
  fbMinimum: string | null;
  fbIncludes: string[];
  fbHistoricalSpend: string | null;
  amenities: string[];
  service?: string | null; // OTHER: an rfp_service label
};

export type RfpFormChoices = {
  contacts: { id: string; label: string }[];
  regions: string[];
  areas: AreaOption[];
  reservationMethods: string[];
  amenities: string[];
  services?: string[]; // rfp_service labels, for OTHER
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
const richClass = "text-gray-900 dark:text-white [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-1";

// The editor, or its HTML for a read-only viewer (a disabled fieldset doesn't
// reach a contenteditable).
function RichText({ name, html, editable, onChange }: { name: string; html: string | null; editable: boolean; onChange?: () => void }) {
  if (editable) return <RichTextEditor name={name} defaultValue={html ?? ""} onChange={onChange} />;
  if (!html) return <p className="text-sm text-gray-500 dark:text-gray-400">—</p>;
  // HTML from RichTextEditor (Rfp.introduction / Rfp.requirements).
  return <div className={`text-sm ${richClass}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

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

export function RfpForm({
  kind,
  resource,
  values: current,
  choices,
  action,
  cancelHref,
  hiddenFields,
}: {
  kind: RfpKind;
  resource: PermissionResource;
  values: RfpValues;
  choices: RfpFormChoices;
  // Create submits; edit autosaves through it (no redirect).
  action: (formData: FormData) => Promise<void>;
  // Set on create only.
  cancelHref?: string;
  // Extra payload for create (e.g. blocks filled from history).
  hiddenFields?: Record<string, string>;
}) {
  const isEdit = !cancelHref;
  const canWrite = useCanWrite(resource);
  // The form is uncontrolled and autosaves, so it keeps the values it mounted
  // with; the refreshed ones after each save would only reset it.
  const [values] = useState(current);
  const [sections, setSections] = useState(new Set(values.sections));
  const [alternates, setAlternates] = useState(values.alternateDates);
  // The decision maker is a contact id, or OTHER for a typed name.
  const [decider, setDecider] = useState(values.decisionMakerId ?? (values.decisionMaker ? OTHER : BLANK));
  const parts = sectionsFor(kind);
  const hotel = kind === "HOTEL";
  // A hotel stay ends at least a night after it starts.
  const stayGap = hotel ? 1 : 0;
  // Each change bumps the version; the form's payload is read after the
  // render that follows, so state-driven hidden inputs are current, and is
  // kept for a save that runs after the form unmounts.
  const formRef = useRef<HTMLFormElement>(null);
  const payload = useRef<FormData | null>(null);
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  useEffect(() => {
    if (formRef.current) payload.current = new FormData(formRef.current);
  });
  const status = useAutosave(version, async () => {
    if (payload.current) await action(payload.current);
  });

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
    <form ref={formRef} action={isEdit ? undefined : action} onChange={isEdit ? bump : undefined} className={`${cardClass} space-y-6`}>
      {isEdit && (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Details</h2>
          {canWrite && <AutosaveStatus {...status} />}
        </div>
      )}
      {Object.entries(hiddenFields ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {isEdit && <input type="hidden" name="statusWas" value={current.status} />}
      <input type="hidden" name="alternateDates" value={JSON.stringify(alternates.filter((a) => a.startDate || a.endDate))} />

      <fieldset disabled={!canWrite} className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Title *" htmlFor="rfp-title" wide>
            <input id="rfp-title" name="title" required defaultValue={values.title} className={inputClass} />
          </Field>
          {kind === "OTHER" && (
            <Field label="Service" htmlFor="rfp-service">
              <OptionSelect id="rfp-service" name="service" defaultValue={values.service} options={choices.services ?? []} blankValue={BLANK} className={inputClass} />
            </Field>
          )}
          {isEdit && (
            <Field label="Status" htmlFor="rfp-status">
              {/* Follows the saved status (Issue changes it outside the form). */}
              <select key={current.status} id="rfp-status" name="status" defaultValue={current.status} className={inputClass}>
                {(Object.keys(RFP_STATUS_LABELS) as RfpStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {RFP_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Contact" htmlFor="rfp-contactId">
            <select id="rfp-contactId" name="contactId" defaultValue={values.contactId ?? BLANK} className={inputClass}>
              <option value={BLANK}>None</option>
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
          <legend className={legendClass}>{hotel ? "Dates & rooms" : "Dates"}</legend>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label={hotel ? "Arrival" : "Start"} htmlFor="rfp-arrivalDate">
              <input
                id="rfp-arrivalDate"
                type="date"
                name="arrivalDate"
                defaultValue={values.arrivalDate ?? ""}
                onChange={(e) => syncRangeEnd(e.currentTarget, "departureDate", { gapDays: stayGap })}
                className={inputClass}
              />
            </Field>
            <Field label={hotel ? "Departure" : "End"} htmlFor="rfp-departureDate">
              <input
                id="rfp-departureDate"
                type="date"
                name="departureDate"
                min={rangeEndMin(values.arrivalDate, stayGap)}
                defaultValue={values.departureDate ?? ""}
                className={inputClass}
              />
            </Field>
            {hotel && (
              <Field label="Peak rooms" htmlFor="rfp-peakRooms">
                <input id="rfp-peakRooms" type="number" min={0} name="peakRooms" defaultValue={values.peakRooms ?? ""} className={inputClass} />
              </Field>
            )}
          </div>
          <label className={checkLabel}>
            <input type="checkbox" name="datesFlexible" value="true" defaultChecked={values.datesFlexible} className={checkClass} />
            Dates flexible
          </label>
          {hotel && (
            <label className={checkLabel}>
              <input type="checkbox" name="multiProperty" value="true" defaultChecked={values.multiProperty} className={checkClass} />
              Several properties
            </label>
          )}
          {alternates.map((a, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <label className={labelClass}>
                {hotel ? "Alternate arrival" : "Alternate start"}
                <DateInput
                  value={a.startDate}
                  onChange={(v) => setAlternate(i, { startDate: v, endDate: rangeEndFor(v, a.endDate, stayGap) })}
                  className={inputClass}
                />
              </label>
              <label className={labelClass}>
                {hotel ? "Departure" : "End"}
                <DateInput value={a.endDate} min={rangeEndMin(a.startDate, stayGap)} onChange={(v) => setAlternate(i, { endDate: v })} className={inputClass} />
              </label>
              <button
                type="button"
                onClick={() => {
                  setAlternates((prev) => prev.filter((_, j) => j !== i));
                  bump();
                }}
                className="pb-2 text-sm text-red-600 dark:text-red-400 hover:underline"
              >
                Remove
              </button>
            </div>
          ))}
          {canWrite && alternates.length < MAX_ALTERNATES && (
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
              <input type="hidden" name="decisionMakerId" value={decider === OTHER ? BLANK : decider} />
              <select id="rfp-decisionMakerId" value={decider} onChange={(e) => setDecider(e.target.value)} className={inputClass}>
                <option value={BLANK}>Not set</option>
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

        {hotel && (choices.regions.length > 0 || choices.areas.length > 0) && (
          <div>
            <p className={labelClass}>Hotel areas</p>
            <div className="mt-1">
              <AreaChecklist regions={choices.regions} areas={choices.areas} value={{ regions: values.regions, areas: values.areas }} />
            </div>
            {!isEmptyScope(values.eventScope) && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Event: {scopeLabels(values.eventScope).join(", ")}</p>}
          </div>
        )}

        {/* A part's fields stay mounted while it's off, so they keep their values. */}
        <label className={`${checkLabel} ${sections.has("history") ? "" : "hidden"}`}>
          <input type="checkbox" name="historyMatching" value="true" defaultChecked={values.historyMatching} className={checkClass} />
          Event history: only blocks matching this RFP&apos;s contract and guest types
        </label>

        <fieldset className={`space-y-3 ${sections.has("blocks") ? "" : "hidden"}`}>
          <legend className={legendClass}>Guest rooms</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Reservations" htmlFor="rfp-reservationMethod">
              <OptionSelect id="rfp-reservationMethod" name="reservationMethod" defaultValue={values.reservationMethod} options={choices.reservationMethods} blankValue={BLANK} className={inputClass} />
            </Field>
            <Field label="Rebates / commissions" htmlFor="rfp-commissionNotes">
              <input id="rfp-commissionNotes" name="commissionNotes" defaultValue={values.commissionNotes ?? ""} className={inputClass} />
            </Field>
          </div>
        </fieldset>

        {hotel && choices.amenities.length > 0 && (
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

        <fieldset className={`space-y-3 ${sections.has("fb") ? "" : "hidden"}`}>
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

        <div>
          <p className={labelClass}>Statement of need</p>
          <div className="mt-1">
            <RichText name="introduction" html={values.introduction} editable={canWrite} onChange={isEdit ? bump : undefined} />
          </div>
        </div>
        <div className={sections.has("requirements") ? "" : "hidden"}>
          <p className={labelClass}>Other requirements</p>
          <div className="mt-1">
            <RichText name="requirements" html={values.requirements} editable={canWrite} onChange={isEdit ? bump : undefined} />
          </div>
        </div>
      </fieldset>

      {!isEdit && (
        <div className="flex flex-wrap gap-3">
          <SaveButton label="Create RFP" />
          <Link href={cancelHref!} className={btnSecondary}>
            Cancel
          </Link>
        </div>
      )}
    </form>
  );
}
