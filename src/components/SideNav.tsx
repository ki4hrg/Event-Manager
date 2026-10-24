"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

// A grouped section nav (the admin area, inventory): a select below `sm`, a
// side nav from `sm` up. A group holding just its own page renders as that one
// link; any other group is a heading over its links, indented under a rule.

export type SideNavLink = { label: string; href: string };
export type SideNavGroup = { label: string; links: SideNavLink[] };

export const sideNavSelectClass =
  "w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm";
export const sideNavHeadingClass = "px-3 py-1.5 text-sm font-semibold text-gray-900 dark:text-white";

// The deepest link the path sits under (/users/roles/x → Roles, not Users).
export function activeHref(groups: SideNavGroup[], pathname: string): string | null {
  let best: string | null = null;
  for (const { links } of groups) {
    for (const { href } of links) {
      if ((pathname === href || pathname.startsWith(`${href}/`)) && (!best || href.length > best.length)) best = href;
    }
  }
  return best;
}

export const isSingle = (g: SideNavGroup) => g.links.length === 1 && g.links[0].label === g.label;

function linkClass(isActive: boolean, nested: boolean) {
  return `block rounded-md px-3 py-1.5 text-sm ${
    isActive
      ? "bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium"
      : nested
        ? "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
        : "font-medium text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
  }`;
}

export function SideNavLinks({ links, active }: { links: SideNavLink[]; active: string | null }) {
  return (
    <ul className="ml-3 mt-0.5 space-y-0.5 border-l border-gray-200 dark:border-gray-700 pl-2">
      {links.map((l) => (
        <li key={l.href}>
          <Link href={l.href} aria-current={l.href === active ? "page" : undefined} className={linkClass(l.href === active, true)}>
            {l.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

// The desktop list of groups: single links, then headings over their links.
export function SideNavGroups({ groups, active }: { groups: SideNavGroup[]; active: string | null }) {
  return (
    <div className="space-y-1">
      {groups.map((g) =>
        isSingle(g) ? (
          <Link
            key={g.label}
            href={g.links[0].href}
            aria-current={g.links[0].href === active ? "page" : undefined}
            className={linkClass(g.links[0].href === active, false)}
          >
            {g.label}
          </Link>
        ) : (
          <div key={g.label}>
            <p className={sideNavHeadingClass}>{g.label}</p>
            <SideNavLinks links={g.links} active={active} />
          </div>
        ),
      )}
    </div>
  );
}

// One group's entries in the mobile select.
export function sideNavOptions(g: SideNavGroup, label = g.label) {
  return isSingle(g) ? (
    <option key={g.label} value={g.links[0].href}>
      {g.label}
    </option>
  ) : (
    <optgroup key={g.label} label={label}>
      {g.links.map((l) => (
        <option key={l.href} value={l.href}>
          {l.label}
        </option>
      ))}
    </optgroup>
  );
}

// The mobile select; `children` are its options (sideNavOptions).
export function SideNavSelect({
  label,
  active,
  placeholder = "Go to…",
  children,
}: {
  label: string;
  active: string | null;
  placeholder?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <select aria-label={label} value={active ?? ""} onChange={(e) => router.push(e.target.value)} className={`${sideNavSelectClass} sm:hidden`}>
      {!active && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {children}
    </select>
  );
}

// The plain nav: groups only.
export function SideNav({ label, groups }: { label: string; groups: SideNavGroup[] }) {
  const active = activeHref(groups, usePathname());
  return (
    <aside className="space-y-4 sm:w-56 sm:shrink-0">
      <SideNavSelect label={label} active={active}>
        {groups.map((g) => sideNavOptions(g))}
      </SideNavSelect>
      <nav aria-label={label} className="hidden sm:block">
        <SideNavGroups groups={groups} active={active} />
      </nav>
    </aside>
  );
}
