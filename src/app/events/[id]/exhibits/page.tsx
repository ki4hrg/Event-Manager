import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Toast } from "@/components/Toast";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import { formatFunctionLabel } from "@/lib/functionNumbers";
import { hasPermission } from "@/lib/permissions";
import { getEvent } from "../../actions";
import { getBoothGroups, getExhibitBooths } from "../../exhibits/actions";
import { FormLinkEntry } from "../../forms/FormLinkEntry";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Exhibits" };

export default async function ExhibitsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const [event, booths, groups, canWrite] = await Promise.all([
    getEvent(eventId),
    getExhibitBooths(eventId),
    getBoothGroups(eventId),
    hasPermission("FUNCTIONS", "WRITE", eventId),
  ]);
  if (!event) notFound();

  type Booth = (typeof booths)[number];
  const boothOrder = (a: Booth, b: Booth) =>
    (a.boothNumber ?? "").localeCompare(b.boothNumber ?? "", undefined, { numeric: true }) || a.name.localeCompare(b.name);
  const inGroup = (groupId: string | null) => booths.filter((b) => b.groupId === groupId).sort(boothOrder);
  const ungrouped = inGroup(null);

  const boothList = (list: Booth[]) => (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
      {list.map((b) => {
        // Grouped rows show only what the booth overrides; the group header
        // shows the shared settings.
        const fn = b.function;
        return (
          <Link
            key={b.id}
            href={`/events/${eventId}/exhibits/${b.id}`}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-4 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <div className="min-w-0">
              <p className="font-medium text-blue-600 dark:text-blue-400">
                {b.boothNumber && <span className="text-gray-500 dark:text-gray-400 mr-2">Booth {b.boothNumber}</span>}
                {b.name}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {[b.companyName, b.boothType, b.location, fn ? formatFunctionLabel(fn) : null]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </p>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {[b.contact ? `${b.contact.firstName} ${b.contact.lastName}` : null, b._count.equipmentItems > 0 ? `${b._count.equipmentItems} item(s)` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </Link>
        );
      })}
    </div>
  );

  return (
    <>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-6">
        <div className="min-w-0">
          <Breadcrumbs
            items={[
              { label: "Events", href: "/events" },
              { label: event.name, href: `/events/${eventId}` },
              { label: "Exhibits" },
            ]}
          />
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">Exhibits ({booths.length})</h1>
        </div>
        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          <FormLinkEntry
            eventId={eventId}
            formType="EXHIBIT_REQUEST"
            title="Exhibit request link"
            targetSelect={{
              name: "boothGroupId",
              label: "Exhibit area",
              emptyLabel: "Any",
              options: groups.map((g) => ({ value: g.id, label: g.name })),
            }}
          />
          {canWrite && (
            <>
              <Link href={`/events/${eventId}/exhibits/groups/new`} className={btnSecondary}>
                Add Group
              </Link>
              <Link href={`/events/${eventId}/exhibits/new`} className={btnPrimary}>
                Add Booth
              </Link>
            </>
          )}
        </div>
      </div>

      {booths.length === 0 && groups.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No booths yet.</p>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => {
            const list = inGroup(g.id);
            return (
              <section key={g.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <Link
                      href={`/events/${eventId}/exhibits/groups/${g.id}`}
                      className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {g.name}
                    </Link>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {" "}
                      · {[g.boothType, g.location, g.function ? formatFunctionLabel(g.function) : null, `${list.length} booth(s)`]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  {canWrite && (
                    <Link
                      href={`/events/${eventId}/exhibits/new?groupId=${g.id}`}
                      className="py-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      + Add booth
                    </Link>
                  )}
                </div>
                {list.length > 0 ? boothList(list) : <p className="text-sm text-gray-500 dark:text-gray-400">No booths yet.</p>}
              </section>
            );
          })}
          {ungrouped.length > 0 && (
            <section>
              {groups.length > 0 && <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">No group</h2>}
              {boothList(ungrouped)}
            </section>
          )}
        </div>
      )}
    </>
  );
}
