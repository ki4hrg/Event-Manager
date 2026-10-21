"use client";

import { useState, type ReactNode } from "react";

// Required-field completeness for an entry page (ESG or PER), with a jump list
// of what's missing. `meta` and `actions` carry the ESG's issue state.
export function SpecProgressPanel({
  done,
  total,
  missing,
  sectionTitles,
  meta,
  actions,
}: {
  done: number;
  total: number;
  missing: { section: string; label: string }[];
  // Section letter → title; "" is the document header.
  sectionTitles: Record<string, string>;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  const [showMissing, setShowMissing] = useState(false);
  const pct = total === 0 ? 100 : Math.round((done / total) * 100);

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
          {meta && <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{meta}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
      </div>
      {showMissing && missing.length > 0 && (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-sm">
          {missing.map((m) => (
            <li key={`${m.section}-${m.label}`}>
              <a
                href={`#spec-${(m.section || "header").toLowerCase()}`}
                className="text-gray-700 dark:text-gray-300 hover:underline"
              >
                {sectionTitles[m.section] ? (
                  <span className="text-gray-500 dark:text-gray-400">{sectionTitles[m.section]} · </span>
                ) : null}
                {m.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
