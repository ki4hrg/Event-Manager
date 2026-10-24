"use client";

import { formatDateHeading } from "@/lib/agendaUtils";
import type { EsgPart } from "@/lib/esg/types";
import { FilterChip, FilterGroup, ReportFilterShell } from "@/components/ReportFilterShell";
import { toggleValue, useUrlChipFilter } from "@/lib/useUrlChipFilter";

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
  hidePrint?: boolean;
};

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
  hidePrint = false,
}: ReportFiltersProps) {
  const filter = useUrlChipFilter(paramPrefix, basePath);
  const filterCount = selectedDays.length + selectedFunctionIds.length + (selectedParts.length < availableParts.length ? 1 : 0);

  return (
    <ReportFilterShell
      activeCount={filterCount}
      onClear={() => filter.clear(["parts", "days", "functions"])}
      shareButton={shareButton}
      printHref={hidePrint ? null : filter.printHref}
    >
      <FilterGroup label="Parts">
        {availableParts.map((part) => (
          <FilterChip
            key={part}
            active={selectedParts.includes(part)}
            onClick={() => {
              const next = toggleValue(selectedParts, part);
              filter.setList("parts", next.length === availableParts.length ? [] : next);
            }}
          >
            {PART_LABELS[part]}
          </FilterChip>
        ))}
      </FilterGroup>
      {days.length > 1 && (
        <FilterGroup label="Days">
          {days.map((d) => (
            <FilterChip key={d} active={selectedDays.includes(d)} onClick={() => filter.toggle("days", selectedDays, d)}>
              {formatDateHeading(d, timezone)}
            </FilterChip>
          ))}
        </FilterGroup>
      )}
      {selectedParts.includes("IIIa") && functions.length > 1 && (
        <FilterGroup label="Set-up orders for" className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
          {functions.map((f) => (
            <FilterChip
              key={f.value}
              active={selectedFunctionIds.includes(f.value)}
              onClick={() => filter.toggle("functions", selectedFunctionIds, f.value)}
            >
              {f.label}
            </FilterChip>
          ))}
        </FilterGroup>
      )}
      <div className="flex flex-col gap-2 text-sm text-gray-700 dark:text-gray-300">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showBlank}
            onChange={(e) => filter.setFlag("blank", e.target.checked, "1")}
            className="rounded border-gray-300 dark:border-gray-600"
          />
          Show blank fields
        </label>
        {allowBillingToggle && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeBilling}
              onChange={(e) => filter.setFlag("billing", !e.target.checked, "0")}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            Include billing &amp; signatories
          </label>
        )}
      </div>
    </ReportFilterShell>
  );
}
