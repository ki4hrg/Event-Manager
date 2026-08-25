import type { Metadata } from "next";
import type { PermissionResource } from "@prisma/client";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { EventLayoutClient } from "@/components/EventLayoutClient";
import { hasPermission, requirePermission } from "@/lib/permissions";
import { SECTION_RESOURCE } from "../sidebar-sections";
import { getEvent } from "../actions";

// Resources with a dedicated sidebar entry. Reports and the agenda read across
// several of these and gate on their own pages, so they stay visible.
const NAV_RESOURCES: PermissionResource[] = Array.from(
  new Set<PermissionResource>([
    ...Object.values(SECTION_RESOURCE),
    "VENDORS",
    "FILES",
    "SHARE_LINKS",
  ]),
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) return {};
  return {
    title: {
      default: `${event.name} · Event Manager`,
      template: `%s · ${event.name} · Event Manager`,
    },
  };
}

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Gate at the layout so unassigned/no-permission users redirect before sidebar+header render.
  const [event] = await Promise.all([
    getEvent(id),
    requirePermission("EVENTS", "VIEW", id),
  ]);
  if (!event) notFound();

  // Same per-resource idiom getEventOverviewStats already uses, so the sidebar
  // and the overview cards agree on what this user can reach.
  const checks = await Promise.all(
    NAV_RESOURCES.map((r) => hasPermission(r, "VIEW", id)),
  );
  const deniedResources = NAV_RESOURCES.filter((_, i) => !checks[i]);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col">
      <EventLayoutClient
        eventId={id}
        eventName={event.name}
        deniedResources={deniedResources}
        header={<Header />}
      >
        {children}
      </EventLayoutClient>
    </div>
  );
}
