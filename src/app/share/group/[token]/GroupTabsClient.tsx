"use client";

import { Children, isValidElement, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

type TabDescriptor = {
  id: string;
  title: string;
  printHref: string;
};

type GroupTabsClientProps = {
  tabs: TabDescriptor[];
  initialId: string;
  children: React.ReactNode;
};

export function GroupTabsClient({ tabs, initialId, children }: GroupTabsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const currentParam = searchParams.get("tab");
  const activeId = currentParam && tabs.some((t) => t.id === currentParam) ? currentParam : initialId;
  const active = tabs.find((t) => t.id === activeId);

  function selectTab(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    setMenuOpen(false);
    triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!menuOpen) return;
    function handlePointer(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  const panels = Children.toArray(children).filter(isValidElement);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 print:hidden">
        <div ref={menuRef} className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Report:
          </span>
          <div className="relative">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            <span className="font-medium text-gray-900 dark:text-white">
              {active?.title ?? "Reports"}
            </span>
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-gray-600 dark:text-gray-300"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {menuOpen && (
            <ul
              role="menu"
              aria-label="Dashboard reports"
              className="absolute left-0 top-full mt-1 z-20 min-w-full max-h-80 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1"
            >
              {tabs.map((tab) => {
                const selected = tab.id === activeId;
                return (
                  <li key={tab.id} role="none">
                    <button
                      role="menuitem"
                      type="button"
                      aria-current={selected ? "true" : undefined}
                      onClick={() => selectTab(tab.id)}
                      className={`block w-full text-left px-4 py-2 text-sm whitespace-nowrap ${
                        selected
                          ? "bg-blue-50 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      }`}
                    >
                      {tab.title}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          </div>
        </div>
        {active && (
          <a
            href={active.printHref}
            className="shrink-0 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            Print / Save PDF
          </a>
        )}
      </div>

      {panels.map((panel, idx) => {
        const id = tabs[idx]?.id ?? String(idx);
        const selected = id === activeId;
        return (
          <div key={id} id={`panel-${id}`} hidden={!selected}>
            {panel}
          </div>
        );
      })}
    </div>
  );
}
