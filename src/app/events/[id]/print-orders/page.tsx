import { notFound } from "next/navigation";
import Link from "next/link";
import { PageWrapper } from "@/components/PageWrapper";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { InlineDeleteButton } from "@/components/InlineDeleteButton";
import { getEvent } from "../../actions";
import { getPrintOrders, deletePrintOrder } from "../../print-orders/actions";
import { getWorkflowBadgeSummaries } from "../../workflows/actions";
import { WorkflowBadge } from "@/components/WorkflowBadge";
import { EntityStatusBadge } from "@/components/EntityStatusBadge";
import { EventTabs } from "../EventTabs";

export const dynamic = "force-dynamic";

export default async function PrintOrdersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;
  const [event, printOrders] = await Promise.all([
    getEvent(eventId),
    getPrintOrders(eventId),
  ]);

  if (!event) notFound();

  const workflowSummaries = printOrders.length > 0
    ? await getWorkflowBadgeSummaries("print_order", printOrders.map((o) => o.id))
    : {};

  const deletePrintOrderAction = async (formData: FormData) => {
    "use server";
    await deletePrintOrder(formData.get("printOrderId") as string, eventId);
  };

  return (
    <PageWrapper>
      <div className="mb-4">
        <Breadcrumbs
          items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${eventId}` },
            { label: "Print Orders" },
          ]}
        />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
          {event.name}
        </h1>
      </div>

      <EventTabs eventId={eventId} />

      <div className="flex justify-between items-center mb-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {printOrders.length} print order{printOrders.length !== 1 ? "s" : ""}
        </p>
        <Link
          href={`/events/${eventId}/print-orders/new`}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Create Print Order
        </Link>
      </div>

      {printOrders.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            No print orders yet. Create your first print order to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {printOrders.map((po) => (
            <div
              key={po.id}
              className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 flex items-center justify-between"
            >
              <div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/events/${eventId}/print-orders/${po.id}`}
                    className="text-gray-900 dark:text-white font-medium hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    {po.name}
                  </Link>
                  <WorkflowBadge summary={workflowSummaries[po.id]} />
                  <EntityStatusBadge status={po.status} substatus={po.substatus} />
                </div>
                <div className="mt-1 flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                  {po.items.length > 0 && (
                    <span>{po.items.length} item{po.items.length !== 1 ? "s" : ""}</span>
                  )}
                  {po.functions.length > 0 && (
                    <span className="text-green-600 dark:text-green-400">
                      {po.functions.length === 1
                        ? `Linked to function: ${po.functions[0].function.name}`
                        : `Linked to ${po.functions.length} functions`}
                    </span>
                  )}
                  {po.presentation && (
                    <span className="text-blue-600 dark:text-blue-400">
                      Linked to presentation: {po.presentation.title}
                    </span>
                  )}
                  {po.functions.length === 0 && !po.presentation && (
                    <span className="text-orange-600 dark:text-orange-400">Unlinked</span>
                  )}
                </div>
              </div>
              <InlineDeleteButton
                action={deletePrintOrderAction}
                hiddenInputs={{ printOrderId: po.id }}
                confirmMessage="Delete this Print Order?"
              />
            </div>
          ))}
        </div>
      )}
    </PageWrapper>
  );
}
