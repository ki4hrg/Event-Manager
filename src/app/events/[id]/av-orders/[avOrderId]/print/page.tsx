import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PrintHeader } from "@/components/print/PrintHeader";
import { AVOrderDetails } from "@/app/events/av-orders/AVOrderDetails";
import { getAVOrder } from "@/app/events/av-orders/actions";
import { getEvent } from "@/app/events/event";
import { getAVOrderVendors } from "@/app/vendors/actions";
import { getWorkflowInstances } from "@/app/events/workflows/actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; avOrderId: string }>;
}): Promise<Metadata> {
  const { avOrderId } = await params;
  const order = await prisma.aVOrder.findUnique({
    where: { id: avOrderId },
    select: { name: true },
  });
  return { title: order ? `${order.name} (print)` : "AV order (print)" };
}

export default async function AVOrderPrintPage({
  params,
}: {
  params: Promise<{ id: string; avOrderId: string }>;
}) {
  const { id: eventId, avOrderId } = await params;

  const [event, order, vendors, workflowInstances] = await Promise.all([
    getEvent(eventId),
    getAVOrder(avOrderId),
    getAVOrderVendors(avOrderId, eventId),
    getWorkflowInstances("av_order", avOrderId, eventId),
  ]);

  if (!event || !order) {
    notFound();
  }

  return (
    <div className="max-w-4xl mx-auto px-8 py-8 bg-white print:px-0 print:py-0">
      <PrintHeader
        eventName={event.name}
        recordType="AV Order"
        recordName={order.name}
        backHref={`/events/${eventId}/av-orders/${avOrderId}`}
      />
      <AVOrderDetails
        order={order}
        vendors={vendors}
        workflowInstances={workflowInstances}
      />
    </div>
  );
}
