import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getEvent } from "../../../actions";
import { createAVOrder } from "../../../av-orders/actions";
import { AVOrderForm } from "../../../av-orders/AVOrderForm";
import { getResponsiblePartyVendors } from "@/app/vendors/actions";
import { getSourceCancelPath, getSourceBackLabel, extractSourceName } from "@/lib/source-context";
import { requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New AV order" };

export default async function NewAVOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ functionId?: string; presentationId?: string }>;
}) {
  const { id: eventId } = await params;
  // A VIEW-only user has no business on a create form; gate the page so they
  // never reach a form whose action would refuse the submit.
  await requirePermission("AV_ORDERS", "WRITE", eventId);
  const { functionId, presentationId } = await searchParams;

  const isFromSource = !!(functionId || presentationId);

  const [event, responsiblePartyVendors, sourceLabel] = await Promise.all([
    getEvent(eventId),
    getResponsiblePartyVendors(eventId, "AV_ORDER"),
    functionId
      ? prisma.function.findUnique({ where: { id: functionId }, select: { name: true } })
      : presentationId
        ? prisma.presentation.findUnique({ where: { id: presentationId }, select: { title: true } })
        : Promise.resolve(null),
  ]);

  if (!event) notFound();

  const [availableFunctions, availablePresentations] = isFromSource
    ? [undefined, undefined]
    : await Promise.all([
        prisma.function.findMany({ where: { eventId }, orderBy: { name: "asc" } }),
        prisma.presentation.findMany({ where: { eventId }, orderBy: { title: "asc" } }),
      ]);

  const cancelPath = getSourceCancelPath(eventId, functionId, presentationId, `/events/${eventId}/av-orders`);
  const backLabel = getSourceBackLabel(functionId, presentationId, "Back to AV Orders");
  const defaultName = extractSourceName(sourceLabel);

  const createAVOrderAction = async (formData: FormData) => {
    "use server";
    await createAVOrder(eventId, formData);
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
          New AV Order
        </h1>
      </div>

      <AVOrderForm
        eventId={eventId}
        action={createAVOrderAction}
        availableFunctions={availableFunctions?.map((f) => ({ id: f.id, label: f.name }))}
        availablePresentations={availablePresentations?.map((p) => ({ id: p.id, label: p.title }))}
        lockedFunctionId={functionId}
        lockedPresentationId={presentationId}
        defaultName={defaultName}
        cancelPath={cancelPath}
        responsiblePartyOptions={responsiblePartyVendors}
      />
    </>
  );

}
