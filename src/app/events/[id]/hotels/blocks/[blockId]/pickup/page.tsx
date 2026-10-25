import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { dateKey } from "@/lib/hotels";
import { requirePermission } from "@/lib/permissions";
import { getEvent } from "@/app/events/event";
import {
  createPickupGuest,
  getBlockFormChoices,
  getHotelBlock,
  importPickupGuests,
  savePickupCounts,
  setPickupGuestCancelled,
  updatePickupGuest,
} from "../../../../../hotels/actions";
import { PickupImport } from "../../../../../hotels/PickupImport";
import { PickupGuests } from "../../../../../hotels/PickupGuests";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Pickup" };

export default async function PickupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; blockId: string }>;
  searchParams: Promise<{ guest?: string }>;
}) {
  const { id: eventId, blockId } = await params;
  // ?guest=<id> opens that guest for editing (the block page's Edit link).
  const { guest: openGuestId } = await searchParams;
  await requirePermission("HOTELS", "WRITE", eventId);
  const [event, block, choices] = await Promise.all([getEvent(eventId), getHotelBlock(blockId, eventId), getBlockFormChoices(eventId)]);
  if (!event || !block) notFound();

  const importAction = async (
    method: Parameters<typeof importPickupGuests>[2],
    fileName: string | null,
    guests: Parameters<typeof importPickupGuests>[4],
  ) => {
    "use server";
    return importPickupGuests(blockId, eventId, method, fileName, guests);
  };
  const countsAction = async (counts: Parameters<typeof savePickupCounts>[2]) => {
    "use server";
    return savePickupCounts(blockId, eventId, counts);
  };

  const createGuestAction = async (formData: FormData) => {
    "use server";
    return createPickupGuest(blockId, eventId, formData);
  };
  const updateGuestAction = async (guestId: string, formData: FormData) => {
    "use server";
    return updatePickupGuest(guestId, blockId, eventId, formData);
  };
  const cancelGuestAction = async (guestId: string, cancelled: boolean) => {
    "use server";
    return setPickupGuestCancelled(guestId, blockId, eventId, cancelled);
  };

  const key = (d: Date | null) => (d ? dateKey(d) : null);
  const typedRoomTypes = block.nights.flatMap((n) => (n.roomType != null ? [n.roomType] : []));
  const venue = block.proposal.venue;
  const blockHref = `/events/${eventId}/hotels/blocks/${blockId}`;
  return (
    <>
      <div className="mb-6">
        <Breadcrumbs
          items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${eventId}` },
            { label: "Hotels", href: `/events/${eventId}/hotels` },
            { label: "Blocks", href: `/events/${eventId}/hotels#blocks` },
            { label: venue.name, href: blockHref },
            { label: "Pickup" },
          ]}
        />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1 break-words">Pickup · {venue.name}</h1>
      </div>
      <div className="max-w-5xl space-y-6">
        <PickupGuests
          guests={block.pickupGuests.map((g) => ({
            id: g.id,
            guestName: g.guestName,
            confirmationNumber: g.confirmationNumber,
            checkIn: key(g.checkIn),
            checkOut: key(g.checkOut),
            roomType: g.roomType,
            cancelled: g.cancelled,
            bookedOn: key(g.bookedOn),
            cancelledOn: key(g.cancelledOn),
          }))}
          roomTypes={Array.from(new Set([...typedRoomTypes, ...choices.roomTypes]))}
          checkIn={key(block.checkIn)}
          checkOut={key(block.checkOut)}
          initialGuestId={openGuestId ?? null}
          createGuest={createGuestAction}
          updateGuest={updateGuestAction}
          setCancelled={cancelGuestAction}
        />
        <PickupImport
          blockHref={blockHref}
          checkIn={key(block.checkIn)}
          checkOut={key(block.checkOut)}
          blockRoomTypes={Array.from(new Set(block.nights.map((n) => n.roomType)))}
          tenantRoomTypes={choices.roomTypes}
          hasGuests={block.pickupGuests.length > 0}
          counts={block.pickupCounts.map((c) => ({ night: dateKey(c.night), roomType: c.roomType, rooms: c.rooms }))}
          importGuests={importAction}
          saveCounts={countsAction}
        />
      </div>
    </>
  );
}
