type RoomGroupRef = { id: string; name: string; sortOrder: number } | null;

// Present on rooms loaded through getEventRooms (@/lib/eventVenues). `rank` is
// the venue's position on the event (0 = primary); absent, rooms sort as if
// they share one venue.
type RoomVenueRef = { id: string; name: string; rank?: number };

export const UNGROUPED_LABEL = "Ungrouped";

export function compareRoomsByGroup(
  a: { name: string; group?: RoomGroupRef; venue?: RoomVenueRef },
  b: { name: string; group?: RoomGroupRef; venue?: RoomVenueRef }
): number {
  const aRank = a.venue?.rank ?? 0;
  const bRank = b.venue?.rank ?? 0;
  if (aRank !== bRank) return aRank - bRank;
  const aOrder = a.group?.sortOrder ?? Number.MAX_SAFE_INTEGER;
  const bOrder = b.group?.sortOrder ?? Number.MAX_SAFE_INTEGER;
  if (aOrder !== bOrder) return aOrder - bOrder;
  const aGroupName = a.group?.name ?? "";
  const bGroupName = b.group?.name ?? "";
  if (aGroupName !== bGroupName) return aGroupName.localeCompare(bGroupName);
  return a.name.localeCompare(b.name);
}

export function sortRoomsByGroupThenName<TRoom extends { name: string; group?: RoomGroupRef; venue?: RoomVenueRef }>(
  rooms: TRoom[]
): TRoom[] {
  return [...rooms].sort(compareRoomsByGroup);
}

// True when the rooms come from more than one venue — the signal to label
// rooms and buckets with their venue.
export function spansMultipleVenues(rooms: { venue?: RoomVenueRef }[]): boolean {
  return new Set(rooms.map((r) => r.venue?.id).filter(Boolean)).size > 1;
}

// "Ballroom · Grand Hotel" when the list spans venues, plain "Ballroom" otherwise.
export function roomLabel(room: { name: string; venue?: RoomVenueRef }, multiVenue: boolean): string {
  return multiVenue && room.venue ? `${room.name} · ${room.venue.name}` : room.name;
}

export type GroupedRooms<TRoom> = {
  key: string;
  label: string;
  groupId: string | null;
  // Whether the bucket has a meaningful heading: a real room group, or a
  // venue once the rooms span more than one. Consumers render headers /
  // "select all" controls only for named buckets.
  named: boolean;
  venueRank: number;
  sortOrder: number;
  rooms: TRoom[];
};

export function groupRoomsByGroup<TRoom extends { id: string; name: string; groupId?: string | null; group?: RoomGroupRef; venue?: RoomVenueRef }>(
  rooms: TRoom[]
): GroupedRooms<TRoom>[] {
  const multiVenue = spansMultipleVenues(rooms);
  const buckets = new Map<string, GroupedRooms<TRoom>>();
  for (const room of rooms) {
    const group = room.group ?? null;
    const groupKey = group?.id ?? "__ungrouped__";
    const venue = multiVenue ? room.venue ?? null : null;
    const key = venue ? `${venue.id}-${groupKey}` : groupKey;
    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        label: venue
          ? group ? `${venue.name} · ${group.name}` : venue.name
          : group?.name ?? UNGROUPED_LABEL,
        groupId: group?.id ?? null,
        named: group !== null || venue !== null,
        sortOrder: group?.sortOrder ?? Number.MAX_SAFE_INTEGER,
        venueRank: venue?.rank ?? 0,
        rooms: [],
      });
    }
    buckets.get(key)!.rooms.push(room);
  }
  // A venue's ungrouped bucket is labelled with the bare venue name only when
  // it holds every room of that venue. If the venue also has room groups,
  // "Grand Hotel" would read as the whole venue, so say "Grand Hotel · Ungrouped".
  if (multiVenue) {
    const venuesWithGroups = new Set(
      rooms.filter((r) => r.group && r.venue).map((r) => r.venue!.id),
    );
    for (const room of rooms) {
      if (room.group || !room.venue || !venuesWithGroups.has(room.venue.id)) continue;
      const bucket = buckets.get(`${room.venue.id}-__ungrouped__`);
      if (bucket) bucket.label = `${room.venue.name} · ${UNGROUPED_LABEL}`;
    }
  }
  return Array.from(buckets.values())
    .map((b) => ({ ...b, rooms: [...b.rooms].sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => {
      if (a.venueRank !== b.venueRank) return a.venueRank - b.venueRank;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.label.localeCompare(b.label);
    });
}

// Whether a bucket gets a bulk "add all" / "show all" control. A one-room room
// group is left out — the control would just repeat the room itself — but a
// venue always gets one, so every venue on a multi-venue event is offered alike.
export function offersBulkAction(bucket: GroupedRooms<unknown>): boolean {
  return bucket.named && (bucket.rooms.length > 1 || bucket.groupId === null);
}
