"use client";

import { FilterChip, FilterGroup, ReportFilterShell } from "@/components/ReportFilterShell";
import { useUrlChipFilter } from "@/lib/useUrlChipFilter";

type ReportFiltersProps = {
  eventId: string;
  guestTypes: string[];
  guestTypeOptions: string[];
  basePath?: string;
  paramPrefix?: string;
  shareButton?: React.ReactNode;
  hidePrint?: boolean;
};

// One filter (guest types, all when none picked).
export function ReportFilters({
  eventId,
  guestTypes,
  guestTypeOptions,
  basePath = `/events/${eventId}/reports/hotel-info`,
  paramPrefix = "",
  shareButton,
  hidePrint = false,
}: ReportFiltersProps) {
  const filter = useUrlChipFilter(paramPrefix, basePath);

  return (
    <ReportFilterShell
      activeCount={guestTypes.length}
      onClear={() => filter.setList("guestTypes", [])}
      shareButton={shareButton}
      printHref={hidePrint ? null : filter.printHref}
      collapsible={guestTypeOptions.length > 0}
    >
      {guestTypeOptions.length > 0 && (
        <FilterGroup label="Guests">
          {guestTypeOptions.map((t) => (
            <FilterChip key={t} active={guestTypes.includes(t)} onClick={() => filter.toggle("guestTypes", guestTypes, t)}>
              {t}
            </FilterChip>
          ))}
        </FilterGroup>
      )}
    </ReportFilterShell>
  );
}
