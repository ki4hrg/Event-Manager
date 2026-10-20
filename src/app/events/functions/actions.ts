"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EntityStatus } from "@prisma/client";
import type { RoomConflict } from "@/lib/conflicts";
import {
  createFunctionCore,
  updateFunctionCore,
  deleteFunctionCore,
  deleteFunctionsCore,
  bulkUpdateFunctionsCore,
  duplicateFunctionCore,
  createScheduleCore,
  updateScheduleCore,
  deleteScheduleCore,
  addFunctionContactCore,
  updateFunctionContactCore,
  removeFunctionContactCore,
  createAndAddFunctionContactCore,
  updateFunctionRoomCore,
  scheduleUnscheduledFunctionCore,
  rescheduleEntryCore,
  updateFunctionEsgCore,
  renumberFunctionsCore,
  type BulkFunctionUpdates,
} from "./core";

export async function getFunctions(eventId: string) {
  await requirePermission("FUNCTIONS", "VIEW", eventId);
  return prisma.function.findMany({
    where: { eventId },
    include: {
      rooms: { include: { room: true } },
      schedules: { orderBy: { startTime: "asc" } },
      breakoutGroup: true,
    },
    orderBy: { name: "asc" },
  });
}

export async function getFunctionsForTable(eventId: string) {
  await requirePermission("FUNCTIONS", "VIEW", eventId);
  const rows = await prisma.function.findMany({
    where: { eventId },
    include: {
      rooms: { include: { room: true } },
      schedules: { orderBy: { startTime: "asc" } },
      breakoutGroup: true,
      contacts: { include: { contact: true }, orderBy: { id: "asc" } },
      avOrderFunctions: { include: { avOrder: true } },
      cateringOrder: true,
      setupOrderFunctions: { include: { setupOrder: { include: { room: true } } } },
    },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({
    ...r,
    avOrders: r.avOrderFunctions.map((l) => l.avOrder),
    setupOrders: r.setupOrderFunctions.map((l) => l.setupOrder),
  }));
}

export type FunctionForTable = Awaited<ReturnType<typeof getFunctionsForTable>>[number];

export async function getFunctionsWithPresentations(eventId: string) {
  await requirePermission("FUNCTIONS", "VIEW", eventId);
  return prisma.function.findMany({
    where: { eventId },
    include: {
      rooms: { include: { room: true } },
      schedules: { orderBy: { startTime: "asc" } },
      breakoutGroup: { include: { rooms: { include: { room: true } } } },
      presentationSlots: { include: { presentation: true } },
      sessionRoomOverrides: true,
    },
    orderBy: { name: "asc" },
  });
}

export async function getFunction(id: string) {
  const vendorInclude = { vendors: { include: { vendor: { select: { name: true } } } } } as const;
  const row = await prisma.function.findUnique({
    where: { id },
    include: {
      rooms: { include: { room: true } },
      schedules: { orderBy: { sortOrder: "asc" } },
      contacts: { include: { contact: true }, orderBy: { id: "asc" } },
      avOrderFunctions: { include: { avOrder: { include: vendorInclude } } },
      cateringOrder: { include: vendorInclude },
      cateringServiceLocations: {
        include: {
          cateringOrder: { include: vendorInclude },
        },
        orderBy: { sortOrder: "asc" },
      },
      setupOrderFunctions: { include: { setupOrder: { include: { room: true, ...vendorInclude } } } },
      printOrderFunctions: {
        include: {
          printOrder: {
            select: { id: true, name: true, status: true, substatus: true, notes: true, ...vendorInclude },
          },
        },
      },
      supplyOrderLinks: {
        include: {
          supplyOrder: {
            select: {
              id: true,
              name: true,
              status: true,
              substatus: true,
              notes: true,
              items: { select: { id: true, packingStatus: true } },
              room: { select: { id: true, name: true } },
              providerVendor: { select: { id: true, name: true } },
              providerContact: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      },
      mediaDeliverableFunctions: {
        include: {
          mediaDeliverable: {
            select: {
              id: true,
              name: true,
              status: true,
              substatus: true,
              notes: true,
              mediaType: true,
              providerVendor: { select: { name: true } },
              providerContact: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
      breakoutGroup: true,
      exhibitBooths: {
        select: { id: true, name: true, boothNumber: true, companyName: true },
        orderBy: { sortOrder: "asc" },
      },
      // Booths that sit under this function through their group.
      exhibitBoothGroups: {
        select: {
          booths: { where: { functionId: null }, select: { id: true, name: true, boothNumber: true, companyName: true } },
        },
      },
      updatedBy: { select: { name: true, email: true } },
    },
  });
  if (!row) return null;
  await requirePermission("FUNCTIONS", "VIEW", row.eventId);
  return {
    ...row,
    avOrders: row.avOrderFunctions.map((l) => l.avOrder),
    setupOrders: row.setupOrderFunctions.map((l) => l.setupOrder),
  };
}

export async function createFunction(eventId: string, formData: FormData) {
  const session = await requirePermission("FUNCTIONS", "WRITE", eventId);
  const type = formData.get("type") as string;
  const fn = await createFunctionCore(
    eventId,
    {
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || null,
      type: type || "",
      notes: (formData.get("notes") as string) || null,
      offSiteLocation: (formData.get("offSiteLocation") as string)?.trim() || null,
      roomIds: formData.getAll("roomIds") as string[],
      breakoutGroupId: (formData.get("breakoutGroupId") as string) || null,
      startTime: (formData.get("startTime") as string) || null,
      endTime: (formData.get("endTime") as string) || null,
    },
    session.user.id,
  );

  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/breakout-schedule`);

  if (type === "BREAKOUT_BLOCK") {
    redirect(`/events/${eventId}/breakout-schedule`);
  }
  redirect(`/events/${eventId}/functions/${fn.id}`);
}

export async function updateFunction(id: string, eventId: string, formData: FormData) {
  const session = await requirePermission("FUNCTIONS", "WRITE", eventId);
  await updateFunctionCore(
    id,
    eventId,
    {
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || null,
      type: (formData.get("type") as string) || "",
      notes: (formData.get("notes") as string) || null,
      offSiteLocation: (formData.get("offSiteLocation") as string)?.trim() || null,
      roomIds: formData.getAll("roomIds") as string[],
      breakoutGroupId: (formData.get("breakoutGroupId") as string) || null,
    },
    session.user.id,
  );

  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/functions/${id}`);
  revalidatePath(`/events/${eventId}/agenda`);
  redirect(`/events/${eventId}/functions/${id}?success=Function updated`);
}

export async function updateFunctionEsg(id: string, eventId: string, formData: FormData) {
  const session = await requirePermission("FUNCTIONS", "WRITE", eventId);
  const post = formData.get("postToReaderBoard") as string;
  const intOrNull = (field: string) => (formData.get(field) ? parseInt(formData.get(field) as string) : null);
  await updateFunctionEsgCore(
    id,
    eventId,
    {
      functionNumber: (formData.get("functionNumber") as string) || null,
      postToReaderBoard: post === "true" ? true : post === "false" ? false : null,
      readerBoardText: (formData.get("readerBoardText") as string) || null,
      hold24Hour: formData.get("hold24Hour") === "true",
      defaultSetup: (formData.get("defaultSetup") as string) || null,
      expectedAttendance: intOrNull("expectedAttendance"),
      setForCount: intOrNull("setForCount"),
      actualAttendance: intOrNull("actualAttendance"),
      decorNotes: (formData.get("decorNotes") as string) || null,
      securityNotes: (formData.get("securityNotes") as string) || null,
      signageNotes: (formData.get("signageNotes") as string) || null,
      billingNotes: (formData.get("billingNotes") as string) || null,
      costCenter: (formData.get("costCenter") as string) || null,
    },
    session.user.id,
  );
  revalidatePath(`/events/${eventId}/functions`);
  revalidatePath(`/events/${eventId}/functions/${id}`);
  redirect(`/events/${eventId}/functions/${id}?success=ESG details saved`);
}

export async function renumberFunctions(eventId: string, clearPins: boolean) {
  const session = await requirePermission("FUNCTIONS", "WRITE", eventId);
  await renumberFunctionsCore(eventId, clearPins, session.user.id);
  revalidatePath(`/events/${eventId}/functions`);
}

export async function deleteFunction(id: string, eventId: string) {
  const session = await requirePermission("FUNCTIONS", "DELETE", eventId);
  await deleteFunctionCore(id, eventId, session.user.id);
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/agenda`);
  redirect(`/events/${eventId}`);
}

export async function deleteFunctions(ids: string[], eventId: string) {
  const session = await requirePermission("FUNCTIONS", "DELETE", eventId);
  await deleteFunctionsCore(ids, eventId, session.user.id);
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/functions`);
  revalidatePath(`/events/${eventId}/agenda`);
}

export async function getFunctionOptions(eventId: string) {
  await requirePermission("FUNCTIONS", "VIEW", eventId);
  return prisma.function.findMany({
    where: { eventId },
    select: { id: true, name: true, functionNumber: true },
    orderBy: { name: "asc" },
  });
}

export async function bulkUpdateFunctions(
  ids: string[],
  eventId: string,
  updates: BulkFunctionUpdates,
) {
  const session = await requirePermission("FUNCTIONS", "WRITE", eventId);
  await bulkUpdateFunctionsCore(ids, eventId, updates, session.user.id);
  revalidatePath(`/events/${eventId}/functions`);
}

export async function duplicateFunction(id: string, eventId: string) {
  const session = await requirePermission("FUNCTIONS", "WRITE", eventId);
  const duplicate = await duplicateFunctionCore(id, eventId, session.user.id);
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/agenda`);
  redirect(`/events/${eventId}/functions/${duplicate.id}`);
}

// Schedule item actions
export async function createSchedule(
  functionId: string,
  eventId: string,
  formData: FormData
): Promise<{ conflicts: RoomConflict[] } | undefined> {
  const session = await requirePermission("FUNCTIONS", "WRITE", eventId);
  const result = await createScheduleCore(
    functionId,
    eventId,
    {
      type: formData.get("type") as string,
      startTime: formData.get("startTime") as string,
      endTime: formData.get("endTime") as string,
      notes: (formData.get("notes") as string) || null,
      isPublic: formData.get("isPublic") === "true",
      force: formData.get("force") === "true",
    },
    session.user.id,
  );
  if ("conflicts" in result) return { conflicts: result.conflicts };
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function updateSchedule(
  scheduleId: string,
  functionId: string,
  eventId: string,
  formData: FormData
): Promise<{ conflicts: RoomConflict[] } | undefined> {
  const session = await requirePermission("FUNCTIONS", "WRITE", eventId);
  const result = await updateScheduleCore(
    scheduleId,
    functionId,
    eventId,
    {
      type: formData.get("type") as string,
      startTime: formData.get("startTime") as string,
      endTime: formData.get("endTime") as string,
      notes: (formData.get("notes") as string) || null,
      isPublic: formData.get("isPublic") === "true",
      force: formData.get("force") === "true",
    },
    session.user.id,
  );
  if ("conflicts" in result) return { conflicts: result.conflicts };
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function deleteSchedule(scheduleId: string, functionId: string, eventId: string) {
  const session = await requirePermission("FUNCTIONS", "DELETE", eventId);
  await deleteScheduleCore(scheduleId, functionId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

// ============================================================================
// Contact Assignment
// ============================================================================

export async function searchContacts(query: string) {
  const session = await requirePermission("CONTACTS", "VIEW");
  if (!query || query.length < 2) {
    return [];
  }

  return prisma.contact.findMany({
    where: {
      tenantId: session.tenantId,
      OR: [
        { firstName: { contains: query, mode: "insensitive" } },
        { lastName: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
        { organization: { contains: query, mode: "insensitive" } },
      ],
    },
    take: 10,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
}

export async function addFunctionContact(functionId: string, eventId: string, formData: FormData) {
  const session = await requirePermission("FUNCTIONS", "WRITE", eventId);
  await addFunctionContactCore(
    functionId,
    eventId,
    formData.get("contactId") as string,
    (formData.get("role") as string) || null,
    session.user.id,
  );
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function updateFunctionContact(
  contactId: string,
  functionId: string,
  eventId: string,
  formData: FormData
) {
  const session = await requirePermission("FUNCTIONS", "WRITE", eventId);
  await updateFunctionContactCore(
    contactId,
    functionId,
    eventId,
    (formData.get("role") as string) || null,
    session.user.id,
  );
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function removeFunctionContact(contactId: string, functionId: string, eventId: string) {
  const session = await requirePermission("FUNCTIONS", "WRITE", eventId);
  await removeFunctionContactCore(contactId, functionId, eventId, session.user.id);
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

export async function createAndAddFunctionContact(
  functionId: string,
  eventId: string,
  formData: FormData
) {
  const session = await requirePermission("FUNCTIONS", "WRITE", eventId);
  await createAndAddFunctionContactCore(
    {
      functionId,
      eventId,
      firstName: formData.get("firstName") as string,
      lastName: formData.get("lastName") as string,
      email: (formData.get("email") as string) || null,
      phone: (formData.get("phone") as string) || null,
      organization: (formData.get("organization") as string) || null,
      role: (formData.get("role") as string) || null,
    },
    session.user.id,
  );
  revalidatePath(`/events/${eventId}/functions/${functionId}`);
}

// ============================================================================
// Agenda DnD Actions
// ============================================================================

export async function updateFunctionRoom(
  functionId: string,
  oldRoomId: string,
  newRoomId: string,
  eventId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requirePermission("FUNCTIONS", "WRITE", eventId);
  const result = await updateFunctionRoomCore(
    functionId,
    oldRoomId,
    newRoomId,
    eventId,
    session.user.id,
  );
  if (result.success) {
    revalidatePath(`/events/${eventId}/agenda`);
    revalidatePath(`/events/${eventId}/functions/${functionId}`);
  }
  return result;
}

export async function scheduleUnscheduledFunction(
  functionId: string,
  roomId: string,
  startTime: string,
  endTime: string,
  eventId: string,
  force = false
): Promise<{ success: boolean; error?: string; conflicts?: RoomConflict[] }> {
  const session = await requirePermission("FUNCTIONS", "WRITE", eventId);
  const result = await scheduleUnscheduledFunctionCore(
    functionId,
    roomId,
    startTime,
    endTime,
    eventId,
    force,
    session.user.id,
  );
  if (result.success) {
    revalidatePath(`/events/${eventId}/agenda`);
    revalidatePath(`/events/${eventId}/functions/${functionId}`);
  }
  return result;
}

export async function rescheduleEntry(
  scheduleId: string,
  functionId: string,
  newStartTime: string,
  newEndTime: string,
  eventId: string,
  force = false
): Promise<{ success: boolean; error?: string; conflicts?: RoomConflict[] }> {
  const session = await requirePermission("FUNCTIONS", "WRITE", eventId);
  const result = await rescheduleEntryCore(
    scheduleId,
    functionId,
    newStartTime,
    newEndTime,
    eventId,
    force,
    session.user.id,
  );
  if (result.success) {
    revalidatePath(`/events/${eventId}/agenda`);
    revalidatePath(`/events/${eventId}/functions/${functionId}`);
  }
  return result;
}
