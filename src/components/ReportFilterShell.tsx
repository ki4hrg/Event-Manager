"use client";

import { useState } from "react";
import { btnOutlinedXs } from "@/lib/buttonStyles";

const chipOn = "bg-blue-600 dark:bg-blue-500 border-blue-600 dark:border-blue-500 text-white dark:text-white";

type ReportFilterShellProps = {
  // Controls (chip groups, selects, checkboxes). Rendered once per layout:
  // behind the mobile toggle, and inline from `sm` up.
  children: React.ReactNode;
  // Badge on the mobile toggle; the Clear button shows when > 0.
  activeCount: number;
  // Omit for filter bars without a Clear button.
  onClear?: () => void;
  shareButton?: React.ReactNode;
  // `null` hides the Print link (share views pass `hidePrint`).
  printHref: string | null;
  // False when no control would render, so the mobile toggle is dropped.
  collapsible?: boolean;
};

// Report filter bar: mobile "Show filters / N" collapse plus the always-visible
// Clear, Share and Print actions. Print is a link to the `/print` route.
export function ReportFilterShell({
  children,
  activeCount,
  onClear,
  shareButton,
  printHref,
  collapsible = true,
}: ReportFilterShellProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  const actions = (
    <>
      {onClear && activeCount > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          Clear filters
        </button>
      )}
      {shareButton}
      {printHref && (
        <a href={printHref} className={btnOutlinedXs}>
          Print / Save PDF
        </a>
      )}
    </>
  );

  return (
    <div className="print:hidden mb-6">
      <div className="sm:hidden">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3">
          {collapsible && (
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300"
            >
              <span aria-hidden>{filtersOpen ? "▾" : "▸"}</span>
              <span>{filtersOpen ? "Hide filters" : "Show filters"}</span>
              {activeCount > 0 && (
                <span className="ml-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded-full">
                  {activeCount}
                </span>
              )}
            </button>
          )}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-3">{actions}</div>
        </div>
        {collapsible && filtersOpen && <div className="flex flex-wrap items-start gap-6">{children}</div>}
      </div>

      <div className="hidden sm:flex flex-wrap items-start gap-6">
        {children}
        <div className="flex flex-wrap items-end gap-3 ml-auto">{actions}</div>
      </div>
    </div>
  );
}

// Labeled block of controls. `className` replaces the default chip row
// (`space-y-2` for bucketed rows, a max height for long lists).
export function FilterGroup({
  label,
  className = "flex flex-wrap gap-2",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{label}</p>
      <div className={className}>{children}</div>
    </div>
  );
}

export function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 text-sm rounded-full border transition-colors ${
        active
          ? chipOn
          : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500"
      }`}
    >
      {children}
    </button>
  );
}

// Select-all chip heading a bucket of chips (room group, function type).
export function FilterBucketChip({
  label,
  allActive,
  someActive,
  onClick,
}: {
  label: string;
  allActive: boolean;
  someActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 text-xs font-medium uppercase tracking-wide rounded border transition-colors ${
        allActive
          ? chipOn
          : someActive
            ? "border-blue-400 dark:border-blue-500 text-blue-700 dark:text-blue-300"
            : "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500"
      }`}
      title={allActive ? `Clear ${label}` : `Select all in ${label}`}
    >
      {label}
    </button>
  );
}
