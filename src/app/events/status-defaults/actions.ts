"use server";

import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { EntityStatus, StatusModelType } from "@prisma/client";

export async function getStatusDefaults(eventId: string) {
  await requireAuth();
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
  await requireAuth();
  await prisma.eventStatusDefault.upsert({
    where: { eventId_modelType: { eventId, modelType } },
    create: { eventId, modelType, status, substatus },
    update: { status, substatus },
  });
  revalidatePath(`/events/${eventId}`);
}

export async function clearStatusDefault(eventId: string, modelType: StatusModelType) {
  await requireAuth();
  await prisma.eventStatusDefault.deleteMany({ where: { eventId, modelType } });
  revalidatePath(`/events/${eventId}`);
}
