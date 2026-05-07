import { notFound } from "next/navigation";
import Link from "next/link";
import { PageWrapper } from "@/components/PageWrapper";
import { prisma } from "@/lib/prisma";
import { getEvent } from "../../../actions";
import { createAVOrder } from "../../../av-orders/actions";
import { AVOrderForm } from "../../../av-orders/AVOrderForm";
import { searchAssignedEventVendors } from "@/app/vendors/actions";

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

  const [event, availableFunctions, availablePresentations, eventVendors, sourcePresentation] = await Promise.all([
    getEvent(eventId),
    prisma.function.findMany({ where: { eventId, avOrderId: null }, orderBy: { name: "asc" } }),
    prisma.presentation.findMany({ where: { eventId, avOrder: null }, orderBy: { title: "asc" } }),
    searchAssignedEventVendors("", eventId, "AV_ORDER"),
    presentationId
      ? prisma.presentation.findUnique({ where: { id: presentationId }, select: { title: true } })
      : Promise.resolve(null),
  ]);

  if (!event) {
    notFound();
  }

  const cancelPath = presentationId
    ? `/events/${eventId}/presentations/${presentationId}`
    : `/events/${eventId}/av-orders`;

  const createAVOrderAction = async (formData: FormData) => {
    "use server";
    await createAVOrder(eventId, formData);
  };

  return (
    <PageWrapper>
      <div className="mb-6">
        <Link
          href={cancelPath}
          className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
        >
          &larr; {presentationId ? "Back to Presentation" : "Back to AV Orders"}
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
        defaultName={sourcePresentation?.title}
        cancelPath={cancelPath}
        availableVendors={eventVendors.map((v) => ({ id: v.id, label: v.name }))}
      />
    </PageWrapper>
  );
}
