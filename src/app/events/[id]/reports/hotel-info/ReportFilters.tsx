"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { btnOutlinedXs } from "@/lib/buttonStyles";

type ReportFiltersProps = {
  eventId: string;
  guestTypes: string[];
  guestTypeOptions: string[];
  basePath?: string;
  paramPrefix?: string;
  shareButton?: React.ReactNode;
  hidePrint?: boolean;
};

const chipBase = "px-3 py-1 text-sm rounded-full border transition-colors";
const chipOn = "bg-blue-600 border-blue-600 text-white";
const chipOff = "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500";

// One filter (guest types, all when none picked). On mobile the chips fold
// behind a toggle; Clear, Share and Print stay visible at every width.
export function ReportFilters({
  eventId,
  guestTypes,
  guestTypeOptions,
  basePath = `/events/${eventId}/reports/hotel-info`,
  paramPrefix = "",
  shareButton,
  hidePrint = false,
}: ReportFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const key = `${paramPrefix}guestTypes`;

  const pushWith = (next: string[]) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next.length) params.set(key, next.join(","));
    else params.delete(key);
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  };
  const toggle = (value: string) => pushWith(guestTypes.includes(value) ? guestTypes.filter((t) => t !== value) : [...guestTypes, value]);

  const filterCount = guestTypes.length;

  const actions = (
    <>
      {filterCount > 0 && (
        <button
          type="button"
          onClick={() => pushWith([])}
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          Clear filters
        </button>
      )}
      {shareButton}
      {!hidePrint && (
        <a href={`${basePath}/print${searchParams.toString() ? `?${searchParams.toString()}` : ""}`} className={btnOutlinedXs}>
          Print / Save PDF
        </a>
      )}
    </>
  );

  const filterChips = guestTypeOptions.length > 0 && (
    <div>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Guests</p>
      <div className="flex flex-wrap gap-2">
        {guestTypeOptions.map((t) => (
          <button key={t} type="button" onClick={() => toggle(t)} className={`${chipBase} ${guestTypes.includes(t) ? chipOn : chipOff}`}>
            {t}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="print:hidden mb-6">
      <div className="sm:hidden">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3">
          {filterChips && (
            <button
              type="button"
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
          )}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-3">{actions}</div>
        </div>
        {filtersOpen && filterChips}
      </div>

      <div className="hidden sm:flex flex-wrap items-start gap-6">
        {filterChips}
        <div className="flex flex-wrap items-end gap-3 ml-auto">{actions}</div>
      </div>
    </div>
  );
}
