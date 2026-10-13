"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatDateHeading } from "@/lib/agendaUtils";
import type { EsgPart } from "@/lib/esg/types";

const PART_LABELS: Record<EsgPart, string> = {
  I: "I · Narrative",
  II: "II · Function schedule",
  IIIa: "IIIa · Set-up orders",
  IIIb: "IIIb · Booth set-up orders",
};

type ReportFiltersProps = {
  eventId: string;
  timezone: string;
  availableParts: EsgPart[];
  selectedParts: EsgPart[];
  days: string[];
  selectedDays: string[];
  functions: { value: string; label: string }[];
  selectedFunctionIds: string[];
  showBlank: boolean;
  includeBilling: boolean;
  // Share views pin billing to the link's setting.
  allowBillingToggle?: boolean;
  basePath?: string;
  paramPrefix?: string;
  shareButton?: React.ReactNode;
  downloadLinks?: React.ReactNode;
  hidePrint?: boolean;
};

const chip = (active: boolean) =>
  `px-3 py-1 text-sm rounded-full border transition-colors ${
    active
      ? "bg-blue-600 border-blue-600 text-white"
      : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400"
  }`;

export function ReportFilters({
  eventId,
  timezone,
  availableParts,
  selectedParts,
  days,
  selectedDays,
  functions,
  selectedFunctionIds,
  showBlank,
  includeBilling,
  allowBillingToggle = true,
  basePath = `/events/${eventId}/reports/esg`,
  paramPrefix = "",
  shareButton,
  downloadLinks,
  hidePrint = false,
}: ReportFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const key = (k: string) => `${paramPrefix}${k}`;

  function push(mutate: (p: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  function setList(name: string, values: string[]) {
    push((p) => (values.length ? p.set(key(name), values.join(",")) : p.delete(key(name))));
  }

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const filterCount = selectedDays.length + selectedFunctionIds.length + (selectedParts.length < availableParts.length ? 1 : 0);

  const actions = (
    <>
      {filterCount > 0 && (
        <button
          onClick={() =>
            push((p) => ["parts", "days", "functions"].forEach((k) => p.delete(key(k))))
          }
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          Clear filters
        </button>
      )}
      {shareButton}
      {downloadLinks}
      {!hidePrint && (
        <a
          href={`${basePath}/print${searchParams.toString() ? `?${searchParams.toString()}` : ""}`}
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
        >
          Print / Save PDF
        </a>
      )}
    </>
  );

  const chips = (
    <>
      <div>
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Parts</p>
        <div className="flex flex-wrap gap-2">
          {availableParts.map((part) => (
            <button
              key={part}
              onClick={() => {
                const next = toggle(selectedParts, part);
                setList("parts", next.length === availableParts.length ? [] : next);
              }}
              className={chip(selectedParts.includes(part))}
            >
              {PART_LABELS[part]}
            </button>
          ))}
        </div>
      </div>
      {days.length > 1 && (
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Days</p>
          <div className="flex flex-wrap gap-2">
            {days.map((d) => (
              <button key={d} onClick={() => setList("days", toggle(selectedDays, d))} className={chip(selectedDays.includes(d))}>
                {formatDateHeading(d, timezone)}
              </button>
            ))}
          </div>
        </div>
      )}
      {selectedParts.includes("IIIa") && functions.length > 1 && (
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Set-up orders for</p>
          <div className="flex flex-wrap gap-2">
            {functions.map((f) => (
              <button
                key={f.value}
                onClick={() => setList("functions", toggle(selectedFunctionIds, f.value))}
                className={chip(selectedFunctionIds.includes(f.value))}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showBlank}
            onChange={(e) => push((p) => (e.target.checked ? p.set(key("blank"), "1") : p.delete(key("blank"))))}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          Show blank fields
        </label>
        {allowBillingToggle && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeBilling}
              onChange={(e) => push((p) => (e.target.checked ? p.delete(key("billing")) : p.set(key("billing"), "0")))}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            Include billing &amp; signatories
          </label>
        )}
      </div>
    </>
  );

  return (
    <div className="print:hidden mb-6">
      <div className="sm:hidden">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3">
          <button
            onClick={() => setFiltersOpen((open) => !open)}
            className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300"
          >
            <span aria-hidden>{filtersOpen ? "▾" : "▸"}</span>
            <span>{filtersOpen ? "Hide filters" : "Show filters"}</span>
            {filterCount > 0 && (
              <span className="ml-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded-full">
                {filterCount}
              </span>
            )}
          </button>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-3">{actions}</div>
        </div>
        {filtersOpen && <div className="flex flex-wrap items-start gap-6">{chips}</div>}
      </div>
      <div className="hidden sm:flex flex-wrap items-start gap-6">
        {chips}
        <div className="flex flex-wrap items-end gap-3 ml-auto">{actions}</div>
      </div>
    </div>
  );
}
