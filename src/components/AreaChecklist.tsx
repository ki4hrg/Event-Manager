"use client";

import { useState } from "react";
import type { AreaOption, AreaScope } from "@/lib/areas";

// Pick whole regions or single areas within them. Posts `regions` and
// `areas` inputs, so it drops into a form; onChange serves forms that save
// another way. An area inside a picked region is implied, not stored.
export function AreaChecklist({
  regions,
  areas,
  value,
  onChange,
}: {
  regions: string[];
  areas: AreaOption[];
  value: AreaScope;
  onChange?: (scope: AreaScope) => void;
}) {
  const [scope, setScope] = useState(value);
  const set = (next: AreaScope) => {
    setScope(next);
    onChange?.(next);
  };
  const toggle = (list: string[], item: string, on: boolean) => (on ? [...list, item] : list.filter((x) => x !== item));
  const groups: (string | null)[] = [...regions, ...(areas.some((a) => !a.region || !regions.includes(a.region)) ? [null] : [])];
  const check = "rounded border-gray-300 dark:border-gray-600";
  const label = "flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300";

  return (
    <div className="space-y-2">
      {scope.regions.map((r) => (
        <input key={`r-${r}`} type="hidden" name="regions" value={r} />
      ))}
      {scope.areas.map((a) => (
        <input key={`a-${a}`} type="hidden" name="areas" value={a} />
      ))}
      {groups.map((region) => {
        const inGroup = areas.filter((a) => (region ? a.region === region : !a.region || !regions.includes(a.region)));
        const whole = region != null && scope.regions.includes(region);
        return (
          <div key={region ?? "__blank__"} className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {region ? (
              <label className={`${label} font-medium`}>
                <input
                  type="checkbox"
                  checked={whole}
                  onChange={(e) =>
                    set({
                      regions: toggle(scope.regions, region, e.target.checked),
                      // Picking the region covers its areas; drop them as separate picks.
                      areas: e.target.checked ? scope.areas.filter((a) => !inGroup.some((g) => g.label === a)) : scope.areas,
                    })
                  }
                  className={check}
                />
                {region} (all)
              </label>
            ) : (
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">No region</span>
            )}
            {inGroup.map((a) => (
              <label key={a.label} className={`${label} ${whole ? "opacity-60" : ""}`}>
                <input
                  type="checkbox"
                  disabled={whole}
                  checked={whole || scope.areas.includes(a.label)}
                  onChange={(e) => set({ ...scope, areas: toggle(scope.areas, a.label, e.target.checked) })}
                  className={check}
                />
                {a.label}
              </label>
            ))}
          </div>
        );
      })}
    </div>
  );
}
