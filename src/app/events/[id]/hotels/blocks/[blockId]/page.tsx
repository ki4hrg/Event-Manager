import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Toast } from "@/components/Toast";
import { DeleteButton } from "@/components/DeleteButton";
import { LastUpdated } from "@/components/LastUpdated";
import { btnSecondary } from "@/lib/buttonStyles";
import { dateKey } from "@/lib/hotels";
import { blockPickup, pickupTotals } from "@/lib/hotelPickup";
import { getEvent } from "../../../../actions";
import { clearPickup, deleteHotelBlock, getBlockFormChoices, getHotelBlock, updateHotelBlock } from "../../../../hotels/actions";
import { toBlockValues } from "../../../../hotels/blockCore";
import { BlockForm } from "../../../../hotels/BlockForm";
import { PickupPanel } from "../../../../hotels/PickupPanel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Block" };

export default async function BlockPage({ params }: { params: Promise<{ id: string; blockId: string }> }) {
  const { id: eventId, blockId } = await params;
  const [event, block, choices] = await Promise.all([getEvent(eventId), getHotelBlock(blockId, eventId), getBlockFormChoices(eventId)]);
  if (!event || !block) notFound();

  const pickup = blockPickup({ nights: block.nights, guests: block.pickupGuests, counts: block.pickupCounts });
  const totals = pickupTotals(pickup);

  const updateAction = async (formData: FormData) => {
    "use server";
    await updateHotelBlock(blockId, eventId, formData);
  };
  const deleteAction = async () => {
    "use server";
    await deleteHotelBlock(blockId, eventId);
  };
  const clearAction = async () => {
    "use server";
    await clearPickup(blockId, eventId);
  };

  const venue = block.proposal.venue;
  return (
    <>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-6">
        <div className="min-w-0">
          <Breadcrumbs
            items={[
              { label: "Events", href: "/events" },
              { label: event.name, href: `/events/${eventId}` },
              { label: "Hotels", href: `/events/${eventId}/hotels` },
              { label: venue.name },
            ]}
          />
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1 break-words">
            {venue.name}
            {block.isHq && <span className="ml-2 text-base text-gray-500 dark:text-gray-400">HQ</span>}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {totals.pickedUp} of {totals.blocked} room nights picked up
            {totals.percent != null && ` · ${totals.percent}%`}
          </p>
          <LastUpdated updatedAt={block.updatedAt} updatedBy={block.updatedBy} timezone={event.timezone} className="mt-2" />
        </div>
        <div className="flex flex-wrap gap-2 sm:flex-shrink-0">
          <Link href={`/events/${eventId}/hotels/proposals/${block.proposal.id}`} className={btnSecondary}>
            Proposal
          </Link>
          <DeleteButton action={deleteAction} resource="HOTELS" label="Delete Block" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 min-w-0">
          <BlockForm
            key={block.updatedAt.toISOString()}
            block={toBlockValues(block)}
            pickup={pickup}
            roomTypes={choices.roomTypes}
            reservationMethods={choices.reservationMethods}
            action={updateAction}
          />
        </div>
        <div className="min-w-0">
          <PickupPanel
            pickupHref={`/events/${eventId}/hotels/blocks/${blockId}/pickup`}
            guests={block.pickupGuests.slice(0, block.guestLimit).map((g) => ({
              id: g.id,
              guestName: g.guestName,
              confirmationNumber: g.confirmationNumber,
              checkIn: g.checkIn ? dateKey(g.checkIn) : null,
              checkOut: g.checkOut ? dateKey(g.checkOut) : null,
              roomType: g.roomType,
              cancelled: g.cancelled,
              bookedOn: g.bookedOn ? dateKey(g.bookedOn) : null,
              cancelledOn: g.cancelledOn ? dateKey(g.cancelledOn) : null,
            }))}
            guestTotal={block.pickupGuests.length}
            counts={block.pickupCounts.map((c) => ({ night: dateKey(c.night), roomType: c.roomType, rooms: c.rooms }))}
            imports={block.pickupImports.map((i) => ({
              id: i.id,
              method: i.method,
              fileName: i.fileName,
              inserted: i.inserted,
              updated: i.updated,
              createdAt: i.createdAt,
              by: i.importedBy?.name ?? i.importedBy?.email ?? null,
            }))}
            timezone={event.timezone}
            clear={clearAction}
          />
        </div>
      </div>
    </>
  );
}
