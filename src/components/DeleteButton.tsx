"use client";

import { useState } from "react";
import { btnDanger } from "@/lib/buttonStyles";

type DeleteButtonProps = {
  action: () => Promise<void>;
  label?: string;
};

export function DeleteButton({
  action,
  label = "Delete",
}: DeleteButtonProps) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600 dark:text-gray-400">Are you sure?</span>
        <button
          type="button"
          onClick={async () => { setConfirming(false); await action(); }}
          className="px-3 py-1.5 text-sm text-white bg-red-600 rounded-md hover:bg-red-700"
        >
          {label}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className={btnDanger}
    >
      {label}
    </button>
  );
}
