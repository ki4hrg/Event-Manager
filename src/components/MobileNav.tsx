"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useClickOutside } from "@/lib/useClickOutside";
import { TenantSwitcher } from "./TenantSwitcher";

export type HeaderLink = { href: string; label: string };

type MobileNavProps = {
  mainLinks: HeaderLink[];
  adminLinks: HeaderLink[];
  tenants: { id: string; name: string }[];
  activeTenant: { id: string; name: string } | null;
  email: string | null;
  signOutAction: () => Promise<void>;
};

// Below `lg` the header's inline nav doesn't fit (portrait phones hid it
// entirely; landscape phones overflowed it), so everything collapses behind
// one menu button that drops a full-width panel under the header.
export function MobileNav({
  mainLinks,
  adminLinks,
  tenants,
  activeTenant,
  email,
  signOutAction,
}: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  useClickOutside(ref, () => setOpen(false));

  // Close on any navigation, including ones not started from a panel link
  // (e.g. the org switcher's redirect). Adjusting state during render rather
  // than in an effect avoids an extra paint with the stale panel open.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const isActive = (href: string) => pathname === href || pathname?.startsWith(`${href}/`);
  const linkClass = (href: string) =>
    `block rounded-md px-3 py-2.5 text-base ${
      isActive(href)
        ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white font-medium"
        : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
    }`;

  return (
    <div ref={ref} className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        aria-label={open ? "Close menu" : "Open menu"}
        className="-mr-2 p-2 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
      >
        {open ? (
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="w-6 h-6">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="w-6 h-6">
            <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
        )}
      </button>

      {open && (
        <div
          id="mobile-nav-panel"
          className="absolute inset-x-0 top-full z-50 max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg"
        >
          <nav className="px-4 py-3 space-y-1">
            {mainLinks.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className={linkClass(l.href)}>
                {l.label}
              </Link>
            ))}
            {adminLinks.length > 0 && (
              <>
                <p className="px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Admin
                </p>
                {adminLinks.map((l) => (
                  <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className={linkClass(l.href)}>
                    {l.label}
                  </Link>
                ))}
              </>
            )}
          </nav>

          <div className="px-4 py-3 space-y-3 border-t border-gray-200 dark:border-gray-700">
            {activeTenant && tenants.length > 1 ? (
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm text-gray-500 dark:text-gray-400">Organization</span>
                <TenantSwitcher tenants={tenants} activeId={activeTenant.id} />
              </label>
            ) : activeTenant ? (
              <p className="px-3 text-sm text-gray-500 dark:text-gray-400 truncate">{activeTenant.name}</p>
            ) : null}
            <Link
              href="/account"
              onClick={() => setOpen(false)}
              className={`${linkClass("/account")} truncate`}
            >
              {email ?? "Account"}
            </Link>
            <form action={signOutAction}>
              <button
                type="submit"
                className="w-full text-left rounded-md px-3 py-2.5 text-base text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
