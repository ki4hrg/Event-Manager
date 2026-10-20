"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";

// The event's hotel areas: the default "Add hotels" filter and APEX location
// for its RFPs (an RFP can set its own).
export function EventHotelAreas({
  areas: initial,
  options,
  save,
}: {
  areas: string[];
  options: { label: string; region: string | null }[];
  save: (areas: string[]) => Promise<void>;
}) {
  const router = useRouter();
  const canWrite = useCanWrite("HOTELS");
  const [editing, setEditing] = useState(false);
  const [areas, setAreas] = useState(new Set(initial));
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Hotel areas: <span className="text-gray-900 dark:text-white">{initial.length ? initial.join(", ") : "Any"}</span>
        {canWrite && (
          <button type="button" onClick={() => setEditing(true)} className="ml-2 text-blue-600 dark:text-blue-400 hover:underline">
            Edit
          </button>
        )}
      </p>
    );
  }
  const regions = Array.from(new Set(options.map((o) => o.region)));
  return (
    <div className="space-y-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Hotel areas</p>
      {regions.map((region) => (
        <div key={region ?? "__blank__"} className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {region && <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{region}</span>}
          {options
            .filter((o) => o.region === region)
            .map((o) => (
              <label key={o.label} className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={areas.has(o.label)}
                  onChange={(e) =>
                    setAreas((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(o.label);
                      else next.delete(o.label);
                      return next;
                    })
                  }
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                {o.label}
              </label>
            ))}
        </div>
      ))}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await save(Array.from(areas));
              setEditing(false);
              router.refresh();
            })
          }
          className={`${btnPrimary} disabled:opacity-50`}
        >
          {pending ? "Saving..." : "Save"}
        </button>
        <button type="button" onClick={() => setEditing(false)} className={btnSecondary}>
          Cancel
        </button>
      </div>
    </div>
  );
}
