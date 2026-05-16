import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Toast } from "@/components/Toast";
import { getEvent } from "@/app/events/actions";
import { getShareLinkGroup } from "@/app/events/share-link-groups/actions";
import { DashboardEditor } from "./DashboardEditor";

export const dynamic = "force-dynamic";

export default async function DashboardEditorPage({
  params,
}: {
  params: Promise<{ id: string; groupId: string }>;
}) {
  const { id: eventId, groupId } = await params;
  const [event, group] = await Promise.all([getEvent(eventId), getShareLinkGroup(groupId)]);
  if (!event || !group || group.eventId !== eventId) notFound();

  return (
    <>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="mb-4">
        <Breadcrumbs
          items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${eventId}` },
            { label: "Share Links", href: `/events/${eventId}/share-links` },
            { label: group.label || "Untitled dashboard" },
          ]}
        />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">{event.name}</h1>
      </div>

      <div className="max-w-3xl">
        <DashboardEditor
          eventId={eventId}
          group={{
            id: group.id,
            token: group.token,
            label: group.label,
            expiresAt: group.expiresAt ? group.expiresAt.toISOString() : null,
            revokedAt: group.revokedAt ? group.revokedAt.toISOString() : null,
          }}
          items={group.items.map((i) => ({
            id: i.id,
            reportType: i.reportType,
            filtersLocked: i.filtersLocked,
            label: i.label,
          }))}
        />
      </div>
    </>
  );
}
