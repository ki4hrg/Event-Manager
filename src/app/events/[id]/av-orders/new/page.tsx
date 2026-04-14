import { notFound } from "next/navigation";
import Link from "next/link";
import { PageWrapper } from "@/components/PageWrapper";
import { prisma } from "@/lib/prisma";
import { getEvent } from "../../../actions";
import { createAVOrder } from "../../../av-orders/actions";
import { AVOrderForm } from "../../../av-orders/AVOrderForm";

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

  const [event, availableFunctions, availablePresentations] = await Promise.all([
    getEvent(eventId),
    prisma.function.findMany({ where: { eventId, avOrderId: null }, orderBy: { name: "asc" } }),
    prisma.presentation.findMany({ where: { eventId, avOrder: null }, orderBy: { title: "asc" } }),
  ]);

  if (!event) {
    notFound();
  }

  const createAVOrderAction = async (formData: FormData) => {
    "use server";
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
        action={createAVOrderAction}
        availableFunctions={availableFunctions.map((f) => ({ id: f.id, label: f.name }))}
        availablePresentations={availablePresentations.map((p) => ({ id: p.id, label: p.title }))}
        defaultFunctionId={functionId}
        defaultPresentationId={presentationId}
      />
    </PageWrapper>
  );
}
