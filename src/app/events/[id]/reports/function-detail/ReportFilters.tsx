"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { FunctionPickerOption } from "@/app/events/reports/actions";

type ReportFiltersProps = {
  eventId: string;
  functions: FunctionPickerOption[];
  selectedFunctionIds: string[];
  basePath?: string;
  paramPrefix?: string;
  shareButton?: React.ReactNode;
  hidePrint?: boolean;
};

type TypeBucket = {
  typeValue: string | null;
  label: string;
  sortOrder: number;
  functions: FunctionPickerOption[];
};

function bucketByType(functions: FunctionPickerOption[]): TypeBucket[] {
  const buckets = new Map<string, TypeBucket>();
  for (const fn of functions) {
    const key = fn.typeValue ?? "__untyped__";
    if (!buckets.has(key)) {
      buckets.set(key, {
        typeValue: fn.typeValue,
        label: fn.typeLabel,
        sortOrder: fn.typeSortOrder,
        functions: [],
      });
    }
    buckets.get(key)!.functions.push(fn);
  }
  return Array.from(buckets.values()).sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.label.localeCompare(b.label);
  });
}

function toggleFilter(selected: string[], value: string): string[] {
  return selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
}

export function ReportFilters({
  eventId,
  functions,
  selectedFunctionIds,
  basePath = `/events/${eventId}/reports/function-detail`,
  paramPrefix = "",
  shareButton,
  hidePrint = false,
}: ReportFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const functionsKey = `${paramPrefix}functions`;

  function pushFunctions(next: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.length > 0) {
      params.set(functionsKey, next.join(","));
    } else {
      params.delete(functionsKey);
    }
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  function toggleFunction(id: string) {
    pushFunctions(toggleFilter(selectedFunctionIds, id));
  }

  function toggleBucket(bucketIds: string[], allActive: boolean) {
    const next = allActive
      ? selectedFunctionIds.filter((id) => !bucketIds.includes(id))
      : Array.from(new Set([...selectedFunctionIds, ...bucketIds]));
    pushFunctions(next);
  }

  function clearFilters() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(functionsKey);
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  const buckets = useMemo(() => bucketByType(functions), [functions]);
  const hasMultipleBuckets = buckets.length > 1;
  const filterCount = selectedFunctionIds.length;

  const actions = (
    <>
      {filterCount > 0 && (
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
      {functions.length > 1 && (
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Functions</p>
          <div className="space-y-2">
            {buckets.map((bucket) => {
              const bucketIds = bucket.functions.map((f) => f.value);
              const allActive = bucketIds.every((id) => selectedFunctionIds.includes(id));
              const someActive = bucketIds.some((id) => selectedFunctionIds.includes(id));
              return (
                <div key={bucket.typeValue ?? "__untyped__"} className="flex flex-wrap items-center gap-2">
                  {hasMultipleBuckets && (
                    <button
                      onClick={() => toggleBucket(bucketIds, allActive)}
                      className={`px-2.5 py-1 text-xs font-medium uppercase tracking-wide rounded border transition-colors ${
                        allActive
                          ? "bg-blue-600 border-blue-600 text-white"
                          : someActive
                            ? "border-blue-400 dark:border-blue-500 text-blue-700 dark:text-blue-300"
                            : "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400"
                      }`}
                      title={allActive ? `Clear ${bucket.label}` : `Select all in ${bucket.label}`}
                    >
                      {bucket.label}
                    </button>
                  )}
                  {bucket.functions.map((f) => {
                    const active = selectedFunctionIds.includes(f.value);
                    return (
                      <button
                        key={f.value}
                        onClick={() => toggleFunction(f.value)}
                        className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                          active
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-gray-400"
                        }`}
                      >
                        {f.label}
                      </button>
                    );
                  })}
                </div>
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
