"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { PermissionResource } from "@prisma/client";
import { useCanWrite } from "@/components/PermissionsProvider";

// One cell of the quote comparison: checked when the quote won the RFP line.
// Checking awards the line to it (from any other quote; needs VENDORS write,
// since its vendor joins the line's order), unchecking leaves the line open.
export function LineAwardToggle({
  checked,
  lineItemId,
  quoteId,
  label,
  action,
  resource,
}: {
  checked: boolean;
  lineItemId: string;
  quoteId: string;
  label: string;
  action: (lineItemIds: string[], quoteId: string | null) => Promise<void>;
  resource: PermissionResource;
}) {
  const router = useRouter();
  const canWrite = useCanWrite(resource);
  const canAssign = useCanWrite("VENDORS");
  const [pending, startTransition] = useTransition();
  if (!canWrite || (!checked && !canAssign)) return checked ? <span className="mr-1 text-green-700 dark:text-green-400">✓</span> : null;
  const toggle = () =>
    startTransition(async () => {
      await action([lineItemId], checked ? null : quoteId);
      router.refresh();
    });
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={pending}
      onChange={toggle}
      aria-label={label}
      title={checked ? "Awarded" : "Award"}
      className="mr-2 align-middle rounded border-gray-300 dark:border-gray-600 disabled:opacity-50"
    />
  );
}
