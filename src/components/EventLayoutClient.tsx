"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { EventSidebar, HamburgerIcon } from "@/components/EventSidebar";

type EventLayoutClientProps = {
  eventId: string;
  eventName: string;
  deniedResources: string[];
  header: React.ReactNode;
  children: React.ReactNode;
};

export function EventLayoutClient({
  eventId,
  eventName,
  deniedResources,
  header,
  children,
}: EventLayoutClientProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname() ?? "";
  const isPrintView = pathname.endsWith("/print") || pathname.endsWith("/table-print");

  if (isPrintView) {
    return (
      <main className="flex-1 min-w-0 py-8 px-4 print:p-0 print:bg-white">
        <div className="max-w-5xl mx-auto bg-white dark:bg-gray-800 shadow-lg rounded print:shadow-none print:rounded-none print:max-w-none print:bg-white">
          {children}
        </div>
      </main>
    );
  }

  return (
    <>
      <div className="print:hidden">{header}</div>
      <div className="flex flex-1 min-h-0">
        <EventSidebar
          eventId={eventId}
          eventName={eventName}
          deniedResources={deniedResources}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />
        <div className="flex flex-col flex-1 min-w-0">
          <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 print:hidden">
            <button
              onClick={() => setMobileOpen(true)}
              className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              aria-label="Open navigation"
            >
              <HamburgerIcon />
            </button>
            <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {eventName}
            </span>
          </div>
          <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8 min-w-0">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
