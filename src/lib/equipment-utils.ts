import { prisma } from "@/lib/prisma";
import { PermissionError } from "@/lib/permissions";

// The catalog name for an equipment row on one of the event's orders. The
// catalog is per tenant: another tenant's id is a not-found.
export async function resolveEquipmentName(
  equipmentId: string | null,
  fallback: string,
  eventId: string,
): Promise<string> {
  if (!equipmentId) return fallback;
  const eq = await prisma.equipment.findFirst({
    where: { id: equipmentId, tenant: { events: { some: { id: eventId } } } },
    select: { name: true },
  });
  if (!eq) throw new PermissionError("NOT_FOUND", "Equipment not found");
  return eq.name;
}
