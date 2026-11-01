"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { withUserErrors } from "@/lib/userErrors";
import { eventScopeWhere } from "../core";
import {
  createEventSeriesCore,
  updateEventSeriesCore,
  deleteEventSeriesCore,
} from "./core";
import { formName } from "@/lib/validation";

export async function getEventSeries() {
  const session = await requirePermission("EVENTS", "VIEW");
  // Scope the embedded events the same way the events list does — otherwise this
  // page enumerates the name of every event to anyone who can open it.
  const scopeWhere = await eventScopeWhere(session.user.id, session.tenantId);
  return prisma.eventSeries.findMany({
    where: { tenantId: session.tenantId },
    select: {
      id: true,
      name: true,
      events: {
        where: scopeWhere,
        select: { id: true, name: true, startDate: true, timezone: true },
        orderBy: { startDate: "desc" },
      },
      // Unscoped count: the delete guard is about referential integrity, so the
      // affordance has to reflect events the caller can't see. A bare count
      // reveals far less than the names the `events` list deliberately hides.
      _count: { select: { events: true } },
    },
    orderBy: { name: "asc" },
  });
}

function revalidateSeries() {
  revalidatePath("/events/series");
  revalidatePath("/events");
}

export async function createEventSeries(formData: FormData) {
  const session = await requirePermission("EVENTS", "WRITE");
  return withUserErrors(async () => {
    await createEventSeriesCore(formName(formData, "name"), session.user.id, session.tenantId);
    revalidateSeries();
  });
}

export async function updateEventSeries(id: string, formData: FormData) {
  const session = await requirePermission("EVENTS", "WRITE");
  return withUserErrors(async () => {
    await updateEventSeriesCore(id, formName(formData, "name"), session.user.id, session.tenantId);
    revalidateSeries();
  });
}

export async function deleteEventSeries(id: string) {
  const session = await requirePermission("EVENTS", "DELETE");
  return withUserErrors(async () => {
    await deleteEventSeriesCore(id, session.user.id, session.tenantId);
    revalidateSeries();
  });
}
