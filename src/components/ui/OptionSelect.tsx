import type { SelectHTMLAttributes } from "react";

// A select over an option list's labels that keeps a stored label no longer
// (or never) on the list, so saving the form doesn't silently drop it. Works
// controlled (`value`) or uncontrolled (`defaultValue`); `blank` is the
// empty choice's text, `blankValue` its value (a sentinel where "" means
// "unchanged").
export function OptionSelect({
  options,
  blank = "Not set",
  blankValue = "",
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, "children" | "value" | "defaultValue"> & {
  options: readonly string[];
  value?: string | null;
  defaultValue?: string | null;
  blank?: string | null;
  blankValue?: string;
}) {
  const { value, defaultValue, ...rest } = props;
  const current = value !== undefined ? value : defaultValue;
  const valueProps = value !== undefined ? { value: value ?? blankValue } : { defaultValue: defaultValue ?? blankValue };
  return (
    <select {...rest} {...valueProps}>
      {blank !== null && <option value={blankValue}>{blank}</option>}
      {current && current !== blankValue && !options.includes(current) && <option value={current}>{current}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
