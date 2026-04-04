import { notFound } from "next/navigation";
import Link from "next/link";
import { PageWrapper } from "@/components/PageWrapper";
import { getEvent } from "../../../actions";
import { createSetupOrder } from "../../../setup-orders/actions";
import { SetupOrderForm } from "../../../setup-orders/SetupOrderForm";
import { getOptions } from "@/app/settings/actions";

export const dynamic = "force-dynamic";

export default async function NewSetupOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ functionId?: string }>;
}) {
  const { id: eventId } = await params;
  const { functionId } = await searchParams;

  const [event, setupTypes] = await Promise.all([
    getEvent(eventId),
    getOptions("setup_type"),
  ]);

  if (!event) {
    notFound();
  }

  const createSetupOrderAction = async (formData: FormData) => {
    "use server";
    if (functionId) formData.set("functionId", functionId);
    await createSetupOrder(eventId, formData);
  };

  return (
    <PageWrapper>
      <div className="mb-6">
        <Link
          href={`/events/${eventId}/setup-orders`}
          className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
        >
          &larr; Back to Setup Orders
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
          New Setup Order
        </h1>
      </div>

      <SetupOrderForm
        eventId={eventId}
        setupTypes={setupTypes}
        action={createSetupOrderAction}
      />
    </PageWrapper>
  );
}
