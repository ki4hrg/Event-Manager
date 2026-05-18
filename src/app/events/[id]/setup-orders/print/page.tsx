import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintHeader } from "@/components/print/PrintHeader";
import { SetupOrderDetails } from "@/app/events/setup-orders/SetupOrderDetails";
import { getSetupOrders, getSetupOrder } from "@/app/events/setup-orders/actions";
import { getEvent } from "../../../actions";
import { getSetupOrderVendors } from "@/app/vendors/actions";
import { getWorkflowInstances } from "@/app/events/workflows/actions";
import { getSetupOrderDisplayName } from "@/app/events/setup-orders/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Setup orders (print)" };

export default async function SetupOrdersPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;

  const [event, orderList] = await Promise.all([
    getEvent(eventId),
    getSetupOrders(eventId),
  ]);

  if (!event) {
    notFound();
  }

  const records = await Promise.all(
    orderList.map(async (o) => {
      const [order, vendors, workflows] = await Promise.all([
        getSetupOrder(o.id),
        getSetupOrderVendors(o.id, eventId),
        getWorkflowInstances("setup_order", o.id, eventId),
      ]);
      return { order, vendors, workflows };
    })
  );

  return (
    <div className="max-w-4xl mx-auto px-8 py-8 bg-white print:px-0 print:py-0">
      <PrintHeader
        eventName={event.name}
        title="All Setup Orders"
        backHref={`/events/${eventId}/setup-orders`}
      />

      {records.map(({ order, vendors, workflows }, i) => {
        if (!order) return null;
        return (
          <div
            key={order.id}
            className={i < records.length - 1 ? "mb-12 pb-12 border-b-2 border-gray-300 print:break-after-page" : ""}
          >
            <h2 className="text-lg font-semibold text-gray-900 print:text-black mb-4">
              {getSetupOrderDisplayName(order)}
            </h2>
            <SetupOrderDetails
              setupOrder={order}
              vendors={vendors}
              workflowInstances={workflows}
            />
          </div>
        );
      })}

      {records.length === 0 && (
        <p className="text-gray-500">No setup orders found for this event.</p>
      )}
    </div>
  );
}
