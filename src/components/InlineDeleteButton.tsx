"use client";

import type { PermissionResource } from "@prisma/client";
import { InlineConfirmButton } from "@/components/InlineConfirmButton";
import type { UserError } from "@/lib/userErrors";

type InlineDeleteButtonProps = {
  // A refusal (returned { error } or a throw) shows beside the buttons (#252).
  action: (formData: FormData) => Promise<void | UserError>;
  hiddenInputs: Record<string, string>;
  label?: string;
  // Required — see the notes in DeleteButton.
  resource: PermissionResource;
  requiredLevel?: "WRITE" | "DELETE";
};

// FormData flavour of InlineConfirmButton: the action gets `hiddenInputs` as a form.
export function InlineDeleteButton({ action, hiddenInputs, label = "Delete", resource, requiredLevel = "DELETE" }: InlineDeleteButtonProps) {
  return (
    <InlineConfirmButton
      label={label}
      resource={resource}
      requiredLevel={requiredLevel}
      fallback="Couldn't delete. Try again."
      onConfirm={() => {
        const formData = new FormData();
        for (const [name, value] of Object.entries(hiddenInputs)) formData.append(name, value);
        return action(formData);
      }}
    />
  );
}
