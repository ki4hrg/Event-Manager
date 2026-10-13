"use client";

import { RichTextEditor } from "@/components/RichTextEditor";
import { PROVIDED_BY_LABELS } from "@/lib/esg/apex";
import { toDateTimeLocal } from "@/lib/esg/format";
import type { EsgFieldKind } from "@/lib/esg/fields";

// Serialized values: dates arrive as "YYYY-MM-DD", datetimes as ISO strings.
export type SpecValue = string | number | boolean | null;

export type SpecChoices = {
  options: Record<string, { label: string }[]>;
  vendors: { id: string; label: string }[];
  contacts: { id: string; label: string }[];
  functions: { id: string; label: string }[];
};

export const specInputClass =
  "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm";

function Choices({
  name,
  value,
  items,
  emptyLabel = "Not set",
  id,
}: {
  name: string;
  value: SpecValue;
  items: { value: string; label: string }[];
  emptyLabel?: string;
  id?: string;
}) {
  const current = value === null ? "" : String(value);
  // Keep a stored value selectable even if it's no longer in the list
  // (e.g. an option deleted in Settings).
  const missing = current && !items.some((i) => i.value === current) ? [{ value: current, label: current }] : [];
  return (
    <select id={id} name={name} defaultValue={current} className={specInputClass}>
      <option value="">{emptyLabel}</option>
      {[...missing, ...items].map((i) => (
        <option key={i.value} value={i.value}>
          {i.label}
        </option>
      ))}
    </select>
  );
}

export function SpecFieldInput({
  name,
  kind,
  value,
  timezone,
  choices,
  optionCategory,
  id,
}: {
  name: string;
  kind: EsgFieldKind;
  value: SpecValue;
  timezone: string;
  choices: SpecChoices;
  optionCategory?: string;
  id?: string;
}) {
  switch (kind) {
    case "text":
      return <input id={id} name={name} defaultValue={(value as string) ?? ""} className={specInputClass} />;
    case "textarea":
      return (
        <textarea id={id} name={name} rows={3} defaultValue={(value as string) ?? ""} className={specInputClass} />
      );
    case "richtext":
      return (
        <div className="mt-1">
          <RichTextEditor name={name} defaultValue={(value as string) ?? ""} />
        </div>
      );
    case "int":
      return (
        <input
          id={id}
          type="number"
          min={0}
          name={name}
          defaultValue={value === null ? "" : String(value)}
          className={specInputClass}
        />
      );
    case "bool":
      return (
        <Choices
          id={id}
          name={name}
          value={value}
          items={[
            { value: "true", label: "Yes" },
            { value: "false", label: "No" },
          ]}
        />
      );
    case "date":
      return <input id={id} type="date" name={name} defaultValue={(value as string) ?? ""} className={specInputClass} />;
    case "datetime":
      return (
        <input
          id={id}
          type="datetime-local"
          name={name}
          defaultValue={toDateTimeLocal(value as string | null, timezone)}
          className={specInputClass}
        />
      );
    case "option":
      return (
        <Choices
          id={id}
          name={name}
          value={value}
          items={(choices.options[optionCategory ?? ""] ?? []).map((o) => ({ value: o.label, label: o.label }))}
        />
      );
    case "providedBy":
      return (
        <Choices
          id={id}
          name={name}
          value={value}
          items={Object.entries(PROVIDED_BY_LABELS).map(([v, label]) => ({ value: v, label }))}
        />
      );
    case "vendor":
      return (
        <Choices id={id} name={name} value={value} items={choices.vendors.map((v) => ({ value: v.id, label: v.label }))} />
      );
    case "contact":
      return (
        <Choices
          id={id}
          name={name}
          value={value}
          items={choices.contacts.map((c) => ({ value: c.id, label: c.label }))}
        />
      );
    case "function":
      return (
        <Choices
          id={id}
          name={name}
          value={value}
          items={choices.functions.map((f) => ({ value: f.id, label: f.label }))}
        />
      );
    default: {
      const _exhaustive: never = kind;
      throw new Error(`Unhandled ESG field kind: ${_exhaustive}`);
    }
  }
}
