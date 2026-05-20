import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PrintHeader } from "@/components/print/PrintHeader";
import { CateringOrderDetails } from "@/app/events/catering-orders/CateringOrderDetails";
import { getCateringOrder } from "@/app/events/catering-orders/actions";
import { getEvent } from "../../../../actions";
import { getCateringOrderVendors } from "@/app/vendors/actions";
import { getWorkflowInstances } from "@/app/events/workflows/actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; cateringOrderId: string }>;
}): Promise<Metadata> {
  const { cateringOrderId } = await params;
  const order = await prisma.cateringOrder.findUnique({
    where: { id: cateringOrderId },
    select: { name: true },
  });
  return { title: order ? `${order.name} (print)` : "Catering order (print)" };
}

export default async function CateringOrderPrintPage({
  params,
}: {
  params: Promise<{ id: string; cateringOrderId: string }>;
}) {
  const { id: eventId, cateringOrderId } = await params;

  const [event, order, vendors, workflowInstances] = await Promise.all([
    getEvent(eventId),
    getCateringOrder(cateringOrderId),
    getCateringOrderVendors(cateringOrderId, eventId),
    getWorkflowInstances("catering_order", cateringOrderId, eventId),
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
        timezone={event.timezone}
      />
    </div>
  );
}
