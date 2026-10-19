"use client";

import { useEffect, useRef } from "react";
import type { TableColumnDef } from "@/lib/tableColumns";

type ColumnPickerProps<K extends string> = {
  columns: readonly TableColumnDef<K>[];
  hidden: Set<K>;
  onToggle: (key: K, hide: boolean) => void;
  onShowAll: () => void;
};

export function ColumnPicker<K extends string>({ columns, hidden, onToggle, onShowAll }: ColumnPickerProps<K>) {
  const ref = useRef<HTMLDetailsElement>(null);
  const hideable = columns.filter((c) => !c.required);

  // Close on an outside click, like a menu.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const el = ref.current;
      if (el?.open && !el.contains(e.target as Node)) el.open = false;
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  if (hideable.length === 0) return null;

  return (
    <details ref={ref} className="relative print:hidden">
      <summary className="list-none marker:hidden cursor-pointer select-none px-3 py-1 text-sm text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800">
        Columns{hidden.size > 0 ? ` (${hidden.size} hidden)` : ""} ▾
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-56 max-h-80 overflow-y-auto rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1">
        {hideable.map((c) => (
          <label
            key={c.key}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={!hidden.has(c.key)}
              onChange={(e) => onToggle(c.key, !e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            {c.label}
          </label>
        ))}
        {hidden.size > 0 && (
          <button
            type="button"
            onClick={onShowAll}
            className="w-full text-left px-3 py-1.5 mt-1 text-sm text-blue-600 dark:text-blue-400 border-t border-gray-200 dark:border-gray-700 hover:underline"
          >
            Show all
          </button>
        )}
      </div>
    </details>
  );
}
