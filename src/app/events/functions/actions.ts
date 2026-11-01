"use server";


import { UserFacingError, withUserErrors, type UserError } from "@/lib/userErrors";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
import { formDateTimeKey, formId, formIds, formInt, formName, formNote, formRequiredId, formValue, idList, parseArgs } from "@/lib/validation";

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
  return withUserErrors(async () => {
    const type = formValue(formData, "type");
    const fn = await createFunctionCore(
      eventId,
      {
        name: formName(formData, "name"),
        description: formNote(formData, "description"),
        type,
        notes: formNote(formData, "notes"),
        offSiteLocation: formNote(formData, "offSiteLocation"),
        roomIds: formIds(formData, "roomIds"),
        breakoutGroupId: formId(formData, "breakoutGroupId"),
        startTime: formDateTimeKey(formData, "startTime", "Start time"),
        endTime: formDateTimeKey(formData, "endTime", "End time"),
      },
      session.user.id,
    );

    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/events/${eventId}/breakout-schedule`);

    if (type === "BREAKOUT_BLOCK") {
      redirect(`/events/${eventId}/breakout-schedule`);
    }
    redirect(`/events/${eventId}/functions/${fn.id}`);
  });
}

export async function updateFunction(id: string, eventId: string, formData: FormData) {
  const session = await requirePermission("FUNCTIONS", "WRITE", eventId);
  return withUserErrors(async () => {
    await updateFunctionCore(
      id,
      eventId,
      {
        name: formName(formData, "name"),
        description: formNote(formData, "description"),
        type: formValue(formData, "type"),
        notes: formNote(formData, "notes"),
        offSiteLocation: formNote(formData, "offSiteLocation"),
        roomIds: formIds(formData, "roomIds"),
        breakoutGroupId: formId(formData, "breakoutGroupId"),
      },
      session.user.id,
    );

    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/events/${eventId}/functions/${id}`);
    revalidatePath(`/events/${eventId}/agenda`);
    redirect(`/events/${eventId}/functions/${id}?success=Function updated`);
  });
}

export async function updateFunctionEsg(id: string, eventId: string, formData: FormData) {
  const session = await requirePermission("FUNCTIONS", "WRITE", eventId);
  return withUserErrors(async () => {
    const post = formValue(formData, "postToReaderBoard");
    const intOrNull = (field: string) => formInt(formData, field, { min: 0 }); // ESG counts
    await updateFunctionEsgCore(
      id,
      eventId,
      {
        functionNumber: formNote(formData, "functionNumber"),
        postToReaderBoard: post === "true" ? true : post === "false" ? false : null,
        readerBoardText: formNote(formData, "readerBoardText"),
        hold24Hour: formData.get("hold24Hour") === "true",
        defaultSetup: formNote(formData, "defaultSetup"),
        expectedAttendance: intOrNull("expectedAttendance"),
        setForCount: intOrNull("setForCount"),
        actualAttendance: intOrNull("actualAttendance"),
        decorNotes: formNote(formData, "decorNotes"),
        securityNotes: formNote(formData, "securityNotes"),
        signageNotes: formNote(formData, "signageNotes"),
        billingNotes: formNote(formData, "billingNotes"),
        costCenter: formNote(formData, "costCenter"),
      },
      session.user.id,
    );
    revalidatePath(`/events/${eventId}/functions`);
    revalidatePath(`/events/${eventId}/functions/${id}`);
  });
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
  await deleteFunctionsCore(parseArgs(idList(5_000), ids), eventId, session.user.id);
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
  // The core checks the updates against BulkFunctionUpdatesSchema.
  await bulkUpdateFunctionsCore(parseArgs(idList(5_000), ids), eventId, updates, session.user.id);
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
// A schedule row needs both ends, each a real date and time.
function requiredDateTime(formData: FormData, key: string, label: string): string {
  const value = formDateTimeKey(formData, key, label);
  if (!value) throw new UserFacingError(`${label} is required`);
  return value;
}

export async function createSchedule(
  functionId: string,
  eventId: string,
  formData: FormData
): Promise<{ conflicts: RoomConflict[] } | UserError | undefined> {
  const session = await requirePermission("FUNCTIONS", "WRITE", eventId);
  return withUserErrors(async () => {
    const result = await createScheduleCore(
      functionId,
      eventId,
      {
        type: formValue(formData, "type"),
        startTime: requiredDateTime(formData, "startTime", "Start time"),
        endTime: requiredDateTime(formData, "endTime", "End time"),
        notes: formNote(formData, "notes"),
        isPublic: formData.get("isPublic") === "true",
        force: formData.get("force") === "true",
      },
      session.user.id,
    );
    if ("conflicts" in result) return { conflicts: result.conflicts };
    revalidatePath(`/events/${eventId}/functions/${functionId}`);
    return undefined;
  });
}

export async function updateSchedule(
  scheduleId: string,
  functionId: string,
  eventId: string,
  formData: FormData
): Promise<{ conflicts: RoomConflict[] } | UserError | undefined> {
  const session = await requirePermission("FUNCTIONS", "WRITE", eventId);
  return withUserErrors(async () => {
    const result = await updateScheduleCore(
      scheduleId,
      functionId,
      eventId,
      {
        type: formValue(formData, "type"),
        startTime: requiredDateTime(formData, "startTime", "Start time"),
        endTime: requiredDateTime(formData, "endTime", "End time"),
        notes: formNote(formData, "notes"),
        isPublic: formData.get("isPublic") === "true",
        force: formData.get("force") === "true",
      },
      session.user.id,
    );
    if ("conflicts" in result) return { conflicts: result.conflicts };
    revalidatePath(`/events/${eventId}/functions/${functionId}`);
    return undefined;
  });
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
  return withUserErrors(async () => {
    await addFunctionContactCore(
      functionId,
      eventId,
      formRequiredId(formData, "contactId", "contact"),
      formNote(formData, "role"),
      session.user.id,
    );
    revalidatePath(`/events/${eventId}/functions/${functionId}`);
  });
}

export async function updateFunctionContact(
  contactId: string,
  functionId: string,
  eventId: string,
  formData: FormData
) {
  const session = await requirePermission("FUNCTIONS", "WRITE", eventId);
  return withUserErrors(async () => {
    await updateFunctionContactCore(
      contactId,
      functionId,
      eventId,
      formNote(formData, "role"),
      session.user.id,
    );
    revalidatePath(`/events/${eventId}/functions/${functionId}`);
  });
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
  return withUserErrors(async () => {
    await createAndAddFunctionContactCore(
      {
        functionId,
        eventId,
        firstName: formName(formData, "firstName"),
        lastName: formName(formData, "lastName"),
        email: formNote(formData, "email"),
        phone: formNote(formData, "phone"),
        organization: formNote(formData, "organization"),
        role: formNote(formData, "role"),
      },
      session.user.id,
    );
    revalidatePath(`/events/${eventId}/functions/${functionId}`);
  });
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
