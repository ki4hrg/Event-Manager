import { notFound } from "next/navigation";
import { PrintHeader } from "@/components/print/PrintHeader";
import { CateringOrderDetails } from "@/app/events/catering-orders/CateringOrderDetails";
import { getCateringOrder } from "@/app/events/catering-orders/actions";
import { getEvent } from "../../../../actions";
import { getCateringOrderVendors } from "@/app/vendors/actions";
import { getWorkflowInstances } from "@/app/events/workflows/actions";

export const dynamic = "force-dynamic";

export default async function CateringOrderPrintPage({
  params,
}: {
  params: Promise<{ id: string; cateringOrderId: string }>;
}) {
  const { id: eventId, cateringOrderId } = await params;

  const [event, order, vendors, workflowInstances] = await Promise.all([
    getEvent(eventId),
    getCateringOrder(cateringOrderId),
    getCateringOrderVendors(cateringOrderId),
    getWorkflowInstances("catering_order", cateringOrderId),
  ]);

  if (!event || !order) {
    notFound();
  }

  return (
    <div className="max-w-4xl mx-auto px-8 py-8 bg-white print:px-0 print:py-0">
      <PrintHeader
        eventName={event.name}
        recordType="Catering Order"
        recordName={order.name}
        backHref={`/events/${eventId}/catering-orders/${cateringOrderId}`}
      />
      <CateringOrderDetails
        order={order}
        vendors={vendors}
        workflowInstances={workflowInstances}
      />
    </div>
  );
}
