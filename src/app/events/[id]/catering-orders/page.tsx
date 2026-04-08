import { notFound } from "next/navigation";
import Link from "next/link";
import { PageWrapper } from "@/components/PageWrapper";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { InlineDeleteButton } from "@/components/InlineDeleteButton";
import { getEvent } from "../../actions";
import { getCateringOrders, deleteCateringOrder } from "../../catering-orders/actions";
import { getWorkflowBadgeSummaries } from "../../workflows/actions";
import { WorkflowBadge } from "@/components/WorkflowBadge";
import { EventTabs } from "../EventTabs";

export const dynamic = "force-dynamic";

export default async function CateringOrdersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;
  const [event, cateringOrders] = await Promise.all([
    getEvent(eventId),
    getCateringOrders(eventId),
  ]);

  const workflowSummaries = cateringOrders.length > 0
    ? await getWorkflowBadgeSummaries("catering_order", cateringOrders.map((o) => o.id))
    : {};

  if (!event) {
    notFound();
  }

  const deleteCateringOrderAction = async (formData: FormData) => {
    "use server";
    await deleteCateringOrder(formData.get("cateringOrderId") as string, eventId);
  };

  return (
    <PageWrapper>
      <div className="mb-4">
        <Breadcrumbs items={[{ label: "Events", href: "/events" }, { label: event.name, href: `/events/${eventId}` }, { label: "Catering Orders" }]} />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
          {event.name}
        </h1>
      </div>

      <EventTabs eventId={eventId} />

      <div className="flex justify-between items-center mb-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {cateringOrders.length} Catering Order{cateringOrders.length !== 1 ? "s" : ""}
        </p>
        <Link
          href={`/events/${eventId}/catering-orders/new`}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Create Catering Order
        </Link>
      </div>

      {cateringOrders.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            No Catering Orders yet. Create your first to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {cateringOrders.map((order) => (
            <div
              key={order.id}
              className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 flex items-center justify-between"
            >
              <div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/events/${eventId}/catering-orders/${order.id}`}
                    className="text-gray-900 dark:text-white font-medium hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    {order.name}
                  </Link>
                  <WorkflowBadge summary={workflowSummaries[order.id]} />
                </div>
                <div className="mt-1 flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                  {order.guaranteeCount != null && (
                    <span>Guarantee: {order.guaranteeCount}</span>
                  )}
                  {order.serviceStyle && <span>{order.serviceStyle}</span>}
                  {order.function ? (
                    <span className="text-green-600 dark:text-green-400">
                      Linked to function: {order.function.name}
                    </span>
                  ) : (
                    <span className="text-orange-600 dark:text-orange-400">Unlinked</span>
                  )}
                </div>
              </div>
              <InlineDeleteButton
                action={deleteCateringOrderAction}
                hiddenInputs={{ cateringOrderId: order.id }}
                confirmMessage="Delete this Catering Order?"
              />
            </div>
          ))}
        </div>
      )}
    </PageWrapper>
  );
}
