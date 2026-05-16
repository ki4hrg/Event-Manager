"use client";

import { Children, isValidElement, useRef } from "react";
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
  const tabListRef = useRef<HTMLDivElement>(null);

  const currentParam = searchParams.get("tab");
  const activeId = currentParam && tabs.some((t) => t.id === currentParam) ? currentParam : initialId;

  function selectTab(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function handleKeyDown(e: React.KeyboardEvent, idx: number) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const delta = e.key === "ArrowLeft" ? -1 : 1;
    const next = (idx + delta + tabs.length) % tabs.length;
    selectTab(tabs[next].id);
    const buttons = tabListRef.current?.querySelectorAll<HTMLButtonElement>("[role=tab]");
    buttons?.[next]?.focus();
  }

  const panels = Children.toArray(children).filter(isValidElement);
  const active = tabs.find((t) => t.id === activeId);

  return (
    <div>
      <div
        ref={tabListRef}
        role="tablist"
        aria-label="Dashboard reports"
        className="flex gap-1 overflow-x-auto snap-x mb-4 border-b border-gray-200 dark:border-gray-700 print:hidden"
      >
        {tabs.map((tab, idx) => {
          const selected = tab.id === activeId;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              id={`tab-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              className={`shrink-0 snap-start whitespace-nowrap px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
                selected
                  ? "border-blue-600 text-blue-700 dark:text-blue-300 font-medium"
                  : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              }`}
            >
              {tab.title}
            </button>
          );
        })}
      </div>

      {active && (
        <div className="flex items-center justify-end mb-4 print:hidden">
          <a
            href={active.printHref}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            Print / Save PDF
          </a>
        </div>
      )}

      {panels.map((panel, idx) => {
        const id = tabs[idx]?.id ?? String(idx);
        const selected = id === activeId;
        return (
          <div
            key={id}
            role="tabpanel"
            id={`panel-${id}`}
            aria-labelledby={`tab-${id}`}
            hidden={!selected}
          >
            {panel}
          </div>
        );
      })}
    </div>
  );
}
