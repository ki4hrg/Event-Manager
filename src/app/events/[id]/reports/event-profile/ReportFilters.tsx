"use client";

import { PROFILE_SECTIONS } from "./EventProfileReport";
import { FilterChip, FilterGroup, ReportFilterShell } from "@/components/ReportFilterShell";
import { useUrlChipFilter } from "@/lib/useUrlChipFilter";

type DayOption = { value: string; label: string };
type TypeOption = { value: string; label: string };

type ReportFiltersProps = {
  eventId: string;
  days: DayOption[];
  scheduleTypes: TypeOption[];
  selectedDays: string[];
  selectedSections: string[];
  selectedTypes: string[];
  basePath?: string;
  paramPrefix?: string;
  shareButton?: React.ReactNode;
  hidePrint?: boolean;
};

export function ReportFilters({
  eventId,
  days,
  scheduleTypes,
  selectedDays,
  selectedSections,
  selectedTypes,
  basePath = `/events/${eventId}/reports/event-profile`,
  paramPrefix = "",
  shareButton,
  hidePrint = false,
}: ReportFiltersProps) {
  const filter = useUrlChipFilter(paramPrefix, basePath);

  return (
    <ReportFilterShell
      activeCount={selectedDays.length + selectedSections.length + selectedTypes.length}
      onClear={() => filter.clear(["days", "sections", "types"])}
      shareButton={shareButton}
      printHref={hidePrint ? null : filter.printHref}
    >
      {days.length > 1 && (
        <FilterGroup label="Day">
          {days.map((d) => (
            <FilterChip
              key={d.value}
              active={selectedDays.includes(d.value)}
              onClick={() => filter.toggle("days", selectedDays, d.value)}
            >
              {d.label}
            </FilterChip>
          ))}
        </FilterGroup>
      )}

      <FilterGroup label="Sections">
        {PROFILE_SECTIONS.map(({ value, label }) => (
          <FilterChip
            key={value}
            active={selectedSections.includes(value)}
            onClick={() => filter.toggle("sections", selectedSections, value)}
          >
            {label}
          </FilterChip>
        ))}
      </FilterGroup>

      {scheduleTypes.length > 0 && (
        <FilterGroup label="Schedule Item Type">
          {scheduleTypes.map(({ value, label }) => (
            <FilterChip
              key={value}
              active={selectedTypes.includes(value)}
              onClick={() => filter.toggle("types", selectedTypes, value)}
            >
              {label}
            </FilterChip>
          ))}
        </FilterGroup>
      )}
    </ReportFilterShell>
  );
}
