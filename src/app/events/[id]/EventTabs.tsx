"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type EventTabsProps = {
  eventId: string;
};

const tabs = [
  { label: "Schedule", segment: null },
  { label: "Agenda", segment: "agenda" },
  { label: "Presentations", segment: "presentations" },
  { label: "Breakout", segment: "breakout-schedule" },
  { label: "AV Orders", segment: "av-orders" },
  { label: "Catering Orders", segment: "catering-orders" },
  { label: "Setup Orders", segment: "setup-orders" },
  { label: "Vendors", segment: "vendors" },
];

export function EventTabs({ eventId }: EventTabsProps) {
  const pathname = usePathname();
  const basePath = `/events/${eventId}`;

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
      <nav className="-mb-px flex gap-6">
        {tabs.map(({ label, segment }) => {
          const href = segment ? `${basePath}/${segment}` : basePath;
          const isActive = segment
            ? pathname === href || pathname.startsWith(`${href}/`)
            : pathname === basePath;
          return (
            <Link
              key={label}
              href={href}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
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
