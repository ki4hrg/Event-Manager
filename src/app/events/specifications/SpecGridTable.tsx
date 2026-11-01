"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { useCanWrite } from "@/components/PermissionsProvider";
import { InlineDeleteButton } from "@/components/InlineDeleteButton";
import { AutosaveStatus } from "@/components/AutosaveStatus";
import { useAutosave } from "@/lib/useAutosave";
import { ActionForm, ActionFormError } from "@/components/FormError";
import type { UserError } from "@/lib/userErrors";
import { btnPrimary, btnSecondary, btnOutlinedSm } from "@/lib/buttonStyles";
import { COVERAGE_KINDS, DISTRIBUTION_ACTIONS, type SpecGridColumn } from "@/lib/esg/fields";
import { SpecFieldInput, specInputClass, type SpecChoices, type SpecValue } from "./SpecFieldInput";

export type SpecGridRow = { id: string; values: Record<string, SpecValue> };

function AddButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${btnPrimary} text-sm disabled:opacity-50`}>
      {pending ? "Adding…" : "Add"}
    </button>
  );
}

function RowFields({
  columns,
  values,
  timezone,
  choices,
}: {
  columns: SpecGridColumn[];
  values?: Record<string, SpecValue>;
  timezone: string;
  choices: SpecChoices;
}) {
  const formId = useId();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 min-w-0">
      {columns.map((c) => (
        <div key={c.key} className="min-w-0">
          <label htmlFor={`${formId}-${c.key}`} className="block text-xs font-medium text-gray-700 dark:text-gray-300">
            {c.label}
            {c.required && <span className="text-red-500 dark:text-red-400"> *</span>}
          </label>
          {c.key === "kind" || c.key === "action" ? (
            <select
              id={`${formId}-${c.key}`}
              name={c.key}
              required
              defaultValue={(values?.[c.key] as string) ?? ""}
              className={specInputClass}
            >
              <option value="">Choose…</option>
              {(c.key === "kind" ? COVERAGE_KINDS : DISTRIBUTION_ACTIONS).map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          ) : c.kind === "bool" ? (
            <label className="mt-2 flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                id={`${formId}-${c.key}`}
                type="checkbox"
                name={c.key}
                value="true"
                defaultChecked={values?.[c.key] === true}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              Yes
            </label>
          ) : (
            <SpecFieldInput
              id={`${formId}-${c.key}`}
              name={c.key}
              kind={c.kind}
              value={values?.[c.key] ?? null}
              timezone={timezone}
              choices={choices}
              rangeEndName={c.endKey}
              rangeStart={values?.[columns.find((s) => s.endKey === c.key)?.key ?? ""]}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// An existing row: autosaves on change. Keyed by row id, so it keeps the
// values it mounted with across the refresh each save triggers.
function RowEditor({
  row,
  columns,
  timezone,
  choices,
  canWrite,
  updateRow,
  deleteRow,
}: {
  row: SpecGridRow;
  columns: SpecGridColumn[];
  timezone: string;
  choices: SpecChoices;
  canWrite: boolean;
  updateRow: (formData: FormData) => Promise<void | UserError>;
  deleteRow: () => Promise<void>;
}) {
  const [values] = useState(row.values);
  const formRef = useRef<HTMLFormElement>(null);
  const payload = useRef<FormData | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (formRef.current) payload.current = new FormData(formRef.current);
  });
  const status = useAutosave(version, async () => {
    if (payload.current) return updateRow(payload.current);
  });

  return (
    <li className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-2">
      <form
        ref={formRef}
        onChange={canWrite ? () => setVersion((v) => v + 1) : undefined}
        onSubmit={(e) => e.preventDefault()}
      >
        <fieldset disabled={!canWrite} className="min-w-0">
          <RowFields columns={columns} values={values} timezone={timezone} choices={choices} />
        </fieldset>
      </form>
      {canWrite && (
        <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
          <AutosaveStatus {...status} />
          <InlineDeleteButton resource="EVENTS" requiredLevel="WRITE" hiddenInputs={{}} action={deleteRow} />
        </div>
      )}
    </li>
  );
}

export function SpecGridTable({
  label,
  required,
  columns,
  rows,
  timezone,
  choices,
  createRow,
  updateRow,
  deleteRow,
}: {
  label: string;
  required?: boolean;
  columns: SpecGridColumn[];
  rows: SpecGridRow[];
  timezone: string;
  choices: SpecChoices;
  createRow: (formData: FormData) => Promise<void | UserError>;
  // Must not redirect: rows autosave through it.
  updateRow: (rowId: string, formData: FormData) => Promise<void | UserError>;
  deleteRow: (rowId: string) => Promise<void>;
}) {
  const canWrite = useCanWrite("EVENTS");
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {label}
          {required && <span className="text-red-500 dark:text-red-400"> *</span>}
        </h3>
        {canWrite && !adding && (
          <button type="button" onClick={() => setAdding(true)} className={btnOutlinedSm}>
            Add
          </button>
        )}
      </div>
      {rows.length === 0 && !adding ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">None added.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <RowEditor
              key={row.id}
              row={row}
              columns={columns}
              timezone={timezone}
              choices={choices}
              canWrite={canWrite}
              updateRow={(formData) => updateRow(row.id, formData)}
              deleteRow={async () => {
                await deleteRow(row.id);
                router.refresh();
              }}
            />
          ))}
        </ul>
      )}
      {/* A new row needs its required columns, so it's added explicitly; it autosaves from then on. */}
      {adding && (
        <ActionForm
          action={createRow}
          onDone={() => {
            setAdding(false);
            router.refresh();
          }}
          className="mt-2 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-3 border border-dashed border-gray-300 dark:border-gray-600"
        >
          <RowFields columns={columns} timezone={timezone} choices={choices} />
          <ActionFormError />
          <div className="flex gap-2">
            <AddButton />
            <button type="button" onClick={() => setAdding(false)} className={`${btnSecondary} text-sm`}>
              Cancel
            </button>
          </div>
        </ActionForm>
      )}
    </div>
  );
}
