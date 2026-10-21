"use client";

import { colorClasses } from "@/lib/colors";

export type StatusCycleOption<T extends string> = { value: T; label: string; color: keyof typeof colorClasses };

// A short status pick on a row: on a phone, a colored pill that steps to the
// next option on each tap; from sm up, a small colored select. "" is the
// unset value and should be one of the options.
export function StatusCycle<T extends string>({
  value,
  options,
  onChange,
  label,
  disabled = false,
}: {
  value: T;
  options: StatusCycleOption<T>[];
  onChange: (next: T) => void;
  label: string; // accessible name, e.g. "Pool in this offer"
  disabled?: boolean;
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const current = options[index];
  const pill = `text-xs rounded px-2 py-1 font-medium border-0 disabled:opacity-50 ${colorClasses[current.color]}`;
  return (
    <>
      <button
        type="button"
        aria-label={`${label}: ${current.label}`}
        disabled={disabled}
        onClick={() => onChange(options[(index + 1) % options.length].value)}
        className={`sm:hidden min-w-[5.5rem] min-h-[2rem] ${pill}`}
      >
        {current.label}
      </button>
      <select
        aria-label={label}
        value={current.value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className={`hidden sm:inline-block ${pill}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </>
  );
}
