"use client";

import { useFormStatus } from "react-dom";
import type { PermissionResource } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";
import { btnPrimary } from "@/lib/buttonStyles";
import { ActionForm, ActionFormError } from "@/components/FormError";
import type { UserError } from "@/lib/userErrors";

function Submit({ reissue }: { reissue: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${btnPrimary} disabled:opacity-50`}>
      {pending ? "Issuing..." : reissue ? "Reissue" : "Issue"}
    </button>
  );
}

// Renders the .docx, files it on the RFP, and marks the RFP issued.
export function IssueRfpButton({ action, resource, reissue }: { action: () => Promise<void | UserError>; resource: PermissionResource; reissue: boolean }) {
  const canWrite = useCanWrite(resource);
  const canFile = useCanWrite("FILES");
  if (!canWrite || !canFile) return null;
  return (
    <ActionForm action={() => action()}>
      <Submit reissue={reissue} />
      <ActionFormError className="mt-2" />
    </ActionForm>
  );
}
