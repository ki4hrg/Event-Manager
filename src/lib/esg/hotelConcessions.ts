// ESG Part I §W "Special concessions and negotiated items / services": what
// each contracted hotel agreed to — requested concessions it met (fully or
// partly) and ones it offered unasked. A contracted hotel is one whose
// proposal is accepted or became a block. No auth: callers gate it.

import { prisma } from "@/lib/prisma";
import { MET_LABELS } from "@/lib/hotels";

export type HotelConcessions = { hotel: string; items: { label: string; terms: string | null }[] };

export async function loadHotelConcessions(eventId: string): Promise<HotelConcessions[]> {
  const accepted = await prisma.customOption.findMany({
    where: { tenant: { events: { some: { id: eventId } } }, category: "proposal_status", group: "ACCEPTED" },
    select: { label: true },
  });
  const proposals = await prisma.hotelProposal.findMany({
    where: { eventId, OR: [{ status: { in: accepted.map((s) => s.label) } }, { blocks: { some: {} } }] },
    select: {
      venue: { select: { name: true } },
      concessions: {
        where: { OR: [{ concessionId: null }, { met: { in: ["MET", "PARTIAL"] } }] },
        orderBy: { sortOrder: "asc" },
        select: { label: true, offered: true, met: true, concession: { select: { label: true } } },
      },
    },
    orderBy: { venue: { name: "asc" } },
  });
  return proposals
    .map((p) => ({
      hotel: p.venue.name,
      items: p.concessions.map((c) => ({
        label: c.concession?.label ?? c.label ?? "",
        terms: [c.met === "PARTIAL" ? MET_LABELS.PARTIAL : null, c.offered].filter(Boolean).join(": ") || null,
      })),
    }))
    .filter((h) => h.items.length > 0);
}
