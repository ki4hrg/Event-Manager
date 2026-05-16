"use client";

import { asPresence, type PresenceFilter } from "@/lib/presenceFilter";

type Props = {
  label: string;
  value: PresenceFilter;
  onChange: (value: PresenceFilter) => void;
  hasLabel?: string;
  missingLabel?: string;
};

export function PresenceFilterSelect({
  label,
  value,
  onChange,
  hasLabel = "Has",
  missingLabel = "Missing",
}: Props) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(asPresence(e.target.value))}
        className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
      >
        <option value="">All</option>
        <option value="yes">{hasLabel}</option>
        <option value="none">{missingLabel}</option>
      </select>
    </div>
  );
}
