import { notFound } from "next/navigation";
import { PrintHeader } from "@/components/print/PrintHeader";
import { SetupOrderDetails } from "@/app/events/setup-orders/SetupOrderDetails";
import { getSetupOrder } from "@/app/events/setup-orders/actions";
import { getEvent } from "../../../../actions";
import { getOptions } from "@/app/settings/actions";
import { getSetupOrderVendors } from "@/app/vendors/actions";
import { getWorkflowInstances } from "@/app/events/workflows/actions";
import { getSetupOrderDisplayName } from "@/app/events/setup-orders/utils";

export const dynamic = "force-dynamic";

export default async function SetupOrderPrintPage({
  params,
}: {
  params: Promise<{ id: string; setupOrderId: string }>;
}) {
  const { id: eventId, setupOrderId } = await params;

  const [event, setupOrder, setupTypes, vendors, workflowInstances] = await Promise.all([
    getEvent(eventId),
    getSetupOrder(setupOrderId),
    getOptions("setup_type"),
    getSetupOrderVendors(setupOrderId),
    getWorkflowInstances("setup_order", setupOrderId),
  ]);

  if (!event || !setupOrder) {
    notFound();
  }

  const displayName = getSetupOrderDisplayName(setupOrder);

  return (
    <div className="max-w-4xl mx-auto px-8 py-8 bg-white print:px-0 print:py-0">
      <PrintHeader
        eventName={event.name}
        recordType="Setup Order"
        recordName={displayName}
        backHref={`/events/${eventId}/setup-orders/${setupOrderId}`}
      />
      <SetupOrderDetails
        setupOrder={setupOrder}
        setupTypes={setupTypes}
        vendors={vendors}
        workflowInstances={workflowInstances}
      />
    </div>
  );
}
