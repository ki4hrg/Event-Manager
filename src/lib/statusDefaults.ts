import { prisma } from "@/lib/prisma";
import type { EntityStatus, StatusModelType } from "@prisma/client";

export async function resolveCreateStatus(
  eventId: string,
  modelType: StatusModelType
): Promise<{ status: EntityStatus; substatus: string | null }> {
  const override = await prisma.eventStatusDefault.findUnique({
    where: { eventId_modelType: { eventId, modelType } },
    select: { status: true, substatus: true },
  });
  if (override) return { status: override.status, substatus: override.substatus };
  return { status: "PENDING", substatus: null };
}
