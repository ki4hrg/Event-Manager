"use client";

import { useRouter, useSearchParams } from "next/navigation";

type HideEmptyToggleProps = {
  eventId: string;
  hideEmpty: boolean;
};

export function HideEmptyToggle({ eventId, hideEmpty }: HideEmptyToggleProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function toggle() {
    const params = new URLSearchParams(searchParams.toString());
    if (hideEmpty) {
      params.delete("hideEmpty");
    } else {
      params.set("hideEmpty", "1");
    }
    router.push(`/events/${eventId}/agenda?${params.toString()}`);
  }

  return (
    <button
      onClick={toggle}
      className={`text-sm px-3 py-1.5 rounded border transition-colors ${
        hideEmpty
          ? "border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
          : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500"
      }`}
    >
      {hideEmpty ? "Showing used rooms only" : "Show used rooms only"}
    </button>
  );
}
