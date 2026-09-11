import { prisma } from "@/lib/prisma";

// Resolves a catalog Equipment name for an item on an event-scoped order. The
// caller only holds an event id, so the tenant is asserted through the event
// relation — a foreign equipment id reads as not-found and falls back.
export async function resolveEquipmentName(
  equipmentId: string | null,
  fallback: string,
  eventId: string
): Promise<string> {
  if (!equipmentId) return fallback;
  const eq = await prisma.equipment.findFirst({
    where: { id: equipmentId, tenant: { events: { some: { id: eventId } } } },
    select: { name: true },
  });
  return eq?.name ?? fallback;
}
