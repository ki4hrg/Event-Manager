import { notFound } from "next/navigation";
import Link from "next/link";
import { PageWrapper } from "@/components/PageWrapper";
import { getEvent } from "../../../actions";
import { createAVOrder } from "../../../av-orders/actions";
import { AVOrderForm } from "../../../av-orders/AVOrderForm";
import { getOptions } from "@/app/settings/actions";

export const dynamic = "force-dynamic";

export default async function NewAVOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ functionId?: string; presentationId?: string }>;
}) {
  const { id: eventId } = await params;
  const { functionId, presentationId } = await searchParams;

  const [event, avEquipment] = await Promise.all([
    getEvent(eventId),
    getOptions("av_equipment"),
  ]);

  if (!event) {
    notFound();
  }

  const createAVOrderAction = async (formData: FormData) => {
    "use server";
    if (functionId) formData.set("functionId", functionId);
    if (presentationId) formData.set("presentationId", presentationId);
    await createAVOrder(eventId, formData);
  };

  return (
    <PageWrapper>
      <div className="mb-6">
        <Link
          href={`/events/${eventId}/av-orders`}
          className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
        >
          &larr; Back to AV Orders
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
          New AV Order
        </h1>
      </div>

      <AVOrderForm
        eventId={eventId}
        avEquipment={avEquipment}
        action={createAVOrderAction}
      />
    </PageWrapper>
  );
}
