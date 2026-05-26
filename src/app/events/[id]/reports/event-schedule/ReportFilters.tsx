"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type TypeOption = { value: string; label: string };

type ReportFiltersProps = {
  eventId: string;
  scheduleTypes: TypeOption[];
  selectedTypes: string[];
  includeNonPublic: boolean;
  compact: boolean;
  basePath?: string;
  paramPrefix?: string;
  shareButton?: React.ReactNode;
  hidePrint?: boolean;
};

function toggleFilter(selected: string[], value: string): string[] {
  return selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
}

export function ReportFilters({
  eventId,
  scheduleTypes,
  selectedTypes,
  includeNonPublic,
  compact,
  basePath = `/events/${eventId}/reports/event-schedule`,
  paramPrefix = "",
  shareButton,
  hidePrint = false,
}: ReportFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const typesKey = `${paramPrefix}types`;
  const nonPublicKey = `${paramPrefix}includeNonPublic`;
  const compactKey = `${paramPrefix}compact`;

  function pushWith(key: string, next: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.length > 0) {
      params.set(key, next.join(","));
    } else {
      params.delete(key);
    }
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  function toggleType(value: string) {
    pushWith(typesKey, toggleFilter(selectedTypes, value));
  }

  function toggleNonPublic() {
    const params = new URLSearchParams(searchParams.toString());
    if (includeNonPublic) {
      params.delete(nonPublicKey);
    } else {
      params.set(nonPublicKey, "true");
    }
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  function toggleCompact() {
    const params = new URLSearchParams(searchParams.toString());
    if (compact) {
      params.delete(compactKey);
    } else {
      params.set(compactKey, "true");
    }
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  function clearFilters() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(typesKey);
    params.delete(nonPublicKey);
    params.delete(compactKey);
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  const hasFilters = selectedTypes.length > 0 || includeNonPublic || compact;
  const filterCount = selectedTypes.length + (includeNonPublic ? 1 : 0) + (compact ? 1 : 0);

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
      <div>
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Show</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={toggleNonPublic}
            className={`px-3 py-1 text-sm rounded-full border transition-colors ${
              includeNonPublic
                ? "bg-blue-600 border-blue-600 text-white"
                : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400"
            }`}
          >
            Include non-public
          </button>
          <button
            onClick={toggleCompact}
            title="Two-column layout, no forced page break per day. Best for handouts."
            className={`px-3 py-1 text-sm rounded-full border transition-colors ${
              compact
                ? "bg-blue-600 border-blue-600 text-white"
                : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400"
            }`}
          >
            Compact
          </button>
        </div>
      </div>

      {scheduleTypes.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Schedule item types</p>
          <div className="flex flex-wrap gap-2">
            {scheduleTypes.map((t) => {
              const active = selectedTypes.includes(t.value);
              return (
                <button
                  key={t.value}
                  onClick={() => toggleType(t.value)}
                  className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                    active
                      ? "bg-blue-600 border-blue-600 text-white"
                      : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
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
