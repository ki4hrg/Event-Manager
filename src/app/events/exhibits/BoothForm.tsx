"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import type { ExhibitBooth, ExhibitBoothGroup } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import { BOOTH_SHARED_KEYS, withGroupDefaults, type BoothShared, type BoothSharedKey } from "@/lib/boothGroups";
import { PROVIDED_BY_LABELS } from "@/lib/esg/apex";
import { formatDayDateTime, toDateTimeLocal } from "@/lib/esg/format";
import { syncRangeEnd } from "@/lib/dateRange";

// One form for a booth and for a booth group: the group edits the shared
// settings; a booth adds its own identity and may override any shared one
// (blank = the group's).
type Choice = { id: string; label: string };
type Group = Pick<ExhibitBoothGroup, "id" | "name"> & BoothShared;

type CommonProps = {
  timezone: string;
  functions: Choice[];
  boothTypes: string[];
  action: (formData: FormData) => Promise<void>;
  cancelHref: string;
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

function Fieldset({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="text-sm font-semibold text-gray-900 dark:text-white">{title}</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </fieldset>
  );
}

function Field({ label, name, wide, hint, children }: { label: string; name: string; wide?: boolean; hint?: string | null; children: ReactNode }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <label htmlFor={`booth-${name}`} className={labelClass}>
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function Select({
  name,
  value,
  items,
  emptyLabel = "Not set",
}: {
  name: string;
  value: string | null | undefined;
  items: { value: string; label: string }[];
  emptyLabel?: string;
}) {
  return (
    <select id={`booth-${name}`} name={name} defaultValue={value ?? ""} className={inputClass}>
      <option value="">{emptyLabel}</option>
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

function providedLabel(v: string | null) {
  if (!v) return null;
  return v === "GROUP" ? "Booth to provide" : PROVIDED_BY_LABELS[v as keyof typeof PROVIDED_BY_LABELS];
}

// Display string for a shared value.
function sharedDisplay(key: BoothSharedKey, v: BoothShared[BoothSharedKey], timezone: string, functions: Choice[]): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return formatDayDateTime(v, timezone);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (key === "functionId") return functions.find((f) => f.id === v)?.label ?? null;
  if (key === "avProvider" || key === "electricalProvider") return providedLabel(v);
  return String(v);
}

type Row = { label: string; key?: BoothSharedKey; value: string | null };

function SharedRows(timezone: string, functions: Choice[], s: BoothShared): Row[][] {
  const r = (key: BoothSharedKey, label: string): Row => ({ key, label, value: sharedDisplay(key, s[key], timezone, functions) });
  return [
    [
      r("functionId", "Exhibit function"),
      r("boothType", "Booth type"),
      r("location", "Booth location"),
      r("startAt", "Booth start"),
      r("endAt", "Booth end"),
      r("setupBy", "Set up by"),
      r("teardownBy", "Tear down no later than"),
    ],
    [
      r("specialRequirements", "Special requirements"),
      r("setupNotes", "Booth set-up comments"),
      r("avProvider", "A/V"),
      r("avNotes", "A/V comments"),
      r("fbNotes", "Food & beverage"),
      r("decorNotes", "Décor"),
      r("securityNotes", "Security"),
      r("signageNotes", "Signage"),
      r("shippingRequired", "Shipping / receiving required"),
      r("customsRequired", "Customs / brokerage"),
      r("materialHandlingNotes", "Material handling"),
      r("electricalProvider", "Electrical"),
      r("electricalNotes", "Electrical notes"),
      r("utilitiesNotes", "Other utilities"),
      r("taxExempt", "Tax-exempt"),
      r("taxExemptId", "Tax-exempt ID #"),
      r("costCenter", "Cost center"),
      r("billingNotes", "Billing instructions"),
    ],
  ];
}

function View({ groups, fromGroup }: { groups: Row[][]; fromGroup?: Set<string> }) {
  return (
    <div className="space-y-4">
      {groups.map((group, i) => {
        const filled = group.filter((r) => r.value);
        const empty = group.filter((r) => !r.value);
        return (
          <div key={i} className="space-y-2">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filled.map((r) => (
                <div key={r.label}>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                    {r.label}
                    {r.key && fromGroup?.has(r.key) && (
                      <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">from group</span>
                    )}
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900 dark:text-white whitespace-pre-wrap">{r.value}</dd>
                </div>
              ))}
            </dl>
            {empty.length > 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500">Not filled in: {empty.map((r) => r.label).join(" · ")}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Inputs for the shared settings. `fallback` is the group a booth inherits
// from: its values show as placeholders / empty-option labels.
function SharedFields({
  record,
  fallback,
  timezone,
  functions,
  boothTypes,
  defaultFunctionId,
}: {
  record: BoothShared | null | undefined;
  fallback: BoothShared | null;
  timezone: string;
  functions: Choice[];
  boothTypes: string[];
  defaultFunctionId?: string;
}) {
  const inherited = (key: BoothSharedKey) => (fallback ? sharedDisplay(key, fallback[key], timezone, functions) : null);
  const emptyLabel = (key: BoothSharedKey) => {
    const v = inherited(key);
    return v ? `Group: ${v}` : "Not set";
  };
  const text = (name: BoothSharedKey, label: string, wide = false, multiline = false) => {
    const props = {
      id: `booth-${name}`,
      name,
      defaultValue: (record?.[name] as string | null) ?? "",
      placeholder: inherited(name) ?? undefined,
      className: inputClass,
    };
    return (
      <Field label={label} name={name} wide={wide}>
        {multiline ? <textarea rows={2} {...props} /> : <input {...props} />}
      </Field>
    );
  };
  // `range` pairs a start with its end. An empty end inherits the group's, so it isn't filled.
  const datetime = (name: BoothSharedKey, label: string, range?: { end: BoothSharedKey } | { start: BoothSharedKey }) => {
    const v = inherited(name);
    return (
      <Field label={label} name={name} hint={v ? `Group: ${v}` : null}>
        <input
          id={`booth-${name}`}
          type="datetime-local"
          name={name}
          defaultValue={toDateTimeLocal(record?.[name] as Date | null, timezone)}
          min={range && "start" in range ? toDateTimeLocal(record?.[range.start] as Date | null, timezone) || undefined : undefined}
          onChange={range && "end" in range ? (e) => syncRangeEnd(e.currentTarget, range.end, { fillEmpty: false, keepDuration: true }) : undefined}
          className={inputClass}
        />
      </Field>
    );
  };
  const select = (name: BoothSharedKey, label: string, items: { value: string; label: string }[], value: string | null | undefined, wide = false) => (
    <Field label={label} name={name} wide={wide}>
      <Select name={name} value={value} items={items} emptyLabel={emptyLabel(name)} />
    </Field>
  );

  return (
    <>
      <Fieldset title="Placement">
        {select(
          "functionId",
          "Exhibit function",
          functions.map((f) => ({ value: f.id, label: f.label })),
          record ? record.functionId : (defaultFunctionId ?? null),
          true,
        )}
        {select("boothType", "Booth type", boothTypes.map((t) => ({ value: t, label: t })), record?.boothType)}
        {text("location", "Booth location")}
      </Fieldset>
      <Fieldset title="Times">
        {datetime("startAt", "Booth start", { end: "endAt" })}
        {datetime("endAt", "Booth end", { start: "startAt" })}
        {datetime("setupBy", "Set up by")}
        {datetime("teardownBy", "Tear down no later than")}
      </Fieldset>
      <Fieldset title="Booth set-up">
        {text("specialRequirements", "Special requirements (e.g. double-decker, floor load)", true, true)}
        {text("setupNotes", "Booth set-up comments", true, true)}
      </Fieldset>
      <Fieldset title="Services">
        {select("avProvider", "A/V", providedBy, record?.avProvider)}
        {text("avNotes", "A/V comments", false, true)}
        {text("fbNotes", "Food & beverage", false, true)}
        {text("decorNotes", "Décor", false, true)}
        {text("securityNotes", "Security", false, true)}
        {text("signageNotes", "Signage", false, true)}
      </Fieldset>
      <Fieldset title="Material handling">
        {select("shippingRequired", "Shipping / receiving required", yesNo, boolValue(record?.shippingRequired))}
        {select("customsRequired", "Customs / brokerage", yesNo, boolValue(record?.customsRequired))}
        {text("materialHandlingNotes", "Carriers & handling instructions", true, true)}
      </Fieldset>
      <Fieldset title="Utilities">
        {select("electricalProvider", "Electrical connections", providedBy, record?.electricalProvider)}
        {text("electricalNotes", "Electrical notes", false, true)}
        {text("utilitiesNotes", "Telecommunications, cleaning and other utilities", true, true)}
      </Fieldset>
      <Fieldset title="Billing">
        {select("taxExempt", "Tax-exempt", yesNo, boolValue(record?.taxExempt))}
        {text("taxExemptId", "Tax-exempt ID #")}
        {text("costCenter", "Cost center")}
        {text("billingNotes", "Billing instructions", true, true)}
      </Fieldset>
    </>
  );
}

function Shell({
  title,
  editing,
  setEditing,
  canWrite,
  view,
  children,
}: {
  title: string;
  editing: boolean;
  setEditing: (v: boolean) => void;
  canWrite: boolean;
  view: ReactNode;
  children: ReactNode;
}) {
  if (!editing || !canWrite) {
    return (
      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">{title}</h2>
          {canWrite && (
            <button onClick={() => setEditing(true)} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
              Edit
            </button>
          )}
        </div>
        {view}
      </div>
    );
  }
  return <>{children}</>;
}

function Buttons({ isEdit, saveLabel, cancelHref, onCancel }: { isEdit: boolean; saveLabel: string; cancelHref: string; onCancel: () => void }) {
  return (
    <div className="flex flex-wrap gap-3">
      <SaveButton label={isEdit ? "Save" : saveLabel} />
      {isEdit ? (
        <button type="button" onClick={onCancel} className={btnSecondary}>
          Cancel
        </button>
      ) : (
        <Link href={cancelHref} className={btnSecondary}>
          Cancel
        </Link>
      )}
    </div>
  );
}

export function BoothForm({
  booth,
  groups,
  contacts,
  defaultFunctionId,
  defaultGroupId,
  timezone,
  functions,
  boothTypes,
  action,
  cancelHref,
}: CommonProps & {
  booth?: ExhibitBooth | null;
  groups: Group[];
  contacts: Choice[];
  defaultFunctionId?: string;
  defaultGroupId?: string;
}) {
  const isEdit = !!booth;
  const canWrite = useCanWrite("FUNCTIONS");
  const [editing, setEditing] = useState(!isEdit);
  const [groupId, setGroupId] = useState(booth ? (booth.groupId ?? "") : (defaultGroupId ?? ""));
  const group = groups.find((g) => g.id === groupId) ?? null;

  const view = () => {
    if (!booth) return null;
    const savedGroup = groups.find((g) => g.id === booth.groupId) ?? null;
    const effective = withGroupDefaults(booth, savedGroup);
    const fromGroup = new Set<string>(BOOTH_SHARED_KEYS.filter((k) => booth[k] === null && effective[k] !== null));
    const identity: Row[] = [
      { label: "Group", value: savedGroup?.name ?? null },
      { label: "Booth #", value: booth.boothNumber },
      { label: "Company", value: booth.companyName },
      { label: "Key contact", value: contacts.find((c) => c.id === booth.contactId)?.label ?? null },
    ];
    const [placement, rest] = SharedRows(timezone, functions, effective);
    return <View groups={[[...identity, ...placement], rest]} fromGroup={fromGroup} />;
  };

  return (
    <Shell title="Details" editing={editing} setEditing={setEditing} canWrite={canWrite} view={view()}>
      <form
        action={async (formData) => {
          await action(formData);
          if (isEdit) setEditing(false);
        }}
        className={`${cardClass} space-y-6`}
      >
        <Fieldset title="Booth">
          <Field label="Booth name *" name="name">
            <input id="booth-name" name="name" required defaultValue={booth?.name ?? ""} className={inputClass} />
          </Field>
          <Field label="Group" name="groupId">
            <select
              id="booth-groupId"
              name="groupId"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className={inputClass}
            >
              <option value="">None</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Booth #" name="boothNumber">
            <input id="booth-boothNumber" name="boothNumber" defaultValue={booth?.boothNumber ?? ""} className={inputClass} />
          </Field>
          <Field label="Company name" name="companyName">
            <input id="booth-companyName" name="companyName" defaultValue={booth?.companyName ?? ""} className={inputClass} />
          </Field>
          <Field label="Key contact" name="contactId" wide>
            <Select name="contactId" value={booth?.contactId} items={contacts.map((c) => ({ value: c.id, label: c.label }))} />
          </Field>
        </Fieldset>
        {/* Keyed on the group so placeholders follow a group change. */}
        <SharedFields
          key={groupId}
          record={booth}
          fallback={group}
          timezone={timezone}
          functions={functions}
          boothTypes={boothTypes}
          defaultFunctionId={group ? undefined : defaultFunctionId}
        />
        <Buttons isEdit={isEdit} saveLabel="Create Booth" cancelHref={cancelHref} onCancel={() => setEditing(false)} />
      </form>
    </Shell>
  );
}

export function BoothGroupForm({
  group,
  timezone,
  functions,
  boothTypes,
  defaultFunctionId,
  action,
  cancelHref,
}: CommonProps & { group?: Group | null; defaultFunctionId?: string }) {
  const isEdit = !!group;
  const canWrite = useCanWrite("FUNCTIONS");
  const [editing, setEditing] = useState(!isEdit);

  return (
    <Shell
      title="Shared settings"
      editing={editing}
      setEditing={setEditing}
      canWrite={canWrite}
      view={group ? <View groups={SharedRows(timezone, functions, group)} /> : null}
    >
      <form
        action={async (formData) => {
          await action(formData);
          if (isEdit) setEditing(false);
        }}
        className={`${cardClass} space-y-6`}
      >
        <Fieldset title="Group">
          <Field label="Group name *" name="name" wide>
            <input id="booth-name" name="name" required defaultValue={group?.name ?? ""} placeholder="e.g. Standard 10x10" className={inputClass} />
          </Field>
        </Fieldset>
        <SharedFields
          record={group}
          fallback={null}
          timezone={timezone}
          functions={functions}
          boothTypes={boothTypes}
          defaultFunctionId={defaultFunctionId}
        />
        <Buttons isEdit={isEdit} saveLabel="Create Group" cancelHref={cancelHref} onCancel={() => setEditing(false)} />
      </form>
    </Shell>
  );
}
