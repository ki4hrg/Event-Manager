"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnPrimary, btnOutlinedSm } from "@/lib/buttonStyles";

// Completeness against the ESG's required fields, plus Issue ESG (stamps Date
// Originated / Revised and locks function numbers).
export function IssueEsgPanel({
  done,
  total,
  missing,
  originated,
  revised,
  numbersLocked,
  reportHref,
  issue,
  unlock,
}: {
  done: number;
  total: number;
  missing: { section: string; label: string }[];
  originated: string | null;
  revised: string | null;
  numbersLocked: boolean;
  reportHref: string;
  issue: () => Promise<void>;
  unlock: () => Promise<void>;
}) {
  const canWrite = useCanWrite("EVENTS");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmUnlock, setConfirmUnlock] = useState(false);
  const [showMissing, setShowMissing] = useState(false);
  const pct = total === 0 ? 100 : Math.round((done / total) * 100);

  const run = (fn: () => Promise<void>) =>
    startTransition(async () => {
      await fn();
      setConfirmUnlock(false);
      router.refresh();
    });

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            Required fields: {done} of {total}
          </p>
          <div className="mt-2 h-2 w-full max-w-md rounded bg-gray-200 dark:bg-gray-700">
            <div
              className={`h-2 rounded ${pct === 100 ? "bg-green-500 dark:bg-green-400" : "bg-blue-600 dark:bg-blue-400"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {missing.length > 0 && (
            <button
              type="button"
              onClick={() => setShowMissing(!showMissing)}
              className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              {showMissing ? "Hide" : "Show"} {missing.length} missing
            </button>
          )}
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {originated ? `Issued ${originated}` : "Not yet issued"}
            {revised ? ` · Revised ${revised}` : ""}
            {numbersLocked ? " · Function numbers locked" : " · Function numbers follow the schedule"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:shrink-0">
          <a href={reportHref} className={btnOutlinedSm}>
            View ESG
          </a>
          {canWrite && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(issue)}
              className={`${btnPrimary} text-sm disabled:opacity-50`}
            >
              {originated ? "Re-issue (mark revised)" : "Issue ESG"}
            </button>
          )}
          {canWrite &&
            numbersLocked &&
            (confirmUnlock ? (
              <span className="inline-flex items-center gap-2 text-sm">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(unlock)}
                  className="text-red-600 dark:text-red-400 hover:underline"
                >
                  Unlock & renumber
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmUnlock(false)}
                  className="text-gray-500 dark:text-gray-400 hover:underline"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmUnlock(true)} className={btnOutlinedSm}>
                Unlock numbering
              </button>
            ))}
        </div>
      </div>
      {showMissing && missing.length > 0 && (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-sm">
          {missing.map((m, i) => (
            <li key={i}>
              <a
                href={`#spec-${(m.section || "header").toLowerCase()}`}
                className="text-gray-700 dark:text-gray-300 hover:underline"
              >
                {m.section ? `${m.section}. ` : ""}
                {m.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
