"use client";

import { ACCESS_CAP_OPTIONS, UNCAPPED } from "@/lib/accessLevels";

// The per-event access cap picker. Used from the event staff list and the user
// detail page's Event access panel, in both controlled (row edit) and plain
// form-field (add form) modes — pass value+onChange for the former, name for
// the latter.
type Props = {
  ariaLabel: string;
  value?: string;
  onChange?: (value: string) => void;
  name?: string;
  id?: string;
  defaultValue?: string;
  disabled?: boolean;
  className?: string;
};

export const accessSelectClass =
  "px-2 py-1 text-xs border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500";

export function AccessLevelSelect({
  ariaLabel,
  value,
  onChange,
  name,
  id,
  defaultValue,
  disabled,
  className,
}: Props) {
  return (
    <select
      aria-label={ariaLabel}
      id={id}
      name={name}
      value={value}
      defaultValue={defaultValue}
      disabled={disabled}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      className={className ? `${accessSelectClass} ${className}` : accessSelectClass}
    >
      {ACCESS_CAP_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export { UNCAPPED };
