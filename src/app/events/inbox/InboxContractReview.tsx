"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { ContractTarget } from "@/lib/inboundParse";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";

const inputClass =
  "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm";
const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6 space-y-4";
const muted = "text-gray-500 dark:text-gray-400";

export type ContractReview = {
  target: ContractTarget | null;
  targetId: string | null;
  groups: { target: ContractTarget; label: string; options: { id: string; label: string }[] }[];
  writes: Record<ContractTarget, { fields: { label: string; value: string }[]; note: string | null }>;
};

// A contract against what it covers: pick the proposal, quote or catering
// order; the terms it holds are written there, the rest go in its notes, and
// the contract is filed on it.
export function InboxContractReview({
  review,
  apply,
  cancelHref,
}: {
  review: ContractReview;
  apply: (target: ContractTarget, targetId: string, note: string | null) => Promise<void>;
  cancelHref: string;
}) {
  const [choice, setChoice] = useState(review.target && review.targetId ? `${review.target}:${review.targetId}` : "");
  const [target, targetId] = choice ? (choice.split(":") as [ContractTarget, string]) : [null, ""];
  const writes = target ? review.writes[target] : null;
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const shownNote = note ?? writes?.note ?? "";
  return (
    <div className={cardClass}>
      <div>
        <label htmlFor="contract-target" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Covers *
        </label>
        <select
          id="contract-target"
          value={choice}
          onChange={(e) => {
            setChoice(e.target.value);
            setNote(null);
          }}
          className={inputClass}
        >
          <option value="">Select a proposal, quote or catering order</option>
          {review.groups.map((g) =>
            g.options.length ? (
              <optgroup key={g.target} label={g.label}>
                {g.options.map((o) => (
                  <option key={o.id} value={`${g.target}:${o.id}`}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ) : null,
          )}
        </select>
      </div>
      {writes && (
        <>
          {writes.fields.length > 0 && (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {writes.fields.map((f) => (
                <div key={f.label}>
                  <dt className={muted}>{f.label}</dt>
                  <dd className="text-gray-900 dark:text-white">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <div>
            <label htmlFor="contract-note" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Added to notes
            </label>
            <textarea id="contract-note" rows={2} value={shownNote} onChange={(e) => setNote(e.target.value)} className={inputClass} />
          </div>
        </>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!target || pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              try {
                await apply(target!, targetId, shownNote.trim() || null);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Couldn't apply");
              }
            })
          }
          className={`${btnPrimary} disabled:opacity-50`}
        >
          {pending ? "Applying..." : "Apply and file the contract"}
        </button>
        <Link href={cancelHref} className={btnSecondary}>
          Cancel
        </Link>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
