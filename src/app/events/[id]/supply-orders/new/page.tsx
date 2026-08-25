import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getEvent } from "../../../actions";
import { createSupplyOrder } from "../../../supply-orders/actions";
import { SupplyOrderForm } from "../../../supply-orders/SupplyOrderForm";
import { getResponsibleParties } from "@/lib/responsibleParties";
import { sortRoomsByGroupThenName } from "@/lib/roomGroups";
import { getSourceCancelPath, getSourceBackLabel, extractSourceName } from "@/lib/source-context";
import { requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New supply order" };

export default async function NewSupplyOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ functionId?: string; presentationId?: string; roomId?: string }>;
}) {
  const { id: eventId } = await params;
  // A VIEW-only user has no business on a create form; gate the page so they
  // never reach a form whose action would refuse the submit.
  await requirePermission("SUPPLY_ORDERS", "WRITE", eventId);
  const { functionId, presentationId, roomId } = await searchParams;

  const [event, pool, sourceData] = await Promise.all([
    getEvent(eventId),
    getResponsibleParties({
      eventId,
      modelType: "SUPPLY_ORDER",
      functionIds: functionId ? [functionId] : [],
      presentationIds: presentationId ? [presentationId] : [],
    }),
    functionId
      ? prisma.function.findUnique({ where: { id: functionId }, select: { name: true } })
      : presentationId
        ? prisma.presentation.findUnique({ where: { id: presentationId }, select: { title: true } })
        : Promise.resolve(null),
  ]);

  if (!event) notFound();

  const rooms = sortRoomsByGroupThenName(
    event.venueId
      ? await prisma.room.findMany({
          where: { venueId: event.venueId },
          include: { group: { select: { id: true, name: true, sortOrder: true } } },
          orderBy: { name: "asc" },
        })
      : []
  );

  const cancelPath = getSourceCancelPath(eventId, functionId, presentationId, `/events/${eventId}/supply-orders`);
  const backLabel = getSourceBackLabel(functionId, presentationId, "Back to Supply Orders");
  const defaultName = extractSourceName(sourceData);

  const createSupplyOrderAction = async (formData: FormData) => {
    "use server";
    if (functionId) formData.set("functionId", functionId);
    if (presentationId) formData.set("presentationId", presentationId);
    await createSupplyOrder(eventId, formData);
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
          New Supply Order
        </h1>
      </div>

      <SupplyOrderForm
        eventId={eventId}
        rooms={rooms}
        pool={pool}
        initialRoomId={roomId}
        action={createSupplyOrderAction}
        defaultName={defaultName}
        cancelPath={cancelPath}
      />
    </>
  );
}
