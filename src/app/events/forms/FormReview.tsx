"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { btnDanger, btnPrimary } from "@/lib/buttonStyles";
import type { FormDiffSection } from "@/lib/forms/meta";
import type { ReviewChoice } from "@/lib/forms/types";

// Every submitted value renders as React text. Submissions are public input;
// nothing here may go through dangerouslySetInnerHTML.

const STATUS_CLS: Record<string, string> = {
  unchanged: "text-gray-500 dark:text-gray-400",
  changed: "text-blue-700 dark:text-blue-300",
  conflict: "text-amber-700 dark:text-amber-300",
};

function Value({ v }: { v: string | null }) {
  return v == null ? <span className="text-gray-400 dark:text-gray-500">—</span> : <span className="whitespace-pre-line break-words">{v}</span>;
}

function VerdictBadge({ verdict }: { verdict: FormDiffSection["verdict"] }) {
  if (verdict === "ok") return <span className="rounded bg-green-50 dark:bg-green-950 px-2 py-0.5 text-xs text-green-700 dark:text-green-300">Looks right</span>;
  if (verdict === "changes") return <span className="rounded bg-amber-50 dark:bg-amber-950 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">Needs changes</span>;
  return <span className="rounded bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-xs text-gray-600 dark:text-gray-400">No answer</span>;
}

function Choice({ choice }: { choice: ReviewChoice }) {
  // Many options (existing orders) read better as a select.
  if (choice.options.length > 4) {
    return (
      <label className="block">
        <span className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{choice.label}</span>
        <select
          name={`choice_${choice.key}`}
          defaultValue={choice.defaultValue}
          className="w-full sm:w-auto rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 py-1.5"
        >
          {choice.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{choice.label}</legend>
      {choice.options.map((o) => (
        <label key={o.value} className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
          <input
            type="radio"
            name={`choice_${choice.key}`}
            value={o.value}
            defaultChecked={o.value === choice.defaultValue}
            className="border-gray-300 dark:border-gray-600"
          />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}

export function FormDiff({
  sections,
  selectable,
  choices = [],
}: {
  sections: FormDiffSection[];
  selectable: boolean;
  choices?: ReviewChoice[];
}) {
  return (
    <div className="space-y-4">
      {sections.map((s) => (
        <section key={s.key} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            {selectable && s.applicable ? (
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="sections" value={s.key} defaultChecked className="rounded border-gray-300 dark:border-gray-600" />
                <span className="text-sm font-semibold text-gray-900 dark:text-white">{s.label}</span>
              </label>
            ) : (
              <span className="text-sm font-semibold text-gray-900 dark:text-white">{s.label}</span>
            )}
            {s.mode === "update" && <VerdictBadge verdict={s.verdict} />}
          </div>
          {s.note && (
            <p className="rounded bg-gray-50 dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-line break-words">{s.note}</p>
          )}
          {s.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                    <th className="py-1 pr-4 font-medium">Field</th>
                    {s.mode === "update" && <th className="py-1 pr-4 font-medium">When sent</th>}
                    <th className="py-1 pr-4 font-medium">Submitted</th>
                    {s.mode === "update" && <th className="py-1 font-medium">On file now</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700 align-top">
                  {s.rows.map((r) => (
                    <tr key={r.field}>
                      <td className="py-2 pr-4 text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.label}</td>
                      {s.mode === "update" && <td className="py-2 pr-4 text-gray-600 dark:text-gray-400"><Value v={r.baseline} /></td>}
                      <td className={`py-2 pr-4 ${s.mode === "create" ? "text-gray-900 dark:text-gray-100" : STATUS_CLS[r.status]}`}><Value v={r.proposed} /></td>
                      {s.mode === "update" && (
                        <td className="py-2 text-gray-600 dark:text-gray-400">
                          <Value v={r.current} />
                          {r.status === "conflict" && (
                            <span className="block text-xs text-amber-700 dark:text-amber-300">Changed since this was sent</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {selectable && choices.filter((c) => (c.section ?? c.key) === s.key).map((c) => <Choice key={c.key} choice={c} />)}
          {!s.applicable && s.rows.length === 0 && !s.note && s.verdict !== "changes" && (
            <p className="text-xs text-gray-500 dark:text-gray-400">Nothing to apply.</p>
          )}
        </section>
      ))}
    </div>
  );
}

function ApplyButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={disabled || pending} className={`${btnPrimary} disabled:opacity-50`}>
      {pending ? "Applying…" : "Apply selected"}
    </button>
  );
}

export function FormReview({
  sections,
  version,
  choices,
  approvalMessage,
  apply,
  reject,
}: {
  sections: FormDiffSection[];
  version: string | null;
  choices: ReviewChoice[];
  approvalMessage: string | null;
  apply: (formData: FormData) => Promise<void>;
  reject: (formData: FormData) => Promise<void>;
}) {
  const [confirmReject, setConfirmReject] = useState(false);
  return (
    <form action={apply} className="space-y-6">
      <input type="hidden" name="version" value={version ?? ""} />
      <FormDiff sections={sections} selectable choices={choices} />

      <div>
        <label htmlFor="reviewNotes" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Review notes</label>
        <textarea
          id="reviewNotes"
          name="reviewNotes"
          rows={2}
          className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white px-3 py-2"
        />
      </div>

      {approvalMessage && <p className="text-sm text-amber-700 dark:text-amber-300">{approvalMessage}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <ApplyButton disabled={!!approvalMessage || !version} />
        {confirmReject ? (
          <>
            <button type="submit" formAction={reject} className={btnDanger}>Confirm reject</button>
            <button type="button" onClick={() => setConfirmReject(false)} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
              Cancel
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirmReject(true)} className="text-sm text-red-600 dark:text-red-400 hover:underline">
            Reject
          </button>
        )}
      </div>
    </form>
  );
}
