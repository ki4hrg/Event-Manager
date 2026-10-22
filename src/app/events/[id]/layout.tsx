import type { Metadata } from "next";
import type { PermissionResource } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { EventLayoutClient } from "@/components/EventLayoutClient";
import { getUserSetting, SETTING_KEYS } from "@/lib/userSettings";
import { permissionLevels, requirePermission } from "@/lib/permissions";
import { getTenantContext, setActiveTenantForUser } from "@/lib/tenant";
import { PermissionsProvider } from "@/components/PermissionsProvider";
import {
  EVENT_SCOPED_PERMISSION_RESOURCES,
  GLOBAL_PERMISSION_RESOURCES,
  canDo,
} from "@/lib/eventPermissions";
import { SECTION_RESOURCE } from "../sidebar-sections";
import { getEvent } from "@/app/events/event";
import { prisma } from "@/lib/prisma";
import { OPEN_STATUSES } from "../inbox/views";

// Resources with a dedicated sidebar entry. Reports, the agenda and the inbox
// read across several of these and gate on their own pages, so they stay visible. VENDORS
// belongs here too but resolves globally — see GLOBAL_PERMISSION_RESOURCES.
const NAV_RESOURCES: PermissionResource[] = Array.from(
  new Set<PermissionResource>([
    ...Object.values(SECTION_RESOURCE),
    "VENDORS",
    "FILES",
    "SHARE_LINKS",
    "HOTELS",
    "FORMS",
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
  const [event, session] = await Promise.all([
    getEvent(id),
    requirePermission("EVENTS", "VIEW", id),
  ]);
  if (!event) notFound();

  // A link into another organization's event (a bookmark, the last-event
  // landing preference) re-points the active tenant so the header, pickers,
  // and every global lookup below agree with the event. The permission check
  // above already proved membership; the redirect lands on the event overview
  // so the next request renders inside the right tenant from the first byte.
  const ctx = await getTenantContext();
  if (ctx?.active && ctx.active.id !== event.tenantId) {
    if (await setActiveTenantForUser(ctx.userId, event.tenantId)) redirect(`/events/${id}`);
  }

  // One resolution pass for the whole subtree: the sidebar needs VIEW to decide
  // what to render, and every page and panel below needs WRITE/DELETE to decide
  // whether to offer an edit. Resolving both here keeps them from disagreeing.
  // Two calls because the two groups resolve at different scopes.
  const [eventScoped, globalScoped, sidebarCollapsed] = await Promise.all([
    permissionLevels(EVENT_SCOPED_PERMISSION_RESOURCES, id),
    permissionLevels(GLOBAL_PERMISSION_RESOURCES),
    getUserSetting(session.user.id, SETTING_KEYS.EVENT_SIDEBAR_COLLAPSED),
  ]);
  const permissions = { ...eventScoped, ...globalScoped };

  const deniedResources = NAV_RESOURCES.filter((r) => !canDo(permissions, r, "VIEW"));
  // Submissions waiting for review, beside the Forms link; open mail beside
  // Inbox (the header's org-wide count, narrowed to this event).
  const [openForms, openInbox] = await Promise.all([
    canDo(permissions, "FORMS", "VIEW")
      ? prisma.formSubmission.count({ where: { eventId: id, state: "SUBMITTED" } })
      : 0,
    prisma.inboundEmail.count({ where: { tenantId: event.tenantId, eventId: id, status: { in: OPEN_STATUSES } } }),
  ]);
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
          sidebarCollapsed={sidebarCollapsed === "true"}
          sidebarBadges={{ forms: openForms, inbox: openInbox }}
          header={<Header />}
        >
          {children}
        </EventLayoutClient>
      </PermissionsProvider>
    </div>
  );
}
