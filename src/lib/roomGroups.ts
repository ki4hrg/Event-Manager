type RoomGroupRef = { id: string; name: string; sortOrder: number } | null;

export const UNGROUPED_LABEL = "Ungrouped";

export function compareRoomsByGroup(
  a: { name: string; group?: RoomGroupRef },
  b: { name: string; group?: RoomGroupRef }
): number {
  const aOrder = a.group?.sortOrder ?? Number.MAX_SAFE_INTEGER;
  const bOrder = b.group?.sortOrder ?? Number.MAX_SAFE_INTEGER;
  if (aOrder !== bOrder) return aOrder - bOrder;
  const aGroupName = a.group?.name ?? "";
  const bGroupName = b.group?.name ?? "";
  if (aGroupName !== bGroupName) return aGroupName.localeCompare(bGroupName);
  return a.name.localeCompare(b.name);
}

export function sortRoomsByGroupThenName<TRoom extends { name: string; group?: RoomGroupRef }>(
  rooms: TRoom[]
): TRoom[] {
  return [...rooms].sort(compareRoomsByGroup);
}

export type GroupedRooms<TRoom> = {
  key: string;
  label: string;
  groupId: string | null;
  sortOrder: number;
  rooms: TRoom[];
};

export function groupRoomsByGroup<TRoom extends { id: string; name: string; groupId?: string | null; group?: RoomGroupRef }>(
  rooms: TRoom[]
): GroupedRooms<TRoom>[] {
  const buckets = new Map<string, GroupedRooms<TRoom>>();
  for (const room of rooms) {
    const group = room.group ?? null;
    const key = group?.id ?? "__ungrouped__";
    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        label: group?.name ?? UNGROUPED_LABEL,
        groupId: group?.id ?? null,
        sortOrder: group?.sortOrder ?? Number.MAX_SAFE_INTEGER,
        rooms: [],
      });
    }
    buckets.get(key)!.rooms.push(room);
  }
  return Array.from(buckets.values())
    .map((b) => ({ ...b, rooms: [...b.rooms].sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.label.localeCompare(b.label);
    });
}
