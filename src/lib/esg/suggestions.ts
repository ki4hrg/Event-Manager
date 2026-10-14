// Suggestion lists for the ESG / Post-Event text fields tagged with `suggest`
// (src/lib/esg/fields.ts): the event's rooms and vendors, the tenant's venues
// and the event's key staff. Callers gate access; venues are read through the
// event's tenant, never the session's.

import { prisma } from "@/lib/prisma";
import { getEventRooms } from "@/lib/eventVenues";
import type { SuggestAttr, SuggestSource } from "@/lib/esg/fields";

export type Suggestion = { value: string; attrs?: Partial<Record<SuggestAttr, string | null>> };
export type SpecSuggestions = Record<SuggestSource, Suggestion[]>;

function unique(items: Suggestion[]): Suggestion[] {
  const seen = new Map<string, Suggestion>();
  for (const s of items) if (s.value && !seen.has(s.value)) seen.set(s.value, s);
  return Array.from(seen.values());
}

export async function loadSpecSuggestions(eventId: string): Promise<SpecSuggestions> {
  const [rooms, eventVendors, venues, keyStaff] = await Promise.all([
    getEventRooms(eventId),
    prisma.eventVendor.findMany({ where: { eventId }, select: { vendor: { select: { name: true } } } }),
    prisma.venue.findMany({
      where: { tenant: { events: { some: { id: eventId } } } },
      orderBy: { name: "asc" },
      select: { name: true, city: true, state: true, country: true },
    }),
    prisma.eventKeyStaff.findMany({
      where: { eventId },
      orderBy: { sortOrder: "asc" },
      select: { title: true, contact: { select: { firstName: true, lastName: true, organization: true } } },
    }),
  ]);
  const multiVenue = new Set(rooms.map((r) => r.venue.id)).size > 1;
  return {
    room: unique(rooms.map((r) => ({ value: multiVenue ? `${r.name} (${r.venue.name})` : r.name }))),
    vendor: unique(eventVendors.map((v) => ({ value: v.vendor.name })).sort((a, b) => a.value.localeCompare(b.value))),
    venue: unique(venues.map((v) => ({ value: v.name, attrs: { city: v.city, state: v.state, country: v.country } }))),
    contact: unique(
      keyStaff.map((k) => ({
        value: `${k.contact.firstName} ${k.contact.lastName}`.trim(),
        attrs: { title: k.title, organization: k.contact.organization },
      })),
    ),
  };
}
