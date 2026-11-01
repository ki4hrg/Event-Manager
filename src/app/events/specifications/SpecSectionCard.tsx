"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useCanWrite } from "@/components/PermissionsProvider";
import { AutosaveStatus } from "@/components/AutosaveStatus";
import { useAutosave } from "@/lib/useAutosave";
import type { UserError } from "@/lib/userErrors";
import type { EsgFieldDef } from "@/lib/esg/fields";
import type { InheritedValue } from "@/lib/esg/narrativeData";
import { SpecFieldInput, type SpecChoices, type SpecValue } from "./SpecFieldInput";

// One section of the ESG / PER entry page. Its fields autosave; marking the
// section N/A collapses it but keeps what was entered.
export function SpecSectionCard({
  letter,
  title,
  fields,
  values: current,
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
  // Must not redirect: the card autosaves through it.
  saveAction: (formData: FormData) => Promise<void | UserError>;
  setNa?: (na: boolean) => Promise<void>;
}) {
  const canWrite = useCanWrite("EVENTS");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const anchor = `spec-${letter.toLowerCase()}`;

  // The form is uncontrolled and autosaves, so it keeps the values it mounted
  // with; the refreshed ones after each save would only reset it.
  const [values] = useState(current);
  // Each change bumps the version; the payload is read after the render that
  // follows (so the editors' hidden inputs are current) and kept for a save
  // that runs after the card unmounts.
  const formRef = useRef<HTMLFormElement>(null);
  const payload = useRef<FormData | null>(null);
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  useEffect(() => {
    if (formRef.current) payload.current = new FormData(formRef.current);
  });
  const status = useAutosave(version, async () => {
    if (payload.current) return saveAction(payload.current);
  });

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
      <div className={`flex flex-wrap items-center justify-between gap-2 ${na ? "" : "mb-4"}`}>
        <h2 className={`text-lg font-medium ${na ? "text-gray-400 dark:text-gray-500" : "text-gray-900 dark:text-white"}`}>
          {letter !== "header" && <span className="text-gray-400 dark:text-gray-500 mr-2">{letter}.</span>}
          {title}
          {!na && missingCount > 0 && (
            <span className="ml-2 align-middle text-xs font-normal px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
              {missingCount} required
            </span>
          )}
        </h2>
        <div className="flex items-center gap-3">
          {fields.length > 0 && <AutosaveStatus {...status} />}
          {setNa && (
            <label
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm ${
                na
                  ? "border-gray-400 dark:border-gray-500 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                  : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300"
              } ${canWrite ? "cursor-pointer" : ""}`}
            >
              <input
                type="checkbox"
                checked={na}
                onChange={toggleNa}
                disabled={!canWrite || pending}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              N/A
            </label>
          )}
        </div>
      </div>

      <div className={na ? "hidden" : "space-y-6"}>
        {derived && (
          <div className="rounded-md border border-dashed border-gray-300 dark:border-gray-600 p-3 sm:p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">From the event</p>
            {derived}
          </div>
        )}
        {fields.length > 0 && (
          <form ref={formRef} onChange={canWrite ? bump : undefined} onSubmit={(e) => e.preventDefault()}>
            <fieldset disabled={!canWrite} className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
              {fields.map((f) => (
                <div key={f.key} className={`min-w-0 ${f.wide ? "sm:col-span-2" : ""}`}>
                  <label htmlFor={`${anchor}-${f.key}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {f.label}
                    {f.required && <span className="text-red-500 dark:text-red-400"> *</span>}
                    {inherited[f.key] && (
                      <span className="ml-2 text-xs font-normal text-gray-400 dark:text-gray-500">
                        default from {inherited[f.key].source}
                      </span>
                    )}
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
                    onRichTextChange={canWrite ? bump : undefined}
                    readOnly={!canWrite}
                    rangeEndName={f.endKey}
                    rangeStart={values[fields.find((s) => s.endKey === f.key)?.key ?? ""]}
                  />
                  {f.hint && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{f.hint}</p>}
                </div>
              ))}
            </fieldset>
          </form>
        )}
        {grids}
      </div>
    </section>
  );
}
