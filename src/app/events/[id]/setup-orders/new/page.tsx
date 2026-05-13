import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getEvent } from "../../../actions";
import { createSetupOrder } from "../../../setup-orders/actions";
import { SetupOrderForm } from "../../../setup-orders/SetupOrderForm";
import { getOptions } from "@/app/settings/actions";
import { getResponsiblePartyVendors } from "@/app/vendors/actions";
import { flattenResponsiblePartyOptions } from "@/app/vendors/vendor-utils";
import { getSourceCancelPath, getSourceBackLabel, extractSourceName } from "@/lib/source-context";

export const dynamic = "force-dynamic";

export default async function NewSetupOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ functionId?: string; roomId?: string; presentationId?: string }>;
}) {
  const { id: eventId } = await params;
  const { functionId, roomId, presentationId } = await searchParams;

  const isFromSource = !!(functionId || presentationId);

  const [event, setupTypes, responsiblePartyVendors, sourceData] = await Promise.all([
    getEvent(eventId),
    getOptions("setup_type"),
    getResponsiblePartyVendors(eventId, "SETUP_ORDER"),
    functionId
      ? prisma.function.findUnique({
          where: { id: functionId },
          select: { name: true, rooms: { take: 1, select: { roomId: true } } },
        })
      : presentationId
        ? prisma.presentation.findUnique({ where: { id: presentationId }, select: { title: true } })
        : Promise.resolve(null),
  ]);

  if (!event) notFound();

  const [venueRooms, eventFunctions] = await Promise.all([
    !presentationId && event.venueId
      ? prisma.room.findMany({ where: { venueId: event.venueId }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    isFromSource
      ? Promise.resolve([])
      : prisma.function.findMany({
          where: { eventId, setupOrderId: null },
          include: { rooms: true },
          orderBy: { name: "asc" },
        }),
  ]);

  const initialRoomId =
    roomId ?? (sourceData && "rooms" in sourceData ? sourceData.rooms[0]?.roomId : undefined);

  const cancelPath = getSourceCancelPath(eventId, functionId, presentationId, `/events/${eventId}/setup-orders`);
  const backLabel = getSourceBackLabel(functionId, presentationId, "Back to Setup Orders");
  const defaultName = extractSourceName(sourceData);

  const createSetupOrderAction = async (formData: FormData) => {
    "use server";
    await createSetupOrder(eventId, formData);
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
          New Setup Order
        </h1>
      </div>

      <SetupOrderForm
        eventId={eventId}
        setupTypes={setupTypes}
        action={createSetupOrderAction}
        rooms={venueRooms}
        functions={eventFunctions.map((f) => ({
          id: f.id,
          name: f.name,
          roomIds: f.rooms.map((r) => r.roomId),
        }))}
        initialRoomId={initialRoomId}
        lockedFunctionId={functionId}
        lockedPresentationId={presentationId}
        defaultName={defaultName}
        cancelPath={cancelPath}
        availableVendors={flattenResponsiblePartyOptions(responsiblePartyVendors).map((v) => ({ id: v.id, label: v.name }))}
      />
    </>
  );

}
