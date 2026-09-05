"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useClickOutside } from "@/lib/useClickOutside";

type AdminDropdownProps = {
  canViewUsers: boolean;
  canViewEquipment: boolean;
  canViewSettings: boolean;
  canViewSystem: boolean;
  canViewWorkflows: boolean;
  canViewTenants: boolean;
};

export function AdminDropdown({
  canViewUsers,
  canViewEquipment,
  canViewSettings,
  canViewSystem,
  canViewWorkflows,
  canViewTenants,
}: AdminDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  const linkClass =
    "block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex items-center gap-1"
      >
        Admin
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg z-50">
          {canViewUsers && (
            <Link href="/users" onClick={() => setOpen(false)} className={linkClass}>
              Users
            </Link>
          )}
          {canViewEquipment && (
            <Link href="/equipment" onClick={() => setOpen(false)} className={linkClass}>
              Equipment
            </Link>
          )}
          {canViewSettings && (
            <Link href="/settings" onClick={() => setOpen(false)} className={linkClass}>
              Settings
            </Link>
          )}
          {canViewSystem && (
            <Link href="/system" onClick={() => setOpen(false)} className={linkClass}>
              System
            </Link>
          )}
          {canViewWorkflows && (
            <Link href="/workflows" onClick={() => setOpen(false)} className={linkClass}>
              Workflows
            </Link>
          )}
          {canViewTenants && (
            <Link href="/tenants" onClick={() => setOpen(false)} className={linkClass}>
              Organizations
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
