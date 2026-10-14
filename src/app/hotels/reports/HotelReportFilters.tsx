"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Papa from "papaparse";

const fieldClass =
  "block rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white px-2 py-1.5";

export function HotelReportFilters({ series }: { series: { id: string; name: string }[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const set = (key: string, value: string) => {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/hotels/reports?${params.toString()}`);
  };
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
        Series
        <select value={sp.get("series") ?? ""} onChange={(e) => set("series", e.target.value)} className={fieldClass}>
          <option value="">All</option>
          <option value="__blank__">No series</option>
          {series.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
        From
        <input type="date" value={sp.get("from") ?? ""} onChange={(e) => set("from", e.target.value)} className={fieldClass} />
      </label>
      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
        To
        <input type="date" value={sp.get("to") ?? ""} onChange={(e) => set("to", e.target.value)} className={fieldClass} />
      </label>
      <label className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300 pb-1.5">
        <input
          type="checkbox"
          checked={sp.get("byHotel") === "1"}
          onChange={(e) => set("byHotel", e.target.checked ? "1" : "")}
          className="rounded border-gray-300 dark:border-gray-600"
        />
        By hotel
      </label>
    </div>
  );
}

export function CsvButton({ fileName, rows }: { fileName: string; rows: Record<string, string | number | null>[] }) {
  return (
    <button
      type="button"
      disabled={rows.length === 0}
      onClick={() => {
        const blob = new Blob([Papa.unparse(rows)], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      }}
      className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50"
    >
      CSV
    </button>
  );
}
