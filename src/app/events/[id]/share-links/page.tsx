import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Toast } from "@/components/Toast";
import { getEvent } from "../../actions";
import { listShareLinksForEvent } from "@/app/events/share-links/actions";
import { listShareLinkGroupsForEvent } from "@/app/events/share-link-groups/actions";
import { ShareLinksTable } from "./ShareLinksTable";
import { ShareLinkGroupsTable } from "./ShareLinkGroupsTable";
import { hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Share links" };

export default async function ShareLinksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const canWrite = await hasPermission("SHARE_LINKS", "WRITE", eventId);
  const [event, links, groups] = await Promise.all([
    getEvent(eventId),
    listShareLinksForEvent(eventId),
    listShareLinkGroupsForEvent(eventId),
  ]);

  if (!event) notFound();

  return (
    <>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="mb-4">
        <Breadcrumbs items={[
          { label: "Events", href: "/events" },
          { label: event.name, href: `/events/${eventId}` },
          { label: "Share Links" },
        ]} />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">Share Links</h1>
      </div>

      <div className="max-w-5xl space-y-10">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">Dashboards</h2>
            {canWrite && (
              <Link
                href={`/events/${eventId}/share-links/dashboards/new`}
                className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded"
              >
                + New dashboard
              </Link>
            )}
          </div>
          <ShareLinkGroupsTable eventId={eventId} groups={groups} />
        </div>

        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Single Report Links</h2>
          <ShareLinksTable links={links} />
        </div>
      </div>
    </>
  );
}
