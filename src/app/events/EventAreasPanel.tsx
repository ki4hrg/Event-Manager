"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AreaChecklist } from "@/components/AreaChecklist";
import type { AreaOption, AreaScope } from "@/lib/areas";
import { btnPrimary } from "@/lib/buttonStyles";

export function EventAreasPanel({
  value,
  regions,
  areas,
  save,
}: {
  value: AreaScope;
  regions: string[];
  areas: AreaOption[];
  save: (scope: AreaScope) => Promise<void>;
}) {
  const router = useRouter();
  const [scope, setScope] = useState(value);
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();
  if (areas.length === 0 && regions.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No hotel regions or areas yet — add them in Settings › Events.</p>;
  }
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6 space-y-4">
      <AreaChecklist
        regions={regions}
        areas={areas}
        value={value}
        onChange={(next) => {
          setScope(next);
          setDirty(true);
        }}
      />
      <button
        type="button"
        disabled={pending || !dirty}
        onClick={() =>
          startTransition(async () => {
            await save(scope);
            setDirty(false);
            router.refresh();
          })
        }
        className={`${btnPrimary} disabled:opacity-50`}
      >
        {pending ? "Saving..." : "Save areas"}
      </button>
    </div>
  );
}
