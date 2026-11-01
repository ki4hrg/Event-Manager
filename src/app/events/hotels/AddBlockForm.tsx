"use client";

import { useFormStatus } from "react-dom";
import { ActionForm, ActionFormError } from "@/components/FormError";
import type { UserError } from "@/lib/userErrors";
import { useCanWrite } from "@/components/PermissionsProvider";
import { OptionSelect } from "@/components/ui/OptionSelect";
import { btnPrimary } from "@/lib/buttonStyles";

const selectClass =
  "px-2 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${btnPrimary} disabled:opacity-50`}>
      {pending ? "Adding..." : "Add Block"}
    </button>
  );
}

// A block from an accepted proposal, for one guest type; the proposal can
// become several (attendees and staff from one offer).
export function AddBlockForm({
  action,
  guestTypes,
  defaultGuestType,
}: {
  action: (formData: FormData) => Promise<void | UserError>;
  guestTypes: string[];
  defaultGuestType: string | null;
}) {
  if (!useCanWrite("HOTELS")) return null;
  return (
    <ActionForm action={action} className="flex flex-wrap items-center gap-2">
      <OptionSelect aria-label="Guest type" name="guestType" defaultValue={defaultGuestType} options={guestTypes} className={selectClass} />
      <Submit />
      <ActionFormError className="w-full" />
    </ActionForm>
  );
}
