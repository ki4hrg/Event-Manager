"use client";

import { useState } from "react";

type InlineDeleteButtonProps = {
  action: (formData: FormData) => Promise<void>;
  hiddenInputs: Record<string, string>;
  label?: string;
};

export function InlineDeleteButton({
  action,
  hiddenInputs,
  label = "Delete",
}: InlineDeleteButtonProps) {
  const [confirming, setConfirming] = useState(false);

  async function handleConfirm() {
    const formData = new FormData();
    for (const [name, value] of Object.entries(hiddenInputs)) {
      formData.append(name, value);
    }
    await action(formData);
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-2 text-sm">
        <button
          type="button"
          onClick={handleConfirm}
          className="text-red-600 dark:text-red-400 hover:underline"
        >
          Confirm
        </button>
        <span className="text-gray-300 dark:text-gray-600">·</span>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="text-gray-500 dark:text-gray-400 hover:underline"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="text-red-600 dark:text-red-400 hover:underline text-sm"
    >
      {label}
    </button>
  );
}
