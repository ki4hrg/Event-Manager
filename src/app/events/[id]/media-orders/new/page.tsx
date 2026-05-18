import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getEvent } from "../../../actions";
import { createMediaOrder } from "../../../media-orders/actions";
import { MediaOrderForm } from "../../../media-orders/MediaOrderForm";
import { getResponsiblePartyVendors } from "@/app/vendors/actions";
import { flattenResponsiblePartyOptions } from "@/app/vendors/vendor-utils";
import { getSourceCancelPath, getSourceBackLabel, extractSourceName } from "@/lib/source-context";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New media order" };

export default async function NewMediaOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ functionId?: string; presentationId?: string }>;
}) {
  const { id: eventId } = await params;
  const { functionId, presentationId } = await searchParams;

  const [event, responsiblePartyVendors, sourceData] = await Promise.all([
    getEvent(eventId),
    getResponsiblePartyVendors(eventId, "MEDIA_ORDER"),
    functionId
      ? prisma.function.findUnique({ where: { id: functionId }, select: { name: true } })
      : presentationId
        ? prisma.presentation.findUnique({ where: { id: presentationId }, select: { title: true } })
        : Promise.resolve(null),
  ]);

  if (!event) notFound();

  const cancelPath = getSourceCancelPath(eventId, functionId, presentationId, `/events/${eventId}/media-orders`);
  const backLabel = getSourceBackLabel(functionId, presentationId, "Back to Media Orders");
  const defaultName = extractSourceName(sourceData);

  const createMediaOrderAction = async (formData: FormData) => {
    "use server";
    if (functionId) formData.set("functionId", functionId);
    if (presentationId) formData.set("presentationId", presentationId);
    await createMediaOrder(eventId, formData);
  };

  return (
    <>
      <div className="mb-6">
        <Link
          href={cancelPath}
          className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
        >
          &larr; {backLabel}
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
          New Media Order
        </h1>
      </div>

      <MediaOrderForm
        eventId={eventId}
        action={createMediaOrderAction}
        defaultName={defaultName}
        cancelPath={cancelPath}
        availableVendors={flattenResponsiblePartyOptions(responsiblePartyVendors).map((v) => ({ id: v.id, label: v.name }))}
      />
    </>
  );
}
