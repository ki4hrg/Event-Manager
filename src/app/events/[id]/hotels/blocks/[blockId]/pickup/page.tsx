import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { dateKey } from "@/lib/hotels";
import { requirePermission } from "@/lib/permissions";
import { getEvent } from "../../../../../actions";
import { getBlockFormChoices, getHotelBlock, importPickupGuests, savePickupCounts } from "../../../../../hotels/actions";
import { PickupImport } from "../../../../../hotels/PickupImport";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Pickup" };

export default async function PickupPage({ params }: { params: Promise<{ id: string; blockId: string }> }) {
  const { id: eventId, blockId } = await params;
  await requirePermission("HOTELS", "WRITE", eventId);
  const [event, block, choices] = await Promise.all([getEvent(eventId), getHotelBlock(blockId, eventId), getBlockFormChoices(eventId)]);
  if (!event || !block) notFound();

  const importAction = async (
    method: Parameters<typeof importPickupGuests>[2],
    fileName: string | null,
    guests: Parameters<typeof importPickupGuests>[4],
  ) => {
    "use server";
    await importPickupGuests(blockId, eventId, method, fileName, guests);
  };
  const countsAction = async (counts: Parameters<typeof savePickupCounts>[2]) => {
    "use server";
    await savePickupCounts(blockId, eventId, counts);
  };

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
      <div className="max-w-5xl">
        <PickupImport
          blockHref={blockHref}
          checkIn={block.checkIn ? dateKey(block.checkIn) : null}
          checkOut={block.checkOut ? dateKey(block.checkOut) : null}
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
