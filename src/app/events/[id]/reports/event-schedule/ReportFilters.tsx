"use client";

import { FilterChip, FilterGroup, ReportFilterShell } from "@/components/ReportFilterShell";
import { useUrlChipFilter } from "@/lib/useUrlChipFilter";

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
  const filter = useUrlChipFilter(paramPrefix, basePath);

  return (
    <ReportFilterShell
      activeCount={selectedTypes.length + (includeNonPublic ? 1 : 0) + (compact ? 1 : 0)}
      onClear={() => filter.clear(["types", "includeNonPublic", "compact"])}
      shareButton={shareButton}
      printHref={hidePrint ? null : filter.printHref}
    >
      <FilterGroup label="Show">
        <FilterChip active={includeNonPublic} onClick={() => filter.setFlag("includeNonPublic", !includeNonPublic)}>
          Include non-public
        </FilterChip>
        <FilterChip active={compact} onClick={() => filter.setFlag("compact", !compact)}>
          Compact
        </FilterChip>
      </FilterGroup>

      {scheduleTypes.length > 0 && (
        <FilterGroup label="Schedule item types">
          {scheduleTypes.map((t) => (
            <FilterChip
              key={t.value}
              active={selectedTypes.includes(t.value)}
              onClick={() => filter.toggle("types", selectedTypes, t.value)}
            >
              {t.label}
            </FilterChip>
          ))}
        </FilterGroup>
      )}
    </ReportFilterShell>
  );
}
