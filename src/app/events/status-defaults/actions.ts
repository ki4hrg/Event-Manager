"use server";

import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { EntityStatus, StatusModelType } from "@prisma/client";

export async function getStatusDefaults(eventId: string) {
  await requirePermission("EVENTS", "VIEW", eventId);
  return prisma.eventStatusDefault.findMany({
    where: { eventId },
    select: { modelType: true, status: true, substatus: true },
  });
}

export async function setStatusDefault(
  eventId: string,
  modelType: StatusModelType,
  status: EntityStatus,
  substatus: string | null
) {
  await requirePermission("EVENTS", "WRITE", eventId);
  await prisma.eventStatusDefault.upsert({
    where: { eventId_modelType: { eventId, modelType } },
    create: { eventId, modelType, status, substatus },
    update: { status, substatus },
  });
  revalidatePath(`/events/${eventId}`);
}

export async function clearStatusDefault(eventId: string, modelType: StatusModelType) {
  await requirePermission("EVENTS", "WRITE", eventId);
  await prisma.eventStatusDefault.deleteMany({ where: { eventId, modelType } });
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/settings`);
}

export async function saveAllStatusDefaults(
  eventId: string,
  overrides: Array<{ modelType: StatusModelType; status: EntityStatus; substatus: string | null }>
) {
  await requirePermission("EVENTS", "WRITE", eventId);
  await prisma.$transaction(
    overrides.map(({ modelType, status, substatus }) =>
      prisma.eventStatusDefault.upsert({
        where: { eventId_modelType: { eventId, modelType } },
        create: { eventId, modelType, status, substatus },
        update: { status, substatus },
      })
    )
  );
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/settings`);
}
