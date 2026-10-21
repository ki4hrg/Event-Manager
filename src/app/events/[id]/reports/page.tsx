import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { PermissionResource } from "@prisma/client";
import { PageHeader } from "@/components/PageHeader";
import { hasPermission } from "@/lib/permissions";
import {
  REPORT_CATEGORIES,
  REPORTS,
  SHARE_REPORT_TYPES,
} from "@/lib/reportRegistry";
import { getEvent } from "../../actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsHubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;

  const gatingResources = Array.from(
    new Set(
      SHARE_REPORT_TYPES.map((t) => REPORTS[t].resource).filter(
        (r): r is PermissionResource => !!r,
      ),
    ),
  );
  const [event, allowed] = await Promise.all([
    getEvent(eventId),
    Promise.all(gatingResources.map((r) => hasPermission(r, "VIEW", eventId))),
  ]);
  if (!event) notFound();

  const denied = new Set(gatingResources.filter((_, i) => !allowed[i]));
  const visible = SHARE_REPORT_TYPES.filter((t) => {
    const resource = REPORTS[t].resource;
    return !resource || !denied.has(resource);
  });

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Events", href: "/events" },
          { label: event.name, href: `/events/${eventId}` },
          { label: "Reports" },
        ]}
        title="Reports"
      />

      <div className="space-y-8">
        {REPORT_CATEGORIES.map((category) => {
          const types = visible.filter((t) => REPORTS[t].category === category);
          if (types.length === 0) return null;
          return (
            <section key={category}>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">
                {category}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {types.map((t) => {
                  const report = REPORTS[t];
                  return (
                    <Link
                      key={t}
                      href={`/events/${eventId}/${report.path}`}
                      className="block rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-colors"
                    >
                      <div className="font-medium text-gray-900 dark:text-white">
                        {report.label}
                      </div>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        {report.description}
                      </p>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
