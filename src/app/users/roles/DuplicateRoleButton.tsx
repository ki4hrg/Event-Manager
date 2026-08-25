"use client";

import { useTransition } from "react";

type Props = {
  duplicate: () => Promise<void>;
};

export function DuplicateRoleButton({ duplicate }: Props) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(async () => { await duplicate(); })}
      className="text-blue-600 dark:text-blue-400 hover:underline text-sm disabled:opacity-50"
    >
      {isPending ? "Duplicating..." : "Duplicate"}
    </button>
  );
}
