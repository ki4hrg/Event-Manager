"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import type { ExhibitBooth } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import { PROVIDED_BY_LABELS } from "@/lib/esg/apex";
import { formatDayDateTime, toDateTimeLocal } from "@/lib/esg/format";

// ESG Part IIIb "Function Set-up Order (Exhibitor Version)", one per booth.
type Choice = { id: string; label: string };

type BoothFormProps = {
  booth?: ExhibitBooth | null;
  timezone: string;
  functions: Choice[];
  contacts: Choice[];
  boothTypes: string[];
  defaultFunctionId?: string;
  action: (formData: FormData) => Promise<void>;
  cancelHref: string;
};

const inputClass =
  "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm";
const labelClass = "block text-sm font-medium text-gray-700 dark:text-gray-300";

function SaveButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${btnPrimary} disabled:opacity-50`}>
      {pending ? "Saving..." : isEdit ? "Save" : "Create Booth"}
    </button>
  );
}

function Fieldset({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="text-sm font-semibold text-gray-900 dark:text-white">{title}</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </fieldset>
  );
}

function Field({ label, name, wide, children }: { label: string; name: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <label htmlFor={`booth-${name}`} className={labelClass}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Select({
  name,
  value,
  items,
}: {
  name: string;
  value: string | null | undefined;
  items: { value: string; label: string }[];
}) {
  return (
    <select id={`booth-${name}`} name={name} defaultValue={value ?? ""} className={inputClass}>
      <option value="">Not set</option>
      {value && !items.some((i) => i.value === value) && <option value={value}>{value}</option>}
      {items.map((i) => (
        <option key={i.value} value={i.value}>
          {i.label}
        </option>
      ))}
    </select>
  );
}

const yesNo = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];
const providedBy = Object.entries(PROVIDED_BY_LABELS).map(([value, label]) => ({
  value,
  label: value === "GROUP" ? "Booth to provide" : label,
}));

function boolValue(v: boolean | null | undefined) {
  return v === null || v === undefined ? null : String(v);
}

function View({ booth, timezone, functions, contacts }: { booth: ExhibitBooth; timezone: string; functions: Choice[]; contacts: Choice[] }) {
  const rows: [string, string | null][][] = [
    [
      ["Booth #", booth.boothNumber],
      ["Booth type", booth.boothType],
      ["Booth location", booth.location],
      ["Company", booth.companyName],
      ["Key contact for booth", contacts.find((c) => c.id === booth.contactId)?.label ?? null],
      ["Exhibit function", functions.find((f) => f.id === booth.functionId)?.label ?? null],
      ["Booth start", booth.startAt ? formatDayDateTime(booth.startAt, timezone) : null],
      ["Booth end", booth.endAt ? formatDayDateTime(booth.endAt, timezone) : null],
      ["Set up by", booth.setupBy ? formatDayDateTime(booth.setupBy, timezone) : null],
      ["Tear down no later than", booth.teardownBy ? formatDayDateTime(booth.teardownBy, timezone) : null],
    ],
    [
      ["Special requirements", booth.specialRequirements],
      ["Booth set-up comments", booth.setupNotes],
      ["A/V", booth.avProvider ? (booth.avProvider === "GROUP" ? "Booth to provide" : PROVIDED_BY_LABELS[booth.avProvider]) : null],
      ["A/V comments", booth.avNotes],
      ["Food & beverage", booth.fbNotes],
      ["Décor", booth.decorNotes],
      ["Security", booth.securityNotes],
      ["Signage", booth.signageNotes],
      ["Shipping / receiving required", booth.shippingRequired === null ? null : booth.shippingRequired ? "Yes" : "No"],
      ["Customs / brokerage", booth.customsRequired === null ? null : booth.customsRequired ? "Yes" : "No"],
      ["Material handling", booth.materialHandlingNotes],
      ["Electrical", booth.electricalProvider ? (booth.electricalProvider === "GROUP" ? "Booth to provide" : PROVIDED_BY_LABELS[booth.electricalProvider]) : null],
      ["Electrical notes", booth.electricalNotes],
      ["Other utilities", booth.utilitiesNotes],
      ["Booth is tax-exempt", booth.taxExempt === null ? null : booth.taxExempt ? `Yes${booth.taxExemptId ? ` (${booth.taxExemptId})` : ""}` : "No"],
      ["Booth cost center", booth.costCenter],
      ["Billing instructions", booth.billingNotes],
    ],
  ];
  return (
    <div className="space-y-4">
      {rows.map((group, i) => {
        const filled = group.filter(([, v]) => v);
        const empty = group.filter(([, v]) => !v);
        return (
          <div key={i} className="space-y-2">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filled.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white whitespace-pre-wrap">{value}</dd>
                </div>
              ))}
            </dl>
            {empty.length > 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500">Not filled in: {empty.map(([l]) => l).join(" · ")}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function BoothForm({ booth, timezone, functions, contacts, boothTypes, defaultFunctionId, action, cancelHref }: BoothFormProps) {
  const isEdit = !!booth;
  const canWrite = useCanWrite("FUNCTIONS");
  const [editing, setEditing] = useState(!isEdit);
  const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6";

  if (isEdit && (!editing || !canWrite)) {
    return (
      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Booth Set-up Order</h2>
          {canWrite && (
            <button onClick={() => setEditing(true)} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
              Edit
            </button>
          )}
        </div>
        <View booth={booth} timezone={timezone} functions={functions} contacts={contacts} />
      </div>
    );
  }

  const text = (name: keyof ExhibitBooth, label: string, wide = false, multiline = false) => (
    <Field label={label} name={name} wide={wide}>
      {multiline ? (
        <textarea id={`booth-${name}`} name={name} rows={2} defaultValue={(booth?.[name] as string) ?? ""} className={inputClass} />
      ) : (
        <input id={`booth-${name}`} name={name} defaultValue={(booth?.[name] as string) ?? ""} className={inputClass} />
      )}
    </Field>
  );
  const datetime = (name: keyof ExhibitBooth, label: string) => (
    <Field label={label} name={name}>
      <input
        id={`booth-${name}`}
        type="datetime-local"
        name={name}
        defaultValue={toDateTimeLocal(booth?.[name] as Date | null, timezone)}
        className={inputClass}
      />
    </Field>
  );

  return (
    <form
      action={async (formData) => {
        await action(formData);
        if (isEdit) setEditing(false);
      }}
      className={`${cardClass} space-y-6`}
    >
      <Fieldset title="Booth details">
        <Field label="Booth name *" name="name">
          <input id="booth-name" name="name" required defaultValue={booth?.name ?? ""} className={inputClass} />
        </Field>
        {text("boothNumber", "Booth #")}
        <Field label="Booth type" name="boothType">
          <Select name="boothType" value={booth?.boothType} items={boothTypes.map((t) => ({ value: t, label: t }))} />
        </Field>
        {text("location", "Booth location")}
        {text("companyName", "Company name")}
        <Field label="Key contact for booth" name="contactId">
          <Select name="contactId" value={booth?.contactId} items={contacts.map((c) => ({ value: c.id, label: c.label }))} />
        </Field>
        <Field label="Exhibit function" name="functionId" wide>
          <Select
            name="functionId"
            value={booth?.functionId ?? defaultFunctionId ?? null}
            items={functions.map((f) => ({ value: f.id, label: f.label }))}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Empty times below follow this function&apos;s schedule.</p>
        </Field>
      </Fieldset>
      <Fieldset title="Times">
        {datetime("startAt", "Booth start")}
        {datetime("endAt", "Booth end")}
        {datetime("setupBy", "Set up by")}
        {datetime("teardownBy", "Tear down no later than")}
      </Fieldset>
      <Fieldset title="Booth set-up">
        {text("specialRequirements", "Special requirements (e.g. double-decker, floor load)", true, true)}
        {text("setupNotes", "Booth set-up comments", true, true)}
      </Fieldset>
      <Fieldset title="Services">
        <Field label="A/V" name="avProvider">
          <Select name="avProvider" value={booth?.avProvider} items={providedBy} />
        </Field>
        {text("avNotes", "A/V comments", false, true)}
        {text("fbNotes", "Food & beverage", false, true)}
        {text("decorNotes", "Décor (exhibitor appointed contractor, requests)", false, true)}
        {text("securityNotes", "Security", false, true)}
        {text("signageNotes", "Signage", false, true)}
      </Fieldset>
      <Fieldset title="Material handling">
        <Field label="Shipping / receiving required" name="shippingRequired">
          <Select name="shippingRequired" value={boolValue(booth?.shippingRequired)} items={yesNo} />
        </Field>
        <Field label="Customs / brokerage" name="customsRequired">
          <Select name="customsRequired" value={boolValue(booth?.customsRequired)} items={yesNo} />
        </Field>
        {text("materialHandlingNotes", "Shipping carriers & handling instructions (fragile, oversized…)", true, true)}
      </Fieldset>
      <Fieldset title="Utilities">
        <Field label="Electrical connections" name="electricalProvider">
          <Select name="electricalProvider" value={booth?.electricalProvider} items={providedBy} />
        </Field>
        {text("electricalNotes", "Electrical notes", false, true)}
        {text("utilitiesNotes", "Telecommunications, cleaning and other utilities", true, true)}
      </Fieldset>
      <Fieldset title="Billing">
        <Field label="Booth is tax-exempt" name="taxExempt">
          <Select name="taxExempt" value={boolValue(booth?.taxExempt)} items={yesNo} />
        </Field>
        {text("taxExemptId", "Tax-exempt ID #")}
        {text("costCenter", "Booth cost center")}
        {text("billingNotes", "Billing instructions (send final bill to, method of payment)", true, true)}
      </Fieldset>
      <div className="flex gap-3">
        <SaveButton isEdit={isEdit} />
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
