"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { useClickOutside } from "@/lib/useClickOutside";

type TabLink = { type: "link"; label: string; segment: string | null };
type TabGroup = {
  type: "group";
  label: string;
  children: { label: string; segment: string }[];
};
type TabItem = TabLink | TabGroup;

const tabs: TabItem[] = [
  { type: "link", label: "Overview", segment: null },
  {
    type: "group",
    label: "Schedule",
    children: [
      { label: "Agenda", segment: "agenda" },
      { label: "Function List", segment: "functions" },
      { label: "Breakouts", segment: "breakout-schedule" },
    ],
  },
  { type: "link", label: "Presentations", segment: "presentations" },
  {
    type: "group",
    label: "Orders",
    children: [
      { label: "AV Orders", segment: "av-orders" },
      { label: "Catering Orders", segment: "catering-orders" },
      { label: "Setup Orders", segment: "setup-orders" },
    ],
  },
  { type: "link", label: "Vendors", segment: "vendors" },
  { type: "link", label: "Files", segment: "files" },
];

type EventTabsProps = {
  eventId: string;
};

export function EventTabs({ eventId }: EventTabsProps) {
  const pathname = usePathname();
  const basePath = `/events/${eventId}`;
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  useClickOutside(navRef, () => setOpenGroup(null));

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 mb-6" ref={navRef}>
      <nav className="-mb-px flex gap-6">
        {tabs.map((tab) => {
          if (tab.type === "link") {
            const href = tab.segment ? `${basePath}/${tab.segment}` : basePath;
            const isActive = tab.segment
              ? pathname === href || pathname.startsWith(`${href}/`)
              : pathname === basePath;
            return (
              <Link
                key={tab.label}
                href={href}
                onClick={() => setOpenGroup(null)}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
                }`}
              >
                {tab.label}
              </Link>
            );
          }

          const isGroupActive = tab.children.some(({ segment }) =>
            pathname === `${basePath}/${segment}` ||
            pathname.startsWith(`${basePath}/${segment}/`)
          );
          const isOpen = openGroup === tab.label;

          return (
            <div key={tab.label} className="relative">
              <button
                onClick={() => setOpenGroup(isOpen ? null : tab.label)}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1 ${
                  isGroupActive
                    ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
                }`}
              >
                {tab.label}
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-44 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg z-50">
                  {tab.children.map(({ label, segment }) => {
                    const href = `${basePath}/${segment}`;
                    const isActive =
                      pathname === href || pathname.startsWith(`${href}/`);
                    return (
                      <Link
                        key={segment}
                        href={href}
                        onClick={() => setOpenGroup(null)}
                        className={`block px-4 py-2 text-sm ${
                          isActive
                            ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"
                            : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        }`}
                      >
                        {label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}
