"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Papa from "papaparse";
import { btnOutlinedSm } from "@/lib/buttonStyles";
import { CONTRACT_TYPES, formatNight } from "@/lib/hotels";
import { rangeEndFor } from "@/lib/dateRange";

const fieldClass =
  "block rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white px-2 py-1.5";

const labelClass = "text-xs font-medium text-gray-500 dark:text-gray-400";

function useSetParam() {
  const router = useRouter();
  const sp = useSearchParams();
  const setMany = (values: Record<string, string>) => {
    const params = new URLSearchParams(sp.toString());
    for (const [key, value] of Object.entries(values)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.push(`/hotels/reports?${params.toString()}`);
  };
  const set = (key: string, value: string) => setMany({ [key]: value });
  return { sp, set, setMany };
}

function SeriesAndDates({ series }: { series: { id: string; name: string }[] }) {
  const { sp, set, setMany } = useSetParam();
  const from = sp.get("from") ?? "";
  return (
    <>
      <label className={labelClass}>
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
      <label className={labelClass}>
        From
        <input
          type="date"
          value={from}
          onChange={(e) => setMany({ from: e.target.value, to: rangeEndFor(e.target.value, sp.get("to") ?? "", 0, false) })}
          className={fieldClass}
        />
      </label>
      <label className={labelClass}>
        To
        <input type="date" value={sp.get("to") ?? ""} min={from || undefined} onChange={(e) => set("to", e.target.value)} className={fieldClass} />
      </label>
    </>
  );
}

export function HotelReportFilters({ series }: { series: { id: string; name: string }[] }) {
  const { sp, set } = useSetParam();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <SeriesAndDates series={series} />
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

export function PatternFilters({ series, cities, guestTypes }: { series: { id: string; name: string }[]; cities: string[]; guestTypes: string[] }) {
  const { sp, set } = useSetParam();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <SeriesAndDates series={series} />
      <label className={labelClass}>
        City
        <select value={sp.get("city") ?? ""} onChange={(e) => set("city", e.target.value)} className={fieldClass}>
          <option value="">All</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Contract
        <select value={sp.get("contract") ?? ""} onChange={(e) => set("contract", e.target.value)} className={fieldClass}>
          <option value="">All</option>
          {CONTRACT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Guests
        <select value={sp.get("guest") ?? ""} onChange={(e) => set("guest", e.target.value)} className={fieldClass}>
          <option value="">All</option>
          {guestTypes.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function ShowBlockToggle() {
  const { sp, set } = useSetParam();
  return (
    <label className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
      <input
        type="checkbox"
        checked={sp.get("block") === "1"}
        onChange={(e) => set("block", e.target.checked ? "1" : "")}
        className="rounded border-gray-300 dark:border-gray-600"
      />
      Show block
    </label>
  );
}

export function ProposalControls({
  events,
  selected,
}: {
  events: { id: string; name: string; startDate: string }[];
  // The event id the block is dated from, or "custom".
  selected: string;
}) {
  const { sp, set, setMany } = useSetParam();
  // Typed numbers commit on blur / Enter so each keystroke isn't a history entry.
  const commit = (key: string) => (e: React.FocusEvent<HTMLInputElement> | React.KeyboardEvent<HTMLInputElement>) => {
    if ("key" in e && e.key !== "Enter") return;
    if (e.currentTarget.value !== (sp.get(key) ?? "")) set(key, e.currentTarget.value);
  };
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className={labelClass}>
        Basis
        <select value={sp.get("basis") ?? ""} onChange={(e) => set("basis", e.target.value)} className={fieldClass}>
          <option value="">Average pickup per night</option>
          <option value="highest">Highest pickup per night</option>
          <option value="latest">Most recent event&apos;s pickup</option>
        </select>
      </label>
      <label className={labelClass}>
        Adjust ± %
        <input
          key={sp.get("adjust") ?? ""}
          type="number"
          step={5}
          defaultValue={sp.get("adjust") ?? ""}
          onBlur={commit("adjust")}
          onKeyDown={commit("adjust")}
          placeholder="0"
          className={`${fieldClass} w-20`}
        />
      </label>
      <label className={labelClass}>
        Event
        <select
          value={selected}
          onChange={(e) => setMany({ for: e.target.value, start: "", end: "" })}
          className={`${fieldClass} max-w-xs`}
        >
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.name} · {formatNight(ev.startDate)}
            </option>
          ))}
          <option value="custom">Custom dates</option>
        </select>
      </label>
      {selected === "custom" && (
        <>
          <label className={labelClass}>
            Start
            <input
              type="date"
              value={sp.get("start") ?? ""}
              onChange={(e) => setMany({ start: e.target.value, end: rangeEndFor(e.target.value, sp.get("end") ?? "") })}
              className={fieldClass}
            />
          </label>
          <label className={labelClass}>
            End
            <input type="date" value={sp.get("end") ?? ""} min={sp.get("start") || undefined} onChange={(e) => set("end", e.target.value)} className={fieldClass} />
          </label>
        </>
      )}
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
      className={`${btnOutlinedSm} disabled:opacity-50`}
    >
      CSV
    </button>
  );
}
