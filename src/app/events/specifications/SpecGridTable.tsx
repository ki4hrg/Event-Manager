"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { useCanWrite } from "@/components/PermissionsProvider";
import { InlineDeleteButton } from "@/components/InlineDeleteButton";
import { btnPrimary, btnSecondary, btnOutlinedSm } from "@/lib/buttonStyles";
import { COVERAGE_KINDS, DISTRIBUTION_ACTIONS, type SpecGridColumn } from "@/lib/esg/fields";
import { formatDateOnly, formatDayDateTime } from "@/lib/esg/format";
import { SpecFieldInput, specInputClass, type SpecChoices, type SpecValue } from "./SpecFieldInput";

export type SpecGridRow = { id: string; values: Record<string, SpecValue> };
// A row the grid shows but doesn't own (e.g. a later event in the series).
export type SpecGridLinkedRow = SpecGridRow & { href: string; linkLabel: string };

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${btnPrimary} text-sm disabled:opacity-50`}>
      {pending ? "Saving..." : label}
    </button>
  );
}

function cellText(column: SpecGridColumn, value: SpecValue, timezone: string, choices: SpecChoices): string | null {
  if (value === null || value === "") return null;
  if (column.key === "kind") return COVERAGE_KINDS.find((k) => k.value === value)?.label ?? String(value);
  if (column.key === "action") return DISTRIBUTION_ACTIONS.find((k) => k.value === value)?.label ?? String(value);
  switch (column.kind) {
    case "bool":
      return value ? "Yes" : "No";
    case "date":
      return formatDateOnly(`${value}T00:00:00Z`);
    case "datetime":
      return formatDayDateTime(new Date(value as string), timezone);
    case "function":
      return choices.functions.find((f) => f.id === value)?.label ?? null;
    default:
      return String(value);
  }
}

function RowValues({
  columns,
  row,
  timezone,
  choices,
}: {
  columns: SpecGridColumn[];
  row: SpecGridRow;
  timezone: string;
  choices: SpecChoices;
}) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1 min-w-0 flex-1 text-sm">
      {columns.map((c) => {
        const text = cellText(c, row.values[c.key] ?? null, timezone, choices);
        if (!text) return null;
        return (
          <div key={c.key} className="min-w-0 break-words">
            <dt className="inline text-gray-500 dark:text-gray-400">{c.label}: </dt>
            <dd className="inline text-gray-900 dark:text-white">{text}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function RowForm({
  columns,
  row,
  timezone,
  choices,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  columns: SpecGridColumn[];
  row?: SpecGridRow;
  timezone: string;
  choices: SpecChoices;
  submitLabel: string;
  onSubmit: (formData: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  const formId = useId();
  // Picking a suggestion (a venue, a key staff member) fills its blank
  // sibling columns — city / state / country, title / employer.
  const fillFromSuggestion = (e: FormEvent<HTMLFormElement>) => {
    const input = e.target as HTMLInputElement;
    const column = columns.find((c) => c.key === input.name);
    if (!column?.suggest || !column.fill) return;
    const picked = choices.suggestions?.[column.suggest].find((s) => s.value === input.value);
    if (!picked?.attrs) return;
    for (const [key, attr] of Object.entries(column.fill)) {
      const target = e.currentTarget.elements.namedItem(key);
      const value = picked.attrs[attr];
      if (target instanceof HTMLInputElement && !target.value && value) target.value = value;
    }
  };
  return (
    <form action={onSubmit} onInput={fillFromSuggestion} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {columns.map((c) => (
          <div key={c.key}>
            <label htmlFor={`${formId}-${c.key}`} className="block text-xs font-medium text-gray-700 dark:text-gray-300">
              {c.label}
              {c.required && <span className="text-red-500 dark:text-red-400"> *</span>}
            </label>
            {c.key === "kind" || c.key === "action" ? (
              <select id={`${formId}-${c.key}`} name={c.key} required defaultValue={(row?.values[c.key] as string) ?? ""} className={specInputClass}>
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
                  defaultChecked={row?.values[c.key] === true}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                Yes
              </label>
            ) : (
              <SpecFieldInput
                id={`${formId}-${c.key}`}
                name={c.key}
                kind={c.kind}
                value={row?.values[c.key] ?? null}
                timezone={timezone}
                choices={choices}
                suggest={c.suggest}
              />
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <SaveButton label={submitLabel} />
        <button type="button" onClick={onCancel} className={`${btnSecondary} text-sm`}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function SpecGridTable({
  label,
  required,
  columns,
  rows,
  linkedRows = [],
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
  linkedRows?: SpecGridLinkedRow[];
  timezone: string;
  choices: SpecChoices;
  createRow: (formData: FormData) => Promise<void>;
  updateRow: (rowId: string, formData: FormData) => Promise<void>;
  deleteRow: (rowId: string) => Promise<void>;
}) {
  const canWrite = useCanWrite("EVENTS");
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const after = (fn: () => Promise<void>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

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
      {adding && (
        <div className="mb-3">
          <RowForm
            columns={columns}
            timezone={timezone}
            choices={choices}
            submitLabel="Add"
            onSubmit={async (formData) => {
              await createRow(formData);
              setAdding(false);
              router.refresh();
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}
      {rows.length === 0 && linkedRows.length === 0 ? (
        !adding && <p className="text-sm text-gray-500 dark:text-gray-400">None added.</p>
      ) : (
        <ul className="space-y-2">
          {linkedRows.map((row) => (
            <li key={row.id} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <div className="flex items-start justify-between gap-3">
                <RowValues columns={columns} row={row} timezone={timezone} choices={choices} />
                <Link href={row.href} className="shrink-0 py-1 text-sm text-blue-600 dark:text-blue-400 hover:underline">
                  {row.linkLabel}
                </Link>
              </div>
            </li>
          ))}
          {rows.map((row) =>
            editingId === row.id ? (
              <li key={row.id}>
                <RowForm
                  columns={columns}
                  row={row}
                  timezone={timezone}
                  choices={choices}
                  submitLabel="Save"
                  onSubmit={async (formData) => {
                    await updateRow(row.id, formData);
                    setEditingId(null);
                    router.refresh();
                  }}
                  onCancel={() => setEditingId(null)}
                />
              </li>
            ) : (
              <li key={row.id} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <div className="flex items-start justify-between gap-3">
                  <RowValues columns={columns} row={row} timezone={timezone} choices={choices} />
                  {canWrite && (
                    <div className="flex items-center gap-3 shrink-0 text-sm">
                      <button
                        type="button"
                        onClick={() => setEditingId(row.id)}
                        className="py-1 text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        Edit
                      </button>
                      <InlineDeleteButton
                        resource="EVENTS"
                        requiredLevel="WRITE"
                        hiddenInputs={{}}
                        action={async () => after(() => deleteRow(row.id))}
                      />
                    </div>
                  )}
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
