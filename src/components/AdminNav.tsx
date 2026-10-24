"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AdminNavGroup } from "@/lib/adminNav";
import { labelMicroCaps } from "@/lib/reportStyles";
import {
  activeHref,
  SideNavGroups,
  SideNavLinks,
  sideNavHeadingClass,
  sideNavOptions,
  SideNavSelect,
  sideNavSelectClass,
} from "./SideNav";

const SETTINGS_SEARCH_PATH = "/settings/search";

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
        className={`${sideNavSelectClass} placeholder:text-gray-400 dark:placeholder:text-gray-500`}
      />
    </form>
  );
}

// Grouped admin nav: a select below `sm`, a side nav from `sm` up. Groups and
// their gating come from the server (adminNavGroups). Admin pages come first;
// option lists follow under their own heading, one collapsible group per area.
export function AdminNav({ groups, search }: { groups: AdminNavGroup[]; search: boolean }) {
  const pathname = usePathname();
  const active = activeHref(groups, pathname);
  const pageGroups = groups.filter((g) => g.kind === "page");
  const listGroups = groups.filter((g) => g.kind === "list");

  return (
    <aside className="space-y-4 sm:w-56 sm:shrink-0">
      {search && (
        <Suspense fallback={null}>
          <SettingsSearch />
        </Suspense>
      )}
      <SideNavSelect label="Admin page" active={active} placeholder={pathname === SETTINGS_SEARCH_PATH ? "Search results" : undefined}>
        {pageGroups.map((g) => sideNavOptions(g))}
        {listGroups.map((g) => sideNavOptions(g, `Lists · ${g.label}`))}
      </SideNavSelect>
      <nav aria-label="Admin" className="hidden sm:block">
        <SideNavGroups groups={pageGroups} active={active} />
        {listGroups.length > 0 && (
          <div className="mt-4 border-t border-gray-200 dark:border-gray-800 pt-4">
            <p className={`${labelMicroCaps} px-3 pb-2`}>Lists</p>
            <div className="space-y-1">
              {listGroups.map((g) => (
                // The group holding the current page opens; the rest close as
                // the path moves on. A group opened by hand stays open meanwhile.
                <details key={g.label} open={g.links.some((l) => l.href === active)} className="group">
                  <summary
                    className={`${sideNavHeadingClass} flex cursor-pointer list-none items-center justify-between rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 [&::-webkit-details-marker]:hidden`}
                  >
                    {g.label}
                    <span aria-hidden className="text-gray-400 dark:text-gray-500 transition-transform group-open:rotate-90">
                      ›
                    </span>
                  </summary>
                  <SideNavLinks links={g.links} active={active} />
                </details>
              ))}
            </div>
          </div>
        )}
      </nav>
    </aside>
  );
}
