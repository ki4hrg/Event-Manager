"use client";

import { useMemo } from "react";
import type { FunctionPickerOption } from "@/app/events/reports/data";
import { FilterBucketChip, FilterChip, FilterGroup, ReportFilterShell } from "@/components/ReportFilterShell";
import { useUrlChipFilter } from "@/lib/useUrlChipFilter";

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

export function ReportFilters({
  eventId,
  functions,
  selectedFunctionIds,
  basePath = `/events/${eventId}/reports/function-detail`,
  paramPrefix = "",
  shareButton,
  hidePrint = false,
}: ReportFiltersProps) {
  const filter = useUrlChipFilter(paramPrefix, basePath);

  const buckets = useMemo(() => bucketByType(functions), [functions]);
  const hasMultipleBuckets = buckets.length > 1;

  return (
    <ReportFilterShell
      activeCount={selectedFunctionIds.length}
      onClear={() => filter.clear(["functions"])}
      shareButton={shareButton}
      printHref={hidePrint ? null : filter.printHref}
    >
      {functions.length > 1 && (
        <FilterGroup label="Functions" className="space-y-2">
          {buckets.map((bucket) => {
            const bucketIds = bucket.functions.map((f) => f.value);
            const allActive = bucketIds.every((id) => selectedFunctionIds.includes(id));
            const someActive = bucketIds.some((id) => selectedFunctionIds.includes(id));
            return (
              <div key={bucket.typeValue ?? "__untyped__"} className="flex flex-wrap items-center gap-2">
                {hasMultipleBuckets && (
                  <FilterBucketChip
                    label={bucket.label}
                    allActive={allActive}
                    someActive={someActive}
                    onClick={() => filter.toggleAll("functions", selectedFunctionIds, bucketIds, allActive)}
                  />
                )}
                {bucket.functions.map((f) => (
                  <FilterChip
                    key={f.value}
                    active={selectedFunctionIds.includes(f.value)}
                    onClick={() => filter.toggle("functions", selectedFunctionIds, f.value)}
                  >
                    {f.label}
                  </FilterChip>
                ))}
              </div>
            );
          })}
        </FilterGroup>
      )}
    </ReportFilterShell>
  );
}
