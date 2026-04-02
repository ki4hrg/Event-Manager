import { notFound } from "next/navigation";
import Link from "next/link";
import { PageWrapper } from "@/components/PageWrapper";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "../../actions";
import { getBEOs, deleteBEO } from "../../beos/actions";
import { EventTabs } from "../EventTabs";

export const dynamic = "force-dynamic";

export default async function BEOsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;
  const [event, beos] = await Promise.all([
    getEvent(eventId),
    getBEOs(eventId),
  ]);

  if (!event) {
    notFound();
  }

  const deleteBEOAction = async (beoId: string) => {
    "use server";
    await deleteBEO(beoId, eventId);
  };

  return (
    <PageWrapper>
      <div className="mb-4">
        <Breadcrumbs items={[{ label: "Events", href: "/events" }, { label: event.name, href: `/events/${eventId}` }, { label: "BEOs" }]} />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
          {event.name}
        </h1>
      </div>

      <EventTabs eventId={eventId} />

      <div className="flex justify-between items-center mb-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {beos.length} BEO{beos.length !== 1 ? "s" : ""}
        </p>
        <Link
          href={`/events/${eventId}/beos/new`}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Create BEO
        </Link>
      </div>

      {beos.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            No BEOs yet. Create your first BEO to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {beos.map((beo) => (
            <div
              key={beo.id}
              className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 flex items-center justify-between"
            >
              <div>
                <Link
                  href={`/events/${eventId}/beos/${beo.id}`}
                  className="text-gray-900 dark:text-white font-medium hover:text-blue-600 dark:hover:text-blue-400"
                >
                  {beo.name}
                </Link>
                <div className="mt-1 flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                  {beo.guaranteeCount != null && (
                    <span>Guarantee: {beo.guaranteeCount}</span>
                  )}
                  {beo.tableSetup && <span>{beo.tableSetup}</span>}
                  {beo.function ? (
                    <span className="text-green-600 dark:text-green-400">
                      Linked to function: {beo.function.name}
                    </span>
                  ) : (
                    <span className="text-orange-600 dark:text-orange-400">Unlinked</span>
                  )}
                </div>
              </div>
              <form action={() => deleteBEOAction(beo.id)}>
                <button
                  type="submit"
                  onClick={(e) => {
                    if (!confirm("Delete this BEO?")) e.preventDefault();
                  }}
                  className="text-red-600 hover:underline text-sm"
                >
                  Delete
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </PageWrapper>
  );
}
