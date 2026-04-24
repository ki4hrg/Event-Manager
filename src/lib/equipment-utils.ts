import { prisma } from "@/lib/prisma";

export async function resolveEquipmentName(
  equipmentId: string | null,
  fallback: string
): Promise<string> {
  if (!equipmentId) return fallback;
  const eq = await prisma.equipment.findUnique({ where: { id: equipmentId }, select: { name: true } });
  return eq?.name ?? fallback;
}
