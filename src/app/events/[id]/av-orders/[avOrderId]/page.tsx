import { notFound } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";
import { PageWrapper } from "@/components/PageWrapper";
import { DeleteButton } from "@/components/DeleteButton";
import { Toast } from "@/components/Toast";
import { prisma } from "@/lib/prisma";
import { getEvent } from "../../../actions";
import {
  getAVOrder,
  updateAVOrder,
  deleteAVOrder,
  linkAVOrderToFunction,
  linkAVOrderToPresentation,
  unlinkAVOrderFromFunction,
  unlinkAVOrderFromPresentation,
} from "../../../av-orders/actions";
import { AVOrderForm } from "../../../av-orders/AVOrderForm";
import { AVOrderLinkPanel } from "../../../av-orders/AVOrderLinkPanel";
import { getOptions } from "@/app/settings/actions";

export const dynamic = "force-dynamic";

export default async function AVOrderPage({
  params,
}: {
  params: Promise<{ id: string; avOrderId: string }>;
}) {
  const { id: eventId, avOrderId } = await params;
  const [event, avOrder, avEquipment] = await Promise.all([
    getEvent(eventId),
    getAVOrder(avOrderId),
    getOptions("av_equipment"),
  ]);

  if (!event || !avOrder) {
    notFound();
  }

  // Get available functions and presentations for linking
  const [availableFunctions, availablePresentations] = await Promise.all([
    avOrder.functionId
      ? []
      : prisma.function.findMany({
          where: { eventId, avOrder: null },
          orderBy: { name: "asc" },
        }),
    avOrder.presentationId
      ? []
      : prisma.presentation.findMany({
          where: { eventId, avOrder: null },
          orderBy: { title: "asc" },
        }),
  ]);

  const updateAVOrderAction = async (formData: FormData) => {
    "use server";
    await updateAVOrder(avOrderId, eventId, formData);
  };

  const deleteAVOrderAction = async () => {
    "use server";
    await deleteAVOrder(avOrderId, eventId);
  };

  const linkToFunctionAction = async (functionId: string) => {
    "use server";
    await linkAVOrderToFunction(avOrderId, functionId, eventId);
  };

  const unlinkFromFunctionAction = async () => {
    "use server";
    await unlinkAVOrderFromFunction(avOrderId, eventId);
  };

  const linkToPresentationAction = async (presentationId: string) => {
    "use server";
    await linkAVOrderToPresentation(avOrderId, presentationId, eventId);
  };

  const unlinkFromPresentationAction = async () => {
    "use server";
    await unlinkAVOrderFromPresentation(avOrderId, eventId);
  };

  return (
    <PageWrapper>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="flex justify-between items-center mb-6">
        <div>
          <Link
            href={`/events/${eventId}/av-orders`}
            className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
          >
            &larr; Back to AV Orders
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
            {avOrder.name}
          </h1>
        </div>
        <DeleteButton
          action={deleteAVOrderAction}
          confirmMessage="Are you sure you want to delete this AV Order?"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <AVOrderForm
            avOrder={avOrder}
            eventId={eventId}
            avEquipment={avEquipment}
            action={updateAVOrderAction}
          />
        </div>

        <div className="space-y-6">
          <AVOrderLinkPanel
            title="Linked Function"
            linkedId={avOrder.functionId}
            linkedName={avOrder.function?.name ?? null}
            linkedDetailPath={
              avOrder.functionId
                ? `/events/${eventId}/functions/${avOrder.functionId}`
                : null
            }
            availableItems={availableFunctions.map((f) => ({ id: f.id, label: f.name }))}
            newItemPath={`/events/${eventId}/av-orders/new?functionId=placeholder`}
            linkItem={linkToFunctionAction}
            unlinkItem={unlinkFromFunctionAction}
            entityLabel="function"
          />

          <AVOrderLinkPanel
            title="Linked Presentation"
            linkedId={avOrder.presentationId}
            linkedName={avOrder.presentation?.title ?? null}
            linkedDetailPath={
              avOrder.presentationId
                ? `/events/${eventId}/presentations/${avOrder.presentationId}`
                : null
            }
            availableItems={availablePresentations.map((p) => ({ id: p.id, label: p.title }))}
            newItemPath={`/events/${eventId}/av-orders/new?presentationId=placeholder`}
            linkItem={linkToPresentationAction}
            unlinkItem={unlinkFromPresentationAction}
            entityLabel="presentation"
          />
        </div>
      </div>
    </PageWrapper>
  );
}
