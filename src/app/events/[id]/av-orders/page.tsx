import { notFound } from "next/navigation";
import Link from "next/link";
import { PageWrapper } from "@/components/PageWrapper";
import { getEvent } from "../../actions";
import { getAVOrders, deleteAVOrder } from "../../av-orders/actions";
import { EventTabs } from "../EventTabs";

export const dynamic = "force-dynamic";

export default async function AVOrdersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;
  const [event, avOrders] = await Promise.all([
    getEvent(eventId),
    getAVOrders(eventId),
  ]);

  if (!event) {
    notFound();
  }

  const deleteAVOrderAction = async (avOrderId: string) => {
    "use server";
    await deleteAVOrder(avOrderId, eventId);
  };

  return (
    <PageWrapper>
      <div className="mb-4">
        <Link
          href="/events"
          className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
        >
          ← Back to Events
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
          {event.name}
        </h1>
      </div>

      <EventTabs eventId={eventId} />

      <div className="flex justify-between items-center mb-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {avOrders.length} AV order{avOrders.length !== 1 ? "s" : ""}
        </p>
        <Link
          href={`/events/${eventId}/av-orders/new`}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Create AV Order
        </Link>
      </div>

      {avOrders.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            No AV orders yet. Create your first AV order to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {avOrders.map((avOrder) => (
            <div
              key={avOrder.id}
              className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 flex items-center justify-between"
            >
              <div>
                <Link
                  href={`/events/${eventId}/av-orders/${avOrder.id}`}
                  className="text-gray-900 dark:text-white font-medium hover:text-blue-600 dark:hover:text-blue-400"
                >
                  {avOrder.name}
                </Link>
                <div className="mt-1 flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                  {avOrder.equipment.length > 0 && (
                    <span>{avOrder.equipment.length} equipment item{avOrder.equipment.length !== 1 ? "s" : ""}</span>
                  )}
                  {avOrder.function && (
                    <span className="text-green-600 dark:text-green-400">
                      Linked to function: {avOrder.function.name}
                    </span>
                  )}
                  {avOrder.presentation && (
                    <span className="text-blue-600 dark:text-blue-400">
                      Linked to presentation: {avOrder.presentation.title}
                    </span>
                  )}
                  {!avOrder.function && !avOrder.presentation && (
                    <span className="text-orange-600 dark:text-orange-400">Unlinked</span>
                  )}
                </div>
              </div>
              <form action={() => deleteAVOrderAction(avOrder.id)}>
                <button
                  type="submit"
                  onClick={(e) => {
                    if (!confirm("Delete this AV Order?")) e.preventDefault();
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
