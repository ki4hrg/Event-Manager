"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Users", href: "/users" },
  { label: "Roles", href: "/users/roles" },
  { label: "API Keys", href: "/users/api-keys" },
];

export function UsersTabs() {
  const pathname = usePathname();

  // Sub-page hrefs (/users/roles, /users/api-keys) match by exact-or-startsWith.
  // The bare /users tab matches only when no other tab does — pathname /users/new
  // and /users/[id] are user-list children, so the Users tab stays active there.
  const subPaths = tabs.filter((t) => t.href !== "/users").map((t) => t.href);
  const onSubPath = subPaths.some((h) => pathname === h || pathname.startsWith(`${h}/`));

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
      <nav className="-mb-px flex gap-6 overflow-x-auto">
        {tabs.map(({ label, href }) => {
          const isActive =
            href === "/users"
              ? !onSubPath
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
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
