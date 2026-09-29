import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getEvent } from "../../../actions";
import { createPrintOrder } from "../../../print-orders/actions";
import { PrintOrderForm } from "../../../print-orders/PrintOrderForm";
import { getResponsiblePartyVendors } from "@/app/vendors/actions";
import { flattenResponsiblePartyOptions } from "@/app/vendors/vendor-utils";
import { getSourceCancelPath, getSourceBackLabel, extractSourceName } from "@/lib/source-context";
import { getEventRooms } from "@/lib/eventVenues";
import { requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New print order" };

export default async function NewPrintOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ functionId?: string; presentationId?: string }>;
}) {
  const { id: eventId } = await params;
  // A VIEW-only user has no business on a create form; gate the page so they
  // never reach a form whose action would refuse the submit.
  await requirePermission("PRINT_ORDERS", "WRITE", eventId);
  const { functionId, presentationId } = await searchParams;

  const [event, responsiblePartyVendors, sourceData] = await Promise.all([
    getEvent(eventId),
    getResponsiblePartyVendors(eventId, "PRINT_ORDER"),
    functionId
      ? prisma.function.findUnique({ where: { id: functionId }, select: { name: true } })
      : presentationId
        ? prisma.presentation.findUnique({ where: { id: presentationId }, select: { title: true } })
        : Promise.resolve(null),
  ]);

  if (!event) notFound();

  const venueRooms = await getEventRooms(eventId);

  const cancelPath = getSourceCancelPath(eventId, functionId, presentationId, `/events/${eventId}/print-orders`);
  const backLabel = getSourceBackLabel(functionId, presentationId, "Back to Print Orders");
  const defaultName = extractSourceName(sourceData);

  const createPrintOrderAction = async (formData: FormData) => {
    "use server";
    if (functionId) formData.set("functionId", functionId);
    if (presentationId) formData.set("presentationId", presentationId);
    await createPrintOrder(eventId, formData);
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
          New Print Order
        </h1>
      </div>

      <PrintOrderForm
        eventId={eventId}
        rooms={venueRooms}
        action={createPrintOrderAction}
        defaultName={defaultName}
        cancelPath={cancelPath}
        availableVendors={flattenResponsiblePartyOptions(responsiblePartyVendors).map((v) => ({ id: v.id, label: v.name }))}
      />
    </>
  );

}
