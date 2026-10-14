"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import { PROVIDED_BY_LABELS } from "@/lib/esg/apex";
import { formatDateOnly, formatDayDateTime, isBlankText } from "@/lib/esg/format";
import type { EsgFieldDef } from "@/lib/esg/fields";
import type { InheritedValue } from "@/lib/esg/narrativeData";
import { SpecFieldInput, type SpecChoices, type SpecValue } from "./SpecFieldInput";

const INHERITED_HINT: Record<InheritedValue["source"], string> = {
  organization: "Blank uses the organization's details.",
  functions: "Blank lists the event's functions.",
};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${btnPrimary} text-sm disabled:opacity-50`}>
      {pending ? "Saving..." : "Save"}
    </button>
  );
}

function displayValue(field: EsgFieldDef, value: SpecValue, timezone: string, choices: SpecChoices): string | null {
  if (value === null || value === "") return null;
  switch (field.kind) {
    case "bool":
      return value ? "Yes" : "No";
    case "date":
      return formatDateOnly(`${value}T00:00:00Z`);
    case "datetime":
      return formatDayDateTime(new Date(value as string), timezone);
    case "providedBy":
      return PROVIDED_BY_LABELS[value as keyof typeof PROVIDED_BY_LABELS] ?? String(value);
    case "vendor":
      return choices.vendors.find((v) => v.id === value)?.label ?? "(vendor removed from event)";
    case "contact":
      return choices.contacts.find((c) => c.id === value)?.label ?? "(not on key staff)";
    case "function":
      return choices.functions.find((f) => f.id === value)?.label ?? "(function removed)";
    default:
      return String(value);
  }
}

function FieldView({
  field,
  value,
  inherited,
  timezone,
  choices,
}: {
  field: EsgFieldDef;
  value: SpecValue;
  inherited: InheritedValue["source"] | undefined;
  timezone: string;
  choices: SpecChoices;
}) {
  const empty = isEmpty(field, value);
  return (
    <div className={field.wide ? "sm:col-span-2" : ""}>
      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
        {field.label}
        {field.required && <span className="text-red-500 dark:text-red-400"> *</span>}
        {inherited && <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">from {inherited}</span>}
      </dt>
      {empty ? (
        <dd className="mt-1 text-sm text-gray-400 dark:text-gray-500">—</dd>
      ) : field.kind === "richtext" ? (
        // HTML from RichTextEditor (tiptap) — see SpecFieldInput.
        <dd
          className="mt-1 text-sm text-gray-900 dark:text-white [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-1"
          dangerouslySetInnerHTML={{ __html: value as string }}
        />
      ) : (
        <dd className="mt-1 text-sm text-gray-900 dark:text-white whitespace-pre-wrap">
          {displayValue(field, value, timezone, choices)}
        </dd>
      )}
    </div>
  );
}

function isEmpty(field: EsgFieldDef, value: SpecValue): boolean {
  return field.kind === "richtext" ? isBlankText(value) : value === null || value === "";
}

// View mode lists filled and required fields; empty optional ones collapse to
// one line so a mostly-blank section stays short.
function ViewFields({
  fields,
  values: stored,
  inherited,
  timezone,
  choices,
}: {
  fields: EsgFieldDef[];
  values: Record<string, SpecValue>;
  inherited: Record<string, InheritedValue>;
  timezone: string;
  choices: SpecChoices;
}) {
  const values: Record<string, SpecValue> = { ...stored };
  for (const [k, v] of Object.entries(inherited)) values[k] = v.value;
  const shown = fields.filter((f) => f.required || !isEmpty(f, values[f.key] ?? null));
  const blank = fields.filter((f) => !f.required && isEmpty(f, values[f.key] ?? null));
  return (
    <div className="space-y-3">
      {shown.length > 0 && (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {shown.map((f) => (
            <FieldView
              key={f.key}
              field={f}
              value={values[f.key] ?? null}
              inherited={inherited[f.key]?.source}
              timezone={timezone}
              choices={choices}
            />
          ))}
        </dl>
      )}
      {blank.length > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Not filled in: {blank.map((f) => f.label).join(" · ")}
        </p>
      )}
    </div>
  );
}

export function SpecSectionCard({
  letter,
  title,
  fields,
  values,
  inherited = {},
  timezone,
  choices,
  na,
  missingCount,
  derived,
  grids,
  saveAction,
  setNa,
}: {
  letter: string;
  title: string;
  fields: EsgFieldDef[];
  values: Record<string, SpecValue>;
  // Values the organization profile supplies for fields this event leaves blank.
  inherited?: Record<string, InheritedValue>;
  timezone: string;
  choices: SpecChoices;
  na: boolean;
  missingCount: number;
  derived?: ReactNode;
  grids?: ReactNode;
  saveAction: (formData: FormData) => Promise<void>;
  setNa?: (na: boolean) => Promise<void>;
}) {
  const canWrite = useCanWrite("EVENTS");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const anchor = `spec-${letter.toLowerCase()}`;

  const toggleNa = () =>
    startTransition(async () => {
      await setNa?.(!na);
      router.refresh();
    });

  return (
    <section
      id={anchor}
      className="scroll-mt-24 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">
          {letter !== "header" && <span className="text-gray-400 dark:text-gray-500 mr-2">{letter}.</span>}
          {title}
          {!na && missingCount > 0 && (
            <span className="ml-2 align-middle text-xs font-normal px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
              {missingCount} required
            </span>
          )}
          {na && (
            <span className="ml-2 align-middle text-xs font-normal px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
              N/A
            </span>
          )}
        </h2>
        {canWrite && !editing && (
          <div className="flex items-center gap-3 text-sm">
            {setNa && (
              <button
                type="button"
                onClick={toggleNa}
                disabled={pending}
                className="text-gray-500 dark:text-gray-400 hover:underline disabled:opacity-50"
              >
                {na ? "Mark applicable" : "Not applicable"}
              </button>
            )}
            {!na && fields.length > 0 && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                {letter === "header" ? "Edit dates" : `Edit section ${letter}`}
              </button>
            )}
          </div>
        )}
      </div>

      {na ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Marked not applicable for this event.</p>
      ) : (
        <div className="space-y-6">
          {derived && (
            <div className="rounded-md border border-dashed border-gray-300 dark:border-gray-600 p-3 sm:p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                From the event
              </p>
              {derived}
            </div>
          )}
          {fields.length > 0 && (
            <div>
              {derived && (
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Section {letter} fields
                </p>
              )}
              {editing && canWrite ? (
                <form
                  action={async (formData) => {
                    await saveAction(formData);
                    setEditing(false);
                  }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {fields.map((f) => (
                      <div key={f.key} className={f.wide ? "sm:col-span-2" : ""}>
                        <label htmlFor={`${anchor}-${f.key}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          {f.label}
                          {f.required && <span className="text-red-500 dark:text-red-400"> *</span>}
                        </label>
                        <SpecFieldInput
                          id={`${anchor}-${f.key}`}
                          name={f.key}
                          kind={f.kind}
                          value={values[f.key] ?? null}
                          timezone={timezone}
                          choices={choices}
                          optionCategory={f.optionCategory}
                          placeholder={inherited[f.key]?.value}
                        />
                        {f.hint && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{f.hint}</p>}
                        {inherited[f.key] && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {INHERITED_HINT[inherited[f.key].source]}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-3">
                    <SaveButton />
                    <button type="button" onClick={() => setEditing(false)} className={`${btnSecondary} text-sm`}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <ViewFields fields={fields} values={values} inherited={inherited} timezone={timezone} choices={choices} />
              )}
            </div>
          )}
          {grids}
        </div>
      )}
    </section>
  );
}
