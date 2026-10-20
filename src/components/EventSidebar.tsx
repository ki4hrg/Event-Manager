"use client";

import { startTransition, useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PermissionResource } from "@prisma/client";
import {
  getSidebarItems,
  type SidebarSection,
  type SidebarItem,
} from "@/app/events/sidebar-actions";

// ─── Icons ────────────────────────────────────────────────────────────────────

const HomeIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="w-4 h-4 shrink-0">
    <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
  </svg>
);
const CalendarIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="w-4 h-4 shrink-0">
    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
  </svg>
);
const ListIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="w-4 h-4 shrink-0">
    <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
  </svg>
);
const GridIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="w-4 h-4 shrink-0">
    <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM13 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2h-2z" />
  </svg>
);
const ChartIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="w-4 h-4 shrink-0">
    <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11 4a1 1 0 10-2 0v4a1 1 0 102 0V7zm-3 1a1 1 0 10-2 0v3a1 1 0 102 0V8zM8 9a1 1 0 00-2 0v2a1 1 0 102 0V9z" clipRule="evenodd" />
  </svg>
);
const VideoIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="w-4 h-4 shrink-0">
    <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
  </svg>
);
const UtensilsIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="w-4 h-4 shrink-0">
    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v4.586l-1.707 1.707A1 1 0 003 10v7a1 1 0 102 0v-3h2v3a1 1 0 102 0v-7a1 1 0 00-.293-.707L7 7.586V3a1 1 0 00-1-1zm5 0a1 1 0 011 1v3a2 2 0 104 0V3a1 1 0 112 0v3a4 4 0 01-3 3.874V17a1 1 0 11-2 0V9.874A4 4 0 0111 6V3a1 1 0 011-1z" clipRule="evenodd" />
  </svg>
);
const PrinterIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="w-4 h-4 shrink-0">
    <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a1 1 0 001 1h6a1 1 0 001-1v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9H5v-1h1v1zm8-1h-1v1h1v-1zM7 14v2h6v-2H7z" clipRule="evenodd" />
  </svg>
);
const WrenchIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="w-4 h-4 shrink-0">
    <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
  </svg>
);
const BuildingIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="w-4 h-4 shrink-0">
    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
  </svg>
);
const FolderIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="w-4 h-4 shrink-0">
    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
  </svg>
);
const PackageIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="w-4 h-4 shrink-0">
    <path fillRule="evenodd" d="M10 1.293l-7 3.5v10.414l7 3.5 7-3.5V4.793l-7-3.5zM4.118 5.5L10 8.441 15.882 5.5 10 2.559 4.118 5.5zM5 7.118v6.764l4 2v-6.764l-4-2zm6 8.764l4-2V7.118l-4 2v6.764z" clipRule="evenodd" />
  </svg>
);
const ClipboardIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="w-4 h-4 shrink-0">
    <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
    <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
  </svg>
);
const ChecklistIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="w-4 h-4 shrink-0">
    <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
    <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm8.707 4.293a1 1 0 010 1.414l-3.5 3.5a1 1 0 01-1.414 0l-1.5-1.5a1 1 0 111.414-1.414L8.5 12.086l2.793-2.793a1 1 0 011.414 0z" clipRule="evenodd" />
  </svg>
);
const ClockIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="w-4 h-4 shrink-0">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
  </svg>
);
const HandoffIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="w-4 h-4 shrink-0">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
  </svg>
);
const LinkIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="w-4 h-4 shrink-0">
    <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
  </svg>
);
const SlidersIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="w-4 h-4 shrink-0">
    <path d="M5 4a1 1 0 00-2 0v7.268a2 2 0 000 3.464V16a1 1 0 102 0v-1.268a2 2 0 000-3.464V4zM11 4a1 1 0 10-2 0v1.268a2 2 0 000 3.464V16a1 1 0 102 0V8.732a2 2 0 000-3.464V4zM16 3a1 1 0 011 1v7.268a2 2 0 010 3.464V16a1 1 0 11-2 0v-1.268a2 2 0 010-3.464V4a1 1 0 011-1z" />
  </svg>
);
const BedIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="w-4 h-4 shrink-0">
    <path d="M2 5a1 1 0 012 0v6h5V8a1 1 0 011-1h5a3 3 0 013 3v5a1 1 0 11-2 0v-2H4v2a1 1 0 11-2 0V5zm4 1.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" />
  </svg>
);
const BoothIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="w-4 h-4 shrink-0">
    <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
  </svg>
);
const UsersIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="w-4 h-4 shrink-0">
    <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
  </svg>
);
const DownloadIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="w-4 h-4 shrink-0">
    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
  </svg>
);
const DocumentIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="w-4 h-4 shrink-0">
    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
  </svg>
);
const FlagIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="w-4 h-4 shrink-0">
    <path fillRule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 8l2.55 3.4A1 1 0 0116 13H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z" clipRule="evenodd" />
  </svg>
);
const CloseIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="w-5 h-5 shrink-0">
    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
  </svg>
);
const ChevronLeftIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="w-4 h-4 shrink-0">
    <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
  </svg>
);
const ChevronRightIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="w-4 h-4 shrink-0">
    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
  </svg>
);
const InboxIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="w-4 h-4 shrink-0">
    <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm0 2h12v6h-3.38a1 1 0 00-.9.55L11.38 13H8.62l-.34-1.45a1 1 0 00-.9-.55H4V5z" clipRule="evenodd" />
  </svg>
);
export const HamburgerIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="w-5 h-5 shrink-0">
    <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
  </svg>
);

