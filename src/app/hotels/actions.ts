"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";

// The active tenant's lodging venues with their proposal history.
export async function getHotels() {
  const { tenantId } = await requirePermission("HOTELS", "VIEW");
  return prisma.venue.findMany({
    where: { tenantId, isLodging: true },
    select: {
      id: true,
      name: true,
      city: true,
      state: true,
      brand: true,
      area: true,
      hotelProposals: {
        select: { id: true, status: true, event: { select: { id: true, name: true, startDate: true } } },
        orderBy: { event: { startDate: "desc" } },
      },
    },
    orderBy: { name: "asc" },
  });
}

// One venue's proposals across events, newest event first.
export async function getVenueHotelHistory(venueId: string) {
  const { tenantId } = await requirePermission("HOTELS", "VIEW");
  return prisma.hotelProposal.findMany({
    where: { venueId, venue: { tenantId } },
    select: {
      id: true,
      status: true,
      revision: true,
      blockType: true,
      event: { select: { id: true, name: true, startDate: true, timezone: true } },
    },
    orderBy: { event: { startDate: "desc" } },
  });
}
