import { notFound } from "next/navigation";
import Link from "next/link";
import { PageWrapper } from "@/components/PageWrapper";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { InlineDeleteButton } from "@/components/InlineDeleteButton";
import { getEvent } from "../../actions";
import { getSetupOrders, deleteSetupOrder } from "../../setup-orders/actions";
import { getSetupOrderDisplayName } from "../../setup-orders/utils";
import { getWorkflowBadgeSummaries } from "../../workflows/actions";
import { WorkflowBadge } from "@/components/WorkflowBadge";
import { EntityStatusBadge } from "@/components/EntityStatusBadge";
import { EventTabs } from "../EventTabs";

export const dynamic = "force-dynamic";

export default async function SetupOrdersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;
  const [event, setupOrders] = await Promise.all([
    getEvent(eventId),
    getSetupOrders(eventId),
  ]);

  const workflowSummaries = setupOrders.length > 0
    ? await getWorkflowBadgeSummaries("setup_order", setupOrders.map((o) => o.id))
    : {};

  if (!event) {
    notFound();
  }

  const deleteSetupOrderAction = async (formData: FormData) => {
    "use server";
    await deleteSetupOrder(formData.get("setupOrderId") as string, eventId);
  };

  return (
    <PageWrapper>
      <div className="mb-4">
        <Breadcrumbs
          items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${eventId}` },
            { label: "Setup Orders" },
          ]}
        />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
          {event.name}
        </h1>
      </div>

      <EventTabs eventId={eventId} />

      <div className="flex justify-between items-center mb-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {setupOrders.length} setup order{setupOrders.length !== 1 ? "s" : ""}
        </p>
        <div className="flex gap-2">
          <a
            href={`/events/${eventId}/setup-orders/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Print All
          </a>
          <Link
            href={`/events/${eventId}/setup-orders/new`}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Create Setup Order
          </Link>
        </div>
      </div>

      {setupOrders.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            No setup orders yet. Create your first setup order to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {setupOrders.map((so) => {
            const displayName = getSetupOrderDisplayName(so);
            return (
              <div
                key={so.id}
                className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/events/${eventId}/setup-orders/${so.id}`}
                      className="text-gray-900 dark:text-white font-medium hover:text-blue-600 dark:hover:text-blue-400"
                    >
                      {displayName}
                    </Link>
                    <WorkflowBadge summary={workflowSummaries[so.id]} />
                    <EntityStatusBadge status={so.status} substatus={so.substatus} />
                  </div>
                  <div className="mt-1 flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                    {so.setupType && <span>{so.setupType}</span>}
                    {so.tables.length > 0 && (
                      <span>{so.tables.length} table row{so.tables.length !== 1 ? "s" : ""}</span>
                    )}
                    {so.equipmentItems.length > 0 && (
                      <span>{so.equipmentItems.length} equipment item{so.equipmentItems.length !== 1 ? "s" : ""}</span>
                    )}
                  </div>
                </div>
                <InlineDeleteButton
                  action={deleteSetupOrderAction}
                  hiddenInputs={{ setupOrderId: so.id }}
                  confirmMessage="Delete this Setup Order?"
                />
              </div>
            );
          })}
        </div>
      )}
    </PageWrapper>
  );
}
