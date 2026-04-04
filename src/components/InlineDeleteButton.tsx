"use client";

import { useRef } from "react";

type InlineDeleteButtonProps = {
  action: (formData: FormData) => Promise<void>;
  hiddenInputs: Record<string, string>;
  confirmMessage?: string;
  label?: string;
};

export function InlineDeleteButton({
  action,
  hiddenInputs,
  confirmMessage = "Are you sure you want to delete this?",
  label = "Delete",
}: InlineDeleteButtonProps) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={(e) => {
        if (!confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      {Object.entries(hiddenInputs).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button type="submit" className="text-red-600 hover:underline text-sm">
        {label}
      </button>
    </form>
  );
}
