import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintHeader } from "@/components/print/PrintHeader";
import { CateringOrderDetails } from "@/app/events/catering-orders/CateringOrderDetails";
import { getCateringOrders, getCateringOrder } from "@/app/events/catering-orders/actions";
import { getEvent } from "../../../actions";
import { getCateringOrderVendors } from "@/app/vendors/actions";
import { getWorkflowInstances } from "@/app/events/workflows/actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Catering orders (print)" };

export default async function CateringOrdersPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;

  const [event, orderList] = await Promise.all([
    getEvent(eventId),
    getCateringOrders(eventId),
  ]);

  if (!event) {
    notFound();
  }

  const records = await Promise.all(
    orderList.map(async (o) => {
      const [order, vendors, workflows] = await Promise.all([
        getCateringOrder(o.id),
        getCateringOrderVendors(o.id, eventId),
        getWorkflowInstances("catering_order", o.id, eventId),
      ]);
      return { order, vendors, workflows };
    })
  );

  return (
    <div className="max-w-4xl mx-auto px-8 py-8 bg-white print:px-0 print:py-0">
      <PrintHeader
        eventName={event.name}
        title="All Catering Orders"
        backHref={`/events/${eventId}/catering-orders`}
      />

      {records.map(({ order, vendors, workflows }, i) => {
        if (!order) return null;
        return (
          <div
            key={order.id}
            className={i < records.length - 1 ? "mb-12 pb-12 border-b-2 border-gray-300 print:break-after-page" : ""}
          >
            <h2 className="text-lg font-semibold text-gray-900 print:text-black mb-4">{order.name}</h2>
            <CateringOrderDetails
              order={order}
              vendors={vendors}
              workflowInstances={workflows}
            />
          </div>
        );
      })}

      {records.length === 0 && (
        <p className="text-gray-500">No catering orders found for this event.</p>
      )}
    </div>
  );
}