// ─── Nav definition ───────────────────────────────────────────────────────────

type NavLink = {
  type: "link";
  label: string;
  segment: string | null;
  icon: React.ReactNode;
  sidebarSection?: SidebarSection;
  // The resource whose VIEW this link requires. Links without one are always
  // shown: reports and the agenda read across many entities and gate on their
  // own pages, and Overview must stay reachable for anyone who can open the event.
  resource?: PermissionResource;
  // The resource whose WRITE this link requires, for pages that exist only to
  // edit. Import and Settings are edit-only end to end, so a read-only user
  // gets no link rather than a link that redirects them home.
  writeResource?: PermissionResource;
};
type NavGroup = { type: "group"; label: string };
type NavItem = NavLink | NavGroup;

const NAV: NavItem[] = [
  { type: "link",  label: "Overview",        segment: null,                              icon: <HomeIcon /> },
  { type: "group", label: "Schedule" },
  { type: "link",  label: "Agenda",           segment: "agenda",                          icon: <CalendarIcon /> },
  { type: "link",  label: "Schedule Items",   segment: "schedule-items",                  icon: <ClockIcon /> },
  { type: "link",  label: "Functions",        segment: "functions",                       icon: <ListIcon />,      sidebarSection: "functions", resource: "FUNCTIONS" },
  { type: "link",  label: "Breakouts",        segment: "breakout-schedule",               icon: <GridIcon /> },
  { type: "group", label: "Content" },
  { type: "link",  label: "Presentations",    segment: "presentations",                   icon: <ChartIcon />,     sidebarSection: "presentations", resource: "PRESENTATIONS" },
  { type: "link",  label: "Media Deliverables", segment: "media-deliverables",            icon: <VideoIcon />,     sidebarSection: "media-deliverables", resource: "MEDIA_DELIVERABLES" },
  { type: "link",  label: "Exhibits",         segment: "exhibits",                        icon: <BoothIcon />,  resource: "FUNCTIONS" },
  { type: "group", label: "Orders" },
  { type: "link",  label: "Packing List",     segment: "packing",                         icon: <ChecklistIcon />, resource: "SUPPLY_ORDERS" },
  { type: "link",  label: "AV Orders",        segment: "av-orders",                       icon: <VideoIcon />,     sidebarSection: "av-orders", resource: "AV_ORDERS" },
  { type: "link",  label: "Catering Orders",  segment: "catering-orders",                 icon: <UtensilsIcon />,  sidebarSection: "catering-orders", resource: "CATERING_ORDERS" },
  { type: "link",  label: "Print Orders",     segment: "print-orders",                    icon: <PrinterIcon />,   sidebarSection: "print-orders", resource: "PRINT_ORDERS" },
  { type: "link",  label: "Setup Orders",     segment: "setup-orders",                    icon: <WrenchIcon />,    sidebarSection: "setup-orders", resource: "SETUP_ORDERS" },
  { type: "link",  label: "Supply Orders",    segment: "supply-orders",                   icon: <PackageIcon />,   sidebarSection: "supply-orders", resource: "SUPPLY_ORDERS" },
  { type: "group", label: "Resources" },
  { type: "link",  label: "Vendors",          segment: "vendors",                         icon: <BuildingIcon />,  resource: "VENDORS" },
  { type: "link",  label: "Hotels",           segment: "hotels",                          icon: <BedIcon />,  resource: "HOTELS" },
  { type: "link",  label: "Inbox",            segment: "inbox",                           icon: <InboxIcon />, resource: "HOTELS" },
  { type: "link",  label: "Files",            segment: "files",                           icon: <FolderIcon />,    resource: "FILES" },
  { type: "group", label: "Documentation" },
  { type: "link",  label: "Specifications",   segment: "specifications",                  icon: <DocumentIcon />,  resource: "EVENTS" },
  { type: "link",  label: "Post-Event",       segment: "post-event",                      icon: <FlagIcon />,      resource: "EVENTS" },
  { type: "group", label: "Reports" },
  { type: "link",  label: "Event Profile",   segment: "reports/event-profile",           icon: <ChartIcon /> },
  { type: "link",  label: "Event Schedule",   segment: "reports/event-schedule",          icon: <ClockIcon /> },
  { type: "link",  label: "Function Detail",  segment: "reports/function-detail",         icon: <ClipboardIcon /> },
  { type: "link",  label: "Specifications Guide", segment: "reports/esg",                 icon: <DocumentIcon /> },
  { type: "link",  label: "Post-Event Report", segment: "reports/post-event",             icon: <FlagIcon /> },
  { type: "link",  label: "Hotel Information", segment: "reports/hotel-info",             icon: <BedIcon />,  resource: "HOTELS" },
  { type: "link",  label: "Room Schedule",    segment: "reports/room-schedule",           icon: <GridIcon /> },
  { type: "link",  label: "Breakout Grid",    segment: "reports/breakout-grid",           icon: <GridIcon /> },
  { type: "link",  label: "Breakout Assignments", segment: "reports/breakout-assignments", icon: <ClipboardIcon /> },
  { type: "link",  label: "Equipment",        segment: "reports/equipment-responsibility", icon: <ClipboardIcon /> },
  { type: "link",  label: "Packing List",     segment: "reports/packing-list",            icon: <PackageIcon /> },
  { type: "link",  label: "Vendor Handoff",   segment: "reports/vendor-handoff",          icon: <HandoffIcon /> },
  { type: "link",  label: "Share Links",      segment: "share-links",                     icon: <LinkIcon />,      resource: "SHARE_LINKS" },
  { type: "group", label: "Configuration" },
  { type: "link",  label: "Import",           segment: "import",                          icon: <DownloadIcon />,  writeResource: "EVENTS" },
  { type: "link",  label: "Staff",            segment: "staff",                           icon: <UsersIcon /> },
  { type: "link",  label: "Settings",         segment: "settings",                        icon: <SlidersIcon />,   writeResource: "EVENTS" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Hide links the user can't open, then drop any group header left with no links
// under it — a "Orders" heading above nothing reads as a broken page.
function visibleNav(denied: Set<string>, deniedWrite: Set<string>): NavItem[] {
  const kept = NAV.filter(
    (i) =>
      i.type !== "link" ||
      ((!i.resource || !denied.has(i.resource)) &&
        (!i.writeResource || !deniedWrite.has(i.writeResource))),
  );
  // A group owns every link between it and the next group, so "has any link
  // left" is exactly "the item right after it is a link".
  return kept.filter((item, idx) => item.type !== "group" || kept[idx + 1]?.type === "link");
}

function isLinkActive(segment: string | null, pathname: string, basePath: string): boolean {
  if (segment === null) return pathname === basePath;
  const href = `${basePath}/${segment}`;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getActiveSection(pathname: string, basePath: string): SidebarSection | null {
  const sections: SidebarSection[] = [
    "functions",
    "presentations",
    "media-deliverables",
    "av-orders",
    "catering-orders",
    "print-orders",
    "setup-orders",
    "supply-orders",
  ];
  for (const s of sections) {
    const base = `${basePath}/${s}`;
    if (pathname === base || pathname.startsWith(`${base}/`)) return s;
  }
  return null;
}

// ─── SidebarInner (pure rendering, no hooks) ──────────────────────────────────

function SidebarInner({
  eventName,
  basePath,
  pathname,
  collapsed,
  onToggleCollapse,
  onClose,
  currentSection,
  items,
  nav,
}: {
  eventName: string;
  basePath: string;
  pathname: string;
  collapsed: boolean;
  onToggleCollapse?: () => void;
  onClose?: () => void;
  currentSection: SidebarSection | null;
  items: SidebarItem[];
  nav: NavItem[];
}) {
  const hasActiveItems = currentSection !== null && items.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className={`flex items-center shrink-0 h-12 border-b border-gray-200 dark:border-gray-700 ${
          collapsed ? "justify-center px-0" : "justify-between px-3"
        }`}
      >
        {!collapsed && (
          <span
            className="text-sm font-semibold text-gray-900 dark:text-white truncate"
            title={eventName}
          >
            {eventName}
          </span>
        )}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="p-1.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shrink-0"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </button>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="-mr-1 p-2 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shrink-0"
          >
            <CloseIcon />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-1.5">
        {nav.map((item, idx) => {
          if (item.type === "group") {
            // Icon-only rail: a rule keeps the groups apart without labels.
            if (collapsed) {
              return (
                <div
                  key={idx}
                  aria-hidden
                  className="mx-2 my-2 border-t border-gray-200 dark:border-gray-700"
                />
              );
            }
            return (
              <div
                key={idx}
                className="px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 select-none"
              >
                {item.label}
              </div>
            );
          }

          const active = isLinkActive(item.segment, pathname, basePath);
          const href = item.segment ? `${basePath}/${item.segment}` : basePath;
          const showItems =
            !collapsed &&
            !!item.sidebarSection &&
            currentSection === item.sidebarSection &&
            hasActiveItems;

          return (
            <div key={idx}>
              <Link
                href={href}
                title={collapsed ? item.label : undefined}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 mx-1 px-2 py-1.5 rounded-md text-sm transition-colors ${
                  collapsed ? "justify-center" : ""
                } ${
                  active
                    ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-medium"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
                }`}
              >
                {item.icon}
                {!collapsed && (
                  <span className="truncate leading-none">{item.label}</span>
                )}
              </Link>

              {showItems && (
                <div className="ml-3 mr-1 mt-0.5 mb-1 border-l-2 border-blue-200 dark:border-blue-800 pl-2">
                  {items.map((si) => {
                    if (si.kind === "header") {
                      return (
                        <div
                          key={si.id}
                          className="mt-2 mb-0.5 px-2 pb-0.5 border-b border-gray-200 dark:border-gray-700 text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 truncate first:mt-0"
                        >
                          {si.label}
                        </div>
                      );
                    }
                    const siActive =
                      pathname === si.href || pathname.startsWith(`${si.href}/`);
                    return (
                      <Link
                        key={si.id}
                        href={si.href}
                        title={si.label}
                        aria-current={siActive ? "page" : undefined}
                        className={`block px-2 py-1 text-xs rounded truncate transition-colors ${
                          siActive
                            ? "text-blue-700 dark:text-blue-400 font-medium bg-blue-50 dark:bg-blue-900/20"
                            : "text-gray-500 dark:text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                        }`}
                      >
                        {si.label}
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

// ─── EventSidebar ─────────────────────────────────────────────────────────────

type EventSidebarProps = {
  eventId: string;
  eventName: string;
  mobileOpen: boolean;
  onMobileClose: () => void;
  // Resources this user can't VIEW on this event, computed server-side in the
  // event layout. Hiding is cosmetic — every page and the sidebar's own item
  // fetch still enforce their own checks.
  deniedResources: string[];
  // Same, for WRITE — drives the edit-only links (Import, Settings).
  deniedWriteResources: string[];
};

export function EventSidebar({
  eventId,
  eventName,
  mobileOpen,
  onMobileClose,
  deniedResources,
  deniedWriteResources,
}: EventSidebarProps) {
  const pathname = usePathname();
  const basePath = `/events/${eventId}`;

  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState<SidebarItem[]>([]);

  const currentSection = getActiveSection(pathname, basePath);

  // Hydrate collapse state from localStorage on mount
  useEffect(() => {
    startTransition(() => {
      setMounted(true);
      if (localStorage.getItem("event-sidebar-collapsed") === "true") {
        setCollapsed(true);
      }
    });
  }, []);

  // Fetch item list when active section changes
  useEffect(() => {
    if (!currentSection) {
      startTransition(() => setItems([]));
      return;
    }
    let cancelled = false;
    getSidebarItems(eventId, currentSection)
      .then((data) => {
        if (!cancelled) setItems(data);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [currentSection, eventId]);

  // Auto-close mobile drawer on route change
  const onMobileCloseRef = useRef(onMobileClose);
  useEffect(() => {
    onMobileCloseRef.current = onMobileClose;
  }, [onMobileClose]);
  const prevPathname = useRef(pathname);
  useEffect(() => {
    if (pathname !== prevPathname.current) {
      prevPathname.current = pathname;
      onMobileCloseRef.current();
    }
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onMobileCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const effectiveCollapsed = mounted && collapsed;

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("event-sidebar-collapsed", String(next));
      return next;
    });
  };

  const innerProps = {
    eventName,
    basePath,
    pathname,
    currentSection,
    items,
    nav: useMemo(
      () => visibleNav(new Set(deniedResources), new Set(deniedWriteResources)),
      [deniedResources, deniedWriteResources],
    ),
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`print:hidden hidden md:flex flex-col shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden transition-[width] duration-200 ease-in-out ${
          effectiveCollapsed ? "w-12" : "w-56"
        }`}
      >
        <SidebarInner
          {...innerProps}
          collapsed={effectiveCollapsed}
          onToggleCollapse={toggleCollapsed}
        />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            aria-hidden="true"
            onClick={onMobileClose}
          />
          <aside className="print:hidden fixed inset-y-0 left-0 z-50 w-64 flex flex-col border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl md:hidden">
            <SidebarInner
              {...innerProps}
              collapsed={false}
              onToggleCollapse={undefined}
              onClose={onMobileClose}
            />
          </aside>
        </>
      )}
    </>
  );
}
