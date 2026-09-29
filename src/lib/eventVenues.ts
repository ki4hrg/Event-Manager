import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sortRoomsByGroupThenName } from "@/lib/roomGroups";

// An event's venues in display order. The first is the primary venue — see the
// EventVenue comment in prisma/schema.prisma.
export const eventVenuesOrderBy = [
  { sortOrder: "asc" },
  { createdAt: "asc" },
] satisfies Prisma.EventVenueOrderByWithRelationInput[];

export const eventVenuesInclude = {
  venues: { orderBy: eventVenuesOrderBy, include: { venue: true } },
} satisfies Prisma.EventInclude;

export function venueNames(event: { venues: { venue: { name: string } }[] }): string {
  return event.venues.map((v) => v.venue.name).join(", ");
}

// Every room across the event's venues, venue-first (in event order), then by
// room group, then name. Each room carries `venue: { id, name, rank }` so the
// grouping helpers in @/lib/roomGroups can split pickers by venue once an
// event spans more than one.
export async function getEventRooms(eventId: string) {
  const links = await prisma.eventVenue.findMany({
    where: { eventId },
    orderBy: eventVenuesOrderBy,
    select: {
      venue: {
        select: {
          id: true,
          name: true,
          rooms: {
            include: { group: { select: { id: true, name: true, sortOrder: true } } },
            orderBy: { name: "asc" },
          },
        },
      },
    },
  });
  return sortRoomsByGroupThenName(
    links.flatMap(({ venue }, rank) =>
      venue.rooms.map((room) => ({ ...room, venue: { id: venue.id, name: venue.name, rank } })),
    ),
  );
}

export type EventRoom = Awaited<ReturnType<typeof getEventRooms>>[number];
