"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

// The `?step=` filter a list page applied (from the event overview's workflow
// counts), with a way to drop it and keep the other filters.
export function StepFilterChip({ label }: { label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const clear = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("step");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
      <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
        Workflow step: {label}
        <button type="button" onClick={clear} aria-label="Clear workflow step filter" className="ml-1 text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-200">
          ×
        </button>
      </span>
    </div>
  );
}
