"use client";

import { usePathname, useRouter } from "next/navigation";

// Amenity chips: hotels with every selected one. State lives in ?amenity=.
export function AmenityFilter({ amenities, selected }: { amenities: string[]; selected: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  if (amenities.length === 0) return null;
  const push = (next: string[]) => {
    const params = new URLSearchParams();
    next.forEach((a) => params.append("amenity", a));
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };
  const toggle = (a: string) => push(selected.includes(a) ? selected.filter((x) => x !== a) : [...selected, a]);
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {amenities.map((a) => {
        const on = selected.includes(a);
        return (
          <button
            key={a}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(a)}
            className={`px-3 py-1 rounded-full border text-sm ${
              on
                ? "border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
                : "border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            {a}
          </button>
        );
      })}
      {selected.length > 0 && (
        <button type="button" onClick={() => push([])} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
          Clear
        </button>
      )}
    </div>
  );
}
