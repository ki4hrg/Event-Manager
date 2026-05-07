import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageWrapper } from "@/components/PageWrapper";
import { getEvent } from "../../../actions";
import { createSetupOrder } from "../../../setup-orders/actions";
import { SetupOrderForm } from "../../../setup-orders/SetupOrderForm";
import { getOptions } from "@/app/settings/actions";
import { searchAssignedEventVendors } from "@/app/vendors/actions";

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

  const [event, setupTypes] = await Promise.all([
    getEvent(eventId),
    getOptions("setup_type"),
  ]);

  if (!event) {
    notFound();
  }

  const [venueRooms, eventFunctions, eventVendors, sourcePresentation] = await Promise.all([
    event.venueId
      ? prisma.room.findMany({ where: { venueId: event.venueId }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    prisma.function.findMany({
      where: { eventId, setupOrderId: null },
      include: { rooms: true },
      orderBy: { name: "asc" },
    }),
    searchAssignedEventVendors("", eventId, "SETUP_ORDER"),
    presentationId
      ? prisma.presentation.findUnique({ where: { id: presentationId }, select: { title: true } })
      : Promise.resolve(null),
  ]);

  // If a functionId is provided, infer the roomId from that function's first room
  let initialRoomId = roomId;
  if (!initialRoomId && functionId) {
    const fn = eventFunctions.find((f) => f.id === functionId);
    initialRoomId = fn?.rooms[0]?.roomId;
  }

  const cancelPath = presentationId
    ? `/events/${eventId}/presentations/${presentationId}`
    : `/events/${eventId}/setup-orders`;

  const createSetupOrderAction = async (formData: FormData) => {
    "use server";
    await createSetupOrder(eventId, formData);
  };

  return (
    <PageWrapper>
      <div className="mb-6">
        <Link
          href={cancelPath}
          className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
        >
          &larr; {presentationId ? "Back to Presentation" : "Back to Setup Orders"}
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
        initialFunctionId={functionId}
        defaultName={sourcePresentation?.title}
        cancelPath={cancelPath}
        availableVendors={eventVendors.map((v) => ({ id: v.id, label: v.name }))}
      />
    </PageWrapper>
  );
}
