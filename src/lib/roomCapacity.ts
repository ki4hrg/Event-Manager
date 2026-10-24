// A room's capacities by set-up as one line: "Theater 200 · Classroom 120".
export function formatRoomCapacities(capacities: { setupType: string; capacity: number }[]): string | null {
  return capacities.length ? capacities.map((c) => `${c.setupType} ${c.capacity}`).join(" · ") : null;
}

// Rooms list their set-up capacities by set-up name.
export const roomCapacitiesInclude = { capacities: { orderBy: { setupType: "asc" } } } as const;
