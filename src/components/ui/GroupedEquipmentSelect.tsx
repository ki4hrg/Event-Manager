"use client";

import type { Equipment } from "@prisma/client";

export function GroupedEquipmentSelect({
  name = "equipmentId",
  options,
  defaultValue,
  placeholder = "— None —",
  size = "sm",
}: {
  name?: string;
  options: Equipment[];
  defaultValue?: string | null;
  placeholder?: string;
  size?: "sm" | "md";
}) {
  const groups = options.reduce((acc, e) => {
    const cat = e.category || "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(e);
    return acc;
  }, {} as Record<string, Equipment[]>);

  const padding = size === "md" ? "px-3 py-1.5" : "px-2 py-1";

  return (
    <select
      name={name}
      defaultValue={defaultValue || ""}
      className={`w-full ${padding} border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white`}
    >
      <option value="">{placeholder}</option>
      {Object.entries(groups).map(([cat, items]) => (
        <optgroup key={cat} label={cat}>
          {items.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
