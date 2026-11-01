"use server";

import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { EntityStatus, StatusModelType } from "@prisma/client";
import { z } from "zod";
import { parseArgs } from "@/lib/validation";

// The status-default form's values: known model types and statuses, and a
// substatus (a CustomOption label, stored as sent).
const ModelTypeSchema = z.enum(StatusModelType);
const OverrideSchema = z.object({
  modelType: ModelTypeSchema,
  status: z.enum(EntityStatus),
  substatus: z.string().max(1_000).nullable(),
});

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
  ({ modelType, status, substatus } = parseArgs(OverrideSchema, { modelType, status, substatus }));
  await prisma.eventStatusDefault.upsert({
    where: { eventId_modelType: { eventId, modelType } },
    create: { eventId, modelType, status, substatus },
    update: { status, substatus },
  });
  revalidatePath(`/events/${eventId}`);
}

export async function clearStatusDefault(eventId: string, modelType: StatusModelType) {
  await requirePermission("EVENTS", "WRITE", eventId);
  // An object here would be a filter, clearing every default of the event.
  modelType = parseArgs(ModelTypeSchema, modelType);
  await prisma.eventStatusDefault.deleteMany({ where: { eventId, modelType } });
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/settings`);
}

export async function saveAllStatusDefaults(
  eventId: string,
  overrides: Array<{ modelType: StatusModelType; status: EntityStatus; substatus: string | null }>
) {
  await requirePermission("EVENTS", "WRITE", eventId);
  overrides = parseArgs(z.array(OverrideSchema).max(50), overrides);
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
