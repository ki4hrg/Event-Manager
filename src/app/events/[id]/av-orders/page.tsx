import { notFound } from "next/navigation";
import Link from "next/link";
import { PageWrapper } from "@/components/PageWrapper";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { InlineDeleteButton } from "@/components/InlineDeleteButton";
import { getEvent } from "../../actions";
import { getAVOrders, deleteAVOrder } from "../../av-orders/actions";
import { getWorkflowBadgeSummaries } from "../../workflows/actions";
import { WorkflowBadge } from "@/components/WorkflowBadge";
import { EntityStatusBadge } from "@/components/EntityStatusBadge";
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

  const workflowSummaries = avOrders.length > 0
    ? await getWorkflowBadgeSummaries("av_order", avOrders.map((o) => o.id))
    : {};

  if (!event) {
    notFound();
  }

  const deleteAVOrderAction = async (formData: FormData) => {
    "use server";
    await deleteAVOrder(formData.get("avOrderId") as string, eventId);
  };

  return (
    <PageWrapper>
      <div className="mb-4">
        <Breadcrumbs items={[{ label: "Events", href: "/events" }, { label: event.name, href: `/events/${eventId}` }, { label: "AV Orders" }]} />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
          {event.name}
        </h1>
      </div>

      <EventTabs eventId={eventId} />

      <div className="flex justify-between items-center mb-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {avOrders.length} AV order{avOrders.length !== 1 ? "s" : ""}
        </p>
        <div className="flex gap-2">
          <a
            href={`/events/${eventId}/av-orders/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Print All
          </a>
          <Link
            href={`/events/${eventId}/av-orders/new`}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Create AV Order
          </Link>
        </div>
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
                <div className="flex items-center gap-2">
                  <Link
                    href={`/events/${eventId}/av-orders/${avOrder.id}`}
                    className="text-gray-900 dark:text-white font-medium hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    {avOrder.name}
                  </Link>
                  <WorkflowBadge summary={workflowSummaries[avOrder.id]} />
                  <EntityStatusBadge status={avOrder.status} substatus={avOrder.substatus} />
                </div>
                <div className="mt-1 flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                  {avOrder.functions.length > 0 && (
                    <span className="text-green-600 dark:text-green-400">
                      {avOrder.functions.length === 1
                        ? `Linked to function: ${avOrder.functions[0].name}`
                        : `Linked to ${avOrder.functions.length} functions`}
                    </span>
                  )}
                  {avOrder.presentation && (
                    <span className="text-blue-600 dark:text-blue-400">
                      Linked to presentation: {avOrder.presentation.title}
                    </span>
                  )}
                  {avOrder.functions.length === 0 && !avOrder.presentation && (
                    <span className="text-orange-600 dark:text-orange-400">Unlinked</span>
                  )}
                </div>
              </div>
              <InlineDeleteButton
                action={deleteAVOrderAction}
                hiddenInputs={{ avOrderId: avOrder.id }}
                confirmMessage="Delete this AV Order?"
              />
            </div>
          ))}
        </div>
      )}
    </PageWrapper>
  );
}
