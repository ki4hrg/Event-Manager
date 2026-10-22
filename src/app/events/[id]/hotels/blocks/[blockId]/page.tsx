import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Toast } from "@/components/Toast";
import { DeleteButton } from "@/components/DeleteButton";
import { LastUpdated } from "@/components/LastUpdated";
import { btnSecondary } from "@/lib/buttonStyles";
import { blockTypeLabel, dateKey } from "@/lib/hotels";
import { blockPickup, pickupTotals } from "@/lib/hotelPickup";
import { hasPermission } from "@/lib/permissions";
import { getEvent } from "../../../../actions";
import { clearPickup, deleteHotelBlock, getBlockFormChoices, getHotelBlock, updateHotelBlock } from "../../../../hotels/actions";
import { toBlockValues } from "../../../../hotels/blockCore";
import { BlockForm } from "../../../../hotels/BlockForm";
import { PickupPanel } from "../../../../hotels/PickupPanel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Block" };

export default async function BlockPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; blockId: string }>;
  searchParams: Promise<{ guests?: string }>;
}) {
  const { id: eventId, blockId } = await params;
  // ?guests=all lifts the cap on the guest list shown (the pickup math always uses every guest).
  const allGuests = (await searchParams).guests === "all";
  const [event, block, choices, canViewHotel] = await Promise.all([
    getEvent(eventId),
    getHotelBlock(blockId, eventId),
    getBlockFormChoices(eventId),
    hasPermission("VENUES", "VIEW"),
  ]);
  if (!event || !block) notFound();

  const pickup = blockPickup({ nights: block.nights, guests: block.pickupGuests, counts: block.pickupCounts });
  const totals = pickupTotals(pickup);

  const updateAction = async (formData: FormData) => {
    "use server";
    return updateHotelBlock(blockId, eventId, formData);
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
      <PageHeader
        breadcrumbs={[
          { label: "Events", href: "/events" },
          { label: event.name, href: `/events/${eventId}` },
          { label: "Hotels", href: `/events/${eventId}/hotels` },
          { label: "Blocks", href: `/events/${eventId}/hotels#blocks` },
          { label: venue.name },
        ]}
        title={`Block · ${venue.name}${block.isHq ? " (HQ)" : ""}`}
        meta={
          <div className="space-y-1">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {[blockTypeLabel(block.proposal.contractType, block.proposal.guestType), `${totals.pickedUp} of ${totals.blocked} room nights picked up${totals.percent != null ? ` · ${totals.percent}%` : ""}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <LastUpdated updatedAt={block.updatedAt} updatedBy={block.updatedBy} timezone={event.timezone} />
          </div>
        }
        actions={
          <>
            {canViewHotel && (
              <Link href={`/venues/${venue.id}`} className={btnSecondary}>
                View hotel
              </Link>
            )}
            <Link href={`/events/${eventId}/hotels/proposals/${block.proposal.id}`} className={btnSecondary}>
              View proposal
            </Link>
            <Link href={`/events/${eventId}/reports/hotel-info`} className={btnSecondary}>
              Hotel Information
            </Link>
            <DeleteButton action={deleteAction} resource="HOTELS" label="Delete Block" />
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 min-w-0">
          {/* Autosaves: not keyed on updatedAt, or each save would remount it. */}
          <BlockForm
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
            guests={(allGuests ? block.pickupGuests : block.pickupGuests.slice(0, block.guestLimit)).map((g) => ({
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
            showAllHref={`/events/${eventId}/hotels/blocks/${blockId}?guests=all`}
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
