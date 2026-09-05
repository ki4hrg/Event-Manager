"use client";

import { useTransition } from "react";
import { switchTenant } from "@/app/account/tenant-actions";

type Props = {
  tenants: { id: string; name: string }[];
  activeId: string;
};

// Header control for users who belong to more than one organization. A plain
// <select> so it works at 360 px and needs no dropdown state of its own.
export function TenantSwitcher({ tenants, activeId }: Props) {
  const [pending, startTransition] = useTransition();
  return (
    <select
      aria-label="Organization"
      value={activeId}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        if (next === activeId) return;
        startTransition(async () => {
          await switchTenant(next);
        });
      }}
      className="max-w-[12rem] truncate text-sm border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
    >
      {tenants.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}
