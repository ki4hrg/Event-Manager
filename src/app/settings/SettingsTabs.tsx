"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Functions", segment: "functions" },
  { label: "Presentations", segment: "presentations" },
  { label: "Contacts", segment: "contacts" },
  { label: "Catering", segment: "catering" },
  { label: "Equipment", segment: "equipment" },
  { label: "Vendors", segment: "vendors" },
  { label: "Files", segment: "files" },
  { label: "Status", segment: "status" },
  { label: "Email", segment: "email" },
];

export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
      <nav className="-mb-px flex gap-6">
        {tabs.map(({ label, segment }) => {
          const href = `/settings/${segment}`;
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={segment}
              href={href}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? "border-blue-600 dark:border-blue-400 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
