"use client";

import type { PackingStatus } from "@prisma/client";

// A packing_substatus option: its group is the PackingStatus it belongs to.
export type PackingSubstatusOption = { label: string; group: string | null };

type Props = {
  status: PackingStatus | null;
  options: PackingSubstatusOption[];
  // Form field name (uncontrolled use). Remount on status change (key it) so a
  // sub-state of the old status doesn't carry over.
  name?: string;
  defaultValue?: string | null;
  // Controlled use.
  value?: string | null;
  onChange?: (value: string | null) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

const baseCls =
  "border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:opacity-50";

// Sub-state select limited to the chosen status's group. Renders nothing when
// that status has no sub-states (and none is stored).
export function PackingSubstatusSelect({ status, options, name, defaultValue, value, onChange, disabled, className, ...rest }: Props) {
  const choices = status ? options.filter((o) => o.group === status).map((o) => o.label) : [];
  const current = value !== undefined ? value : defaultValue;
  // A stored label no longer on the list still shows, so a save doesn't drop it.
  if (current && !choices.includes(current)) choices.unshift(current);
  if (choices.length === 0) return null;
  const valueProps =
    value !== undefined ? { value: value ?? "" } : { defaultValue: defaultValue ?? "" };
  return (
    <select
      name={name}
      {...valueProps}
      disabled={disabled}
      onChange={onChange ? (e) => onChange(e.target.value || null) : undefined}
      aria-label={rest["aria-label"] ?? "Packing sub-state"}
      className={`${baseCls} ${className ?? "w-full px-3 py-1.5 text-sm"}`}
    >
      <option value="">—</option>
      {choices.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
    </select>
  );
}
