import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getEvent } from "../../../actions";
import { createMediaDeliverable } from "../../../media-deliverables/actions";
import { MediaDeliverableForm } from "../../../media-deliverables/MediaDeliverableForm";
import { getResponsibleParties } from "@/lib/responsibleParties";
import { getOptions } from "@/app/settings/actions";
import { getSourceCancelPath, getSourceBackLabel, extractSourceName } from "@/lib/source-context";
import { requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New media deliverable" };

export default async function NewMediaDeliverablePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ functionId?: string; presentationId?: string }>;
}) {
  const { id: eventId } = await params;
  // A VIEW-only user has no business on a create form; gate the page so they
  // never reach a form whose action would refuse the submit.
  await requirePermission("MEDIA_DELIVERABLES", "WRITE", eventId);
  const { functionId, presentationId } = await searchParams;

  const [event, pool, mediaTypeOptions, deliveryOptions, sourceData] = await Promise.all([
    getEvent(eventId),
    getResponsibleParties({
      eventId,
      modelType: "MEDIA_DELIVERABLE",
      functionIds: functionId ? [functionId] : undefined,
      presentationIds: presentationId ? [presentationId] : undefined,
    }),
    getOptions("media_type"),
    getOptions("delivery_method"),
    functionId
      ? prisma.function.findUnique({ where: { id: functionId }, select: { name: true } })
      : presentationId
        ? prisma.presentation.findUnique({ where: { id: presentationId }, select: { title: true } })
        : Promise.resolve(null),
  ]);

  if (!event) notFound();

  const cancelPath = getSourceCancelPath(eventId, functionId, presentationId, `/events/${eventId}/media-deliverables`);
  const backLabel = getSourceBackLabel(functionId, presentationId, "Back to Media Deliverables");
  const defaultName = extractSourceName(sourceData);

  const createAction = async (formData: FormData) => {
    "use server";
    if (functionId) formData.set("functionId", functionId);
    if (presentationId) formData.set("presentationId", presentationId);
    await createMediaDeliverable(eventId, formData);
  };

  return (
    <>
      <div className="mb-6">
        <Link href={cancelPath} className="text-sm text-gray-600 dark:text-gray-400 hover:underline">
          &larr; {backLabel}
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">New Media Deliverable</h1>
      </div>

      <MediaDeliverableForm
        eventId={eventId}
        action={createAction}
        defaultName={defaultName}
        cancelPath={cancelPath}
        pool={pool}
        mediaTypeOptions={mediaTypeOptions}
        deliveryOptions={deliveryOptions}
      />
    </>
  );
}
