"use client";

import { useFormStatus } from "react-dom";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnPrimary } from "@/lib/buttonStyles";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${btnPrimary} disabled:opacity-50`}>
      {pending ? "Creating..." : "Create Block"}
    </button>
  );
}

export function CreateBlockButton({ action }: { action: () => Promise<void> }) {
  if (!useCanWrite("HOTELS")) return null;
  return (
    <form action={action}>
      <Submit />
    </form>
  );
}
