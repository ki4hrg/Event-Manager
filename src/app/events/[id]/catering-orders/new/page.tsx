import { notFound } from "next/navigation";
import Link from "next/link";
import { PageWrapper } from "@/components/PageWrapper";
import { getEvent } from "../../../actions";
import { createCateringOrder } from "../../../catering-orders/actions";
import { getOptions } from "../../../../settings/actions";
import { CateringOrderForm } from "../../../catering-orders/CateringOrderForm";
import { searchAssignedEventVendors } from "@/app/vendors/actions";

export const dynamic = "force-dynamic";

export default async function NewCateringOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ functionId?: string }>;
}) {
  const { id: eventId } = await params;
  const { functionId } = await searchParams;

  const [event, serviceStyleOptions, eventVendors] = await Promise.all([
    getEvent(eventId),
    getOptions("service_style"),
    searchAssignedEventVendors("", eventId, "CATERING_ORDER"),
  ]);

  if (!event) {
    notFound();
  }

  const createCateringOrderAction = async (formData: FormData) => {
    "use server";
    if (functionId) formData.set("functionId", functionId);
    await createCateringOrder(eventId, formData);
  };

  return (
    <PageWrapper>
      <div className="mb-6">
        <Link
          href={`/events/${eventId}/catering-orders`}
          className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
        >
          &larr; Back to Catering Orders
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
          New Catering Order
        </h1>
      </div>

      <CateringOrderForm
        eventId={eventId}
        action={createCateringOrderAction}
        serviceStyleOptions={serviceStyleOptions}
        availableVendors={eventVendors.map((v) => ({ id: v.id, label: v.name }))}
      />
    </PageWrapper>
  );
}
