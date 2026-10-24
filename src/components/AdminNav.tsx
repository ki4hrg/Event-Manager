"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AdminNavGroup } from "@/lib/adminNav";
import { labelMicroCaps } from "@/lib/reportStyles";

const SETTINGS_SEARCH_PATH = "/settings/search";

const selectClass =
  "w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm";

// The deepest link the path sits under (/users/roles/x → Roles, not Users).
function activeHref(groups: AdminNavGroup[], pathname: string): string | null {
  let best: string | null = null;
  for (const { links } of groups) {
    for (const { href } of links) {
      if ((pathname === href || pathname.startsWith(`${href}/`)) && (!best || href.length > best.length)) best = href;
    }
  }
  return best;
}

// A group holding just its own page renders as that one link.
const isSingle = (g: AdminNavGroup) => g.links.length === 1 && g.links[0].label === g.label;

// Submit-style: the query lands in the URL on Enter, not per keystroke.
function SettingsSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const q = pathname === SETTINGS_SEARCH_PATH ? (searchParams.get("q") ?? "") : "";

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const value = ((new FormData(e.currentTarget).get("q") as string) ?? "").trim();
        const params = new URLSearchParams(value ? { q: value } : {});
        router.push(value ? `${SETTINGS_SEARCH_PATH}?${params.toString()}` : SETTINGS_SEARCH_PATH);
      }}
    >
      <input
        key={q}
        type="search"
        name="q"
        defaultValue={q}
        enterKeyHint="search"
        placeholder="Search lists and options"
        aria-label="Search lists and options"
        className={`${selectClass} placeholder:text-gray-400 dark:placeholder:text-gray-500`}
      />
    </form>
  );
}

// Grouped admin nav: a select below `sm`, a side nav from `sm` up. Groups and
// their gating come from the server (adminNavGroups).
export function AdminNav({ groups, search }: { groups: AdminNavGroup[]; search: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const active = activeHref(groups, pathname);

  const linkClass = (href: string) =>
    `block rounded-md px-3 py-1.5 text-sm ${
      href === active
        ? "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium"
        : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
    }`;

  return (
    <aside className="space-y-4 sm:w-52 sm:shrink-0">
      {search && (
        <Suspense fallback={null}>
          <SettingsSearch />
        </Suspense>
      )}
      <select
        aria-label="Settings page"
        value={active ?? ""}
        onChange={(e) => router.push(e.target.value)}
        className={`${selectClass} sm:hidden`}
      >
        {!active && (
          <option value="" disabled>
            {pathname === SETTINGS_SEARCH_PATH ? "Search results" : "Go to…"}
          </option>
        )}
        {groups.map((g) =>
          isSingle(g) ? (
            <option key={g.label} value={g.links[0].href}>
              {g.label}
            </option>
          ) : (
            <optgroup key={g.label} label={g.label}>
              {g.links.map((l) => (
                <option key={l.href} value={l.href}>
                  {l.label}
                </option>
              ))}
            </optgroup>
          ),
        )}
      </select>
      <nav aria-label="Settings" className="hidden sm:block space-y-3">
        {groups.map((g) =>
          isSingle(g) ? (
            <Link key={g.label} href={g.links[0].href} className={linkClass(g.links[0].href)}>
              {g.label}
            </Link>
          ) : (
            <div key={g.label}>
              <p className={`${labelMicroCaps} px-3 mb-1`}>{g.label}</p>
              <ul className="space-y-0.5">
                {g.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className={linkClass(l.href)}>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ),
        )}
      </nav>
    </aside>
  );
}
