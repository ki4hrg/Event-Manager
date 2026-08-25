import type { Metadata } from "next";
import type { PermissionResource } from "@prisma/client";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { EventLayoutClient } from "@/components/EventLayoutClient";
import { permissionLevels, requirePermission } from "@/lib/permissions";
import { PermissionsProvider } from "@/components/PermissionsProvider";
import {
  EVENT_SCOPED_PERMISSION_RESOURCES,
  GLOBAL_PERMISSION_RESOURCES,
  canDo,
} from "@/lib/eventPermissions";
import { SECTION_RESOURCE } from "../sidebar-sections";
import { getEvent } from "../actions";

// Resources with a dedicated sidebar entry. Reports and the agenda read across
// several of these and gate on their own pages, so they stay visible. VENDORS
// belongs here too but resolves globally — see GLOBAL_PERMISSION_RESOURCES.
const NAV_RESOURCES: PermissionResource[] = Array.from(
  new Set<PermissionResource>([
    ...Object.values(SECTION_RESOURCE),
    "VENDORS",
    "FILES",
    "SHARE_LINKS",
  ]),
);

const ALL_RESOURCES: PermissionResource[] = [
  ...EVENT_SCOPED_PERMISSION_RESOURCES,
  ...GLOBAL_PERMISSION_RESOURCES,
];

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

  // One resolution pass for the whole subtree: the sidebar needs VIEW to decide
  // what to render, and every page and panel below needs WRITE/DELETE to decide
  // whether to offer an edit. Resolving both here keeps them from disagreeing.
  // Two calls because the two groups resolve at different scopes.
  const [eventScoped, globalScoped] = await Promise.all([
    permissionLevels(EVENT_SCOPED_PERMISSION_RESOURCES, id),
    permissionLevels(GLOBAL_PERMISSION_RESOURCES),
  ]);
  const permissions = { ...eventScoped, ...globalScoped };

  const deniedResources = NAV_RESOURCES.filter((r) => !canDo(permissions, r, "VIEW"));
  const deniedWriteResources = ALL_RESOURCES.filter(
    (r) => !canDo(permissions, r, "WRITE"),
  );

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col">
      <PermissionsProvider permissions={permissions}>
        <EventLayoutClient
          eventId={id}
          eventName={event.name}
          deniedResources={deniedResources}
          deniedWriteResources={deniedWriteResources}
          header={<Header />}
        >
          {children}
        </EventLayoutClient>
      </PermissionsProvider>
    </div>
  );
}
