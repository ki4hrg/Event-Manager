"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PROFILE_SECTIONS } from "./EventProfileReport";

type DayOption = { value: string; label: string };

type ReportFiltersProps = {
  eventId: string;
  days: DayOption[];
  selectedDays: string[];
  selectedSections: string[];
  basePath?: string;
  shareButton?: React.ReactNode;
  hidePrint?: boolean;
};

function toggleFilter(selected: string[], value: string): string[] {
  return selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
}

export function ReportFilters({
  eventId,
  days,
  selectedDays,
  selectedSections,
  basePath = `/events/${eventId}/reports/event-profile`,
  shareButton,
  hidePrint = false,
}: ReportFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);

  function pushWith(key: "days" | "sections", next: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.length > 0) {
      params.set(key, next.join(","));
    } else {
      params.delete(key);
    }
    router.push(`${basePath}?${params.toString()}`);
  }

  function toggleDay(value: string) {
    pushWith("days", toggleFilter(selectedDays, value));
  }

  function toggleSection(value: string) {
    pushWith("sections", toggleFilter(selectedSections, value));
  }

  function clearFilters() {
    router.push(basePath);
  }

  const hasFilters = selectedDays.length > 0 || selectedSections.length > 0;
  const filterCount = selectedDays.length + selectedSections.length;

  const actions = (
    <>
      {hasFilters && (
        <button
          onClick={clearFilters}
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          Clear filters
        </button>
      )}
      {shareButton}
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

  const filterChips = (
    <>
      {days.length > 1 && (
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Day</p>
          <div className="flex flex-wrap gap-2">
            {days.map((d) => {
              const active = selectedDays.includes(d.value);
              return (
                <button
                  key={d.value}
                  onClick={() => toggleDay(d.value)}
                  className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                    active
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400"
                  }`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Sections</p>
        <div className="flex flex-wrap gap-2">
          {PROFILE_SECTIONS.map(({ value, label }) => {
            const active = selectedSections.includes(value);
            return (
              <button
                key={value}
                onClick={() => toggleSection(value)}
                className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                  active
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );

  return (
    <div className="print:hidden mb-6">
      <div className="sm:hidden">
        <div className="flex items-center gap-3 mb-3">
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
          <div className="ml-auto flex items-center gap-3">{actions}</div>
        </div>
        {filtersOpen && (
          <div className="flex flex-wrap items-start gap-6">{filterChips}</div>
        )}
      </div>

      <div className="hidden sm:flex flex-wrap items-start gap-6">
        {filterChips}
        <div className="flex items-end gap-3 ml-auto">{actions}</div>
      </div>
    </div>
  );
}
