"use client";

import type { LocationKind } from "@prisma/client";

/**
 * Serializable shape passed from server components. The tree helpers in
 * @/lib/storageLocations import prisma, so flattening happens server-side and
 * only this plain array crosses the boundary.
 */
export type LocationOption = {
  id: string;
  name: string;
  kind: LocationKind;
  depth: number;
  path: string;
  archived: boolean;
};

/**
 * A native select with depth-indented labels. Nesting runs deeper than two
 * levels, so <optgroup> doesn't fit — and native selects are what make every
 * other picker in this app work on a phone.
 *
 * "" means no location, matching GroupedEquipmentSelect. (__blank__ is the
 * sentinel for filter selects, not value-carrying ones.)
 */
export function LocationSelect({
  name,
  options,
  defaultValue,
  value,
  onChange,
  placeholder = "— None —",
  size = "sm",
  disabled,
}: {
  name?: string;
  options: LocationOption[];
  defaultValue?: string | null;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  const padding = size === "md" ? "px-3 py-1.5" : "px-2 py-1";
  const controlled = value !== undefined;

  return (
    <select
      name={name}
      disabled={disabled}
      {...(controlled
        ? { value, onChange: (e) => onChange?.(e.target.value) }
        : { defaultValue: defaultValue || "" })}
      className={`w-full ${padding} border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white disabled:opacity-50`}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.id} value={option.id} title={option.path}>
          {/* Non-breaking spaces: a select collapses ordinary leading whitespace. */}
          {`${"  ".repeat(option.depth)}${option.name}${
            option.archived ? " (archived)" : ""
          }`}
        </option>
      ))}
    </select>
  );
}
