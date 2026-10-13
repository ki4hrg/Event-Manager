import { PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermissionForUser } from "@/lib/permissions";
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
  type FunctionEsgArgs,
  type FunctionWriteArgs,
  type FunctionUpdateArgs,
  type ScheduleWriteArgs,
  type BulkFunctionUpdates,
} from "@/app/events/functions/core";
import type { McpToolDefinition } from "./types";
import { requireString, optionalString, optionalStringArray, partialBoolean, partialInt, partialString } from "./types";
import type { EntityStatus } from "@prisma/client";

function optionalBoolean(args: Record<string, unknown>, key: string): boolean {
  return args[key] === true;
}

function optionalStringList(args: Record<string, unknown>, key: string): string[] {
  return optionalStringArray(args, key);
}

// ESG Part II / IIIa fields. Omitted keys are left unchanged.
const functionEsgProps = {
  functionNumber: {
    type: ["string", "null"],
    description:
      "ESG function number override (e.g. \"12\", \"4a\"). Numbers are assigned automatically in chronological order (locked once the ESG is issued); a value here pins a manual override, null clears it.",
  },
  postToReaderBoard: { type: ["boolean", "null"], description: "Post to reader board (true) / do not post (false)." },
  readerBoardText: { type: ["string", "null"], description: "Reader board \"Post as\" text." },
  hold24Hour: { type: "boolean", description: "Room is on a 24-hour hold." },
  expectedAttendance: { type: ["integer", "null"], description: "Function attendance (ESG IIIa §B)." },
  setForCount: { type: ["integer", "null"], description: "Room set for (ESG Part II \"Set For\")." },
  actualAttendance: { type: ["integer", "null"], description: "Actual function attendance (Post-Event Report)." },
  decorNotes: { type: ["string", "null"] },
  securityNotes: { type: ["string", "null"] },
  signageNotes: { type: ["string", "null"] },
  billingNotes: { type: ["string", "null"], description: "Function-specific billing instructions." },
  costCenter: { type: ["string", "null"], description: "Organizer cost center." },
} as const;

function readFunctionEsgArgs(args: Record<string, unknown>): FunctionEsgArgs {
  return {
    functionNumber: partialString(args, "functionNumber"),
    postToReaderBoard: partialBoolean(args, "postToReaderBoard"),
    readerBoardText: partialString(args, "readerBoardText"),
    hold24Hour: partialBoolean(args, "hold24Hour") ?? undefined,
    expectedAttendance: partialInt(args, "expectedAttendance"),
    setForCount: partialInt(args, "setForCount"),
    actualAttendance: partialInt(args, "actualAttendance"),
    decorNotes: partialString(args, "decorNotes"),
    securityNotes: partialString(args, "securityNotes"),
    signageNotes: partialString(args, "signageNotes"),
    billingNotes: partialString(args, "billingNotes"),
    costCenter: partialString(args, "costCenter"),
  };
}

const createFunctionProps = {
  name: { type: "string" },
  description: { type: "string", description: "Optional." },
  type: {
    type: "string",
    description:
      "Function type — typical values: MEAL, BREAKOUT, PLENARY, BREAKOUT_BLOCK, OTHER. Free-form string.",
  },
  notes: { type: "string", description: "Optional." },
  offSiteLocation: {
    type: "string",
    description: "Optional. If set, the function is off-site (no room assignment expected).",
  },
  roomIds: {
    type: "array",
    items: { type: "string" },
    description: "Room ids to assign. Multi-room (combined-room) functions are supported.",
  },
  breakoutGroupId: { type: "string", description: "Optional BreakoutGroup id (BREAKOUT_BLOCK types)." },
  startTime: {
    type: "string",
    description:
      "Optional. When supplied with endTime, creates an initial schedule row. Format YYYY-MM-DDTHH:MM in event timezone (no offset).",
  },
  endTime: { type: "string", description: "Optional. Same format as startTime." },
  ...functionEsgProps,
} as const;

const updateFunctionProps = {
  name: { type: "string" },
  description: { type: "string" },
  type: { type: "string" },
  notes: { type: "string" },
  offSiteLocation: { type: "string" },
  roomIds: { type: "array", items: { type: "string" } },
  breakoutGroupId: { type: "string" },
  ...functionEsgProps,
} as const;

const scheduleProps = {
  type: { type: "string", description: "Schedule type, e.g. SESSION, MAIN, BREAK, SETUP, TEARDOWN." },
  startTime: {
    type: "string",
    description: "YYYY-MM-DDTHH:MM in event timezone (no offset).",
  },
  endTime: { type: "string", description: "YYYY-MM-DDTHH:MM in event timezone (no offset)." },
  notes: { type: "string", description: "Optional." },
  isPublic: { type: "boolean", description: "Defaults false. True = visible on public schedule reports." },
  force: {
    type: "boolean",
    description:
      "When true, skip room-conflict check and apply the change. When false (default), conflicts are returned without applying.",
  },
} as const;

function readScheduleArgs(args: Record<string, unknown>): ScheduleWriteArgs {
  return {
    type: requireString(args, "type"),
    startTime: requireString(args, "startTime"),
    endTime: requireString(args, "endTime"),
    notes: optionalString(args, "notes") ?? null,
    isPublic: optionalBoolean(args, "isPublic"),
    force: optionalBoolean(args, "force"),
  };
}

function readCreateFunctionArgs(args: Record<string, unknown>): FunctionWriteArgs {
  return {
    name: requireString(args, "name"),
    description: optionalString(args, "description") ?? null,
    type: optionalString(args, "type") ?? "",
    notes: optionalString(args, "notes") ?? null,
    offSiteLocation: optionalString(args, "offSiteLocation") ?? null,
    roomIds: optionalStringList(args, "roomIds"),
    breakoutGroupId: optionalString(args, "breakoutGroupId") ?? null,
    startTime: optionalString(args, "startTime") ?? null,
    endTime: optionalString(args, "endTime") ?? null,
    ...readFunctionEsgArgs(args),
  };
}

function readUpdateFunctionArgs(args: Record<string, unknown>): FunctionUpdateArgs {
  return {
    name: requireString(args, "name"),
    description: optionalString(args, "description") ?? null,
    type: optionalString(args, "type") ?? "",
    notes: optionalString(args, "notes") ?? null,
    offSiteLocation: optionalString(args, "offSiteLocation") ?? null,
    roomIds: optionalStringList(args, "roomIds"),
    breakoutGroupId: optionalString(args, "breakoutGroupId") ?? null,
    ...readFunctionEsgArgs(args),
  };
}

export const functionTools: McpToolDefinition[] = [
  {
    name: "update_function_esg_details",
    description:
      "Update only a function's ESG details (function number override, reader board, 24-hour hold, attendance, set-for, décor / security / signage / billing notes, cost center). Omitted keys are unchanged. Returns the updated function.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" }, ...functionEsgProps },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      updateFunctionEsgCore(requireString(args, "id"), requireString(args, "eventId"), readFunctionEsgArgs(args), userId),
  },
  {
    name: "renumber_functions",
    description:
      "Renumber an event's functions 1…N in chronological order (ESG function numbers). Refused once the ESG has been issued (numbers are locked). clearPins drops manual overrides first.",
    inputSchema: {
      type: "object",
      properties: { eventId: { type: "string" }, clearPins: { type: "boolean", description: "Default false." } },
      required: ["eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      await renumberFunctionsCore(eventId, args.clearPins === true, userId);
      return { eventId, renumbered: true };
    },
  },
  {
    name: "list_functions",
    description:
      "List all functions for an event. Includes rooms, schedules (ordered by start time), and breakout group when applicable. Returns summary shape — use `get_function` for full detail (contacts).",
    inputSchema: {
      type: "object",
      properties: { eventId: { type: "string", description: "Event id." } },
      required: ["eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      await requirePermissionForUser(userId, PermissionResource.FUNCTIONS, "VIEW", eventId);
      return prisma.function.findMany({
        where: { eventId },
        include: {
          rooms: { include: { room: true } },
          schedules: { orderBy: { startTime: "asc" } },
          breakoutGroup: true,
        },
        orderBy: { name: "asc" },
      });
    },
  },
  {
    name: "get_function",
    description:
      "Fetch a single function with rooms, schedules, contacts, and breakout group.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const fn = await prisma.function.findUnique({
        where: { id },
        include: {
          rooms: { include: { room: true } },
          schedules: { orderBy: { startTime: "asc" } },
          contacts: { include: { contact: true } },
          breakoutGroup: true,
        },
      });
      if (!fn) return null;
      await requirePermissionForUser(userId, PermissionResource.FUNCTIONS, "VIEW", fn.eventId);
      return fn;
    },
  },
  {
    name: "create_function",
    description:
      "Create a new function on an event. Auto-assigns default workflows. If startTime+endTime are supplied, an initial schedule row is created too.",
    inputSchema: {
      type: "object",
      properties: { eventId: { type: "string" }, ...createFunctionProps },
      required: ["eventId", "name"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      return createFunctionCore(eventId, readCreateFunctionArgs(args), userId);
    },
  },
  {
    name: "update_function",
    description:
      "Replace all writable fields on a function (excludes status/substatus — use update_function_status / set_entity_status if you need to change those). Room list is fully replaced.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        eventId: { type: "string" },
        ...updateFunctionProps,
      },
      required: ["id", "eventId", "name"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const id = requireString(args, "id");
      const eventId = requireString(args, "eventId");
      return updateFunctionCore(id, eventId, readUpdateFunctionArgs(args), userId);
    },
  },
  {
    name: "delete_function",
    description: "Delete a function by id. Cascades per schema.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" } },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const eventId = requireString(args, "eventId");
      await deleteFunctionCore(id, eventId, userId);
      return { id, deleted: true };
    },
  },
  {
    name: "delete_functions",
    description: "Bulk-delete multiple functions from an event.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" } },
        eventId: { type: "string" },
      },
      required: ["ids", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const ids = optionalStringList(args, "ids");
      const eventId = requireString(args, "eventId");
      return deleteFunctionsCore(ids, eventId, userId);
    },
  },
  {
    name: "bulk_update_functions",
    description:
      "Update status / substatus / type on multiple functions at once. Pass only the fields you want to change.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" } },
        eventId: { type: "string" },
        status: {
          type: "string",
          enum: ["TODO", "IN_PROGRESS", "READY", "BLOCKED", "DONE", "CANCELLED"],
        },
        substatus: { type: "string", description: "Pass empty string to clear." },
        type: { type: "string" },
      },
      required: ["ids", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const ids = optionalStringList(args, "ids");
      const eventId = requireString(args, "eventId");
      const updates: BulkFunctionUpdates = {};
      const status = optionalString(args, "status");
      if (status) updates.status = status as EntityStatus;
      if ("substatus" in args) updates.substatus = optionalString(args, "substatus") ?? null;
      const type = optionalString(args, "type");
      if (type) updates.type = type;
      return bulkUpdateFunctionsCore(ids, eventId, updates, userId);
    },
  },
  {
    name: "duplicate_function",
    description:
      'Duplicate a function (including rooms and schedules) into the same event. The copy is named "<original> (Copy)".',
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" } },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const id = requireString(args, "id");
      const eventId = requireString(args, "eventId");
      return duplicateFunctionCore(id, eventId, userId);
    },
  },
  // FunctionSchedule ---------------------------------------------------------
  {
    name: "create_function_schedule",
    description:
      "Add a schedule item to a function. Returns { conflicts: [...] } if room conflicts would occur and `force` is false; otherwise returns { value: { id } }.",
    inputSchema: {
      type: "object",
      properties: {
        functionId: { type: "string" },
        eventId: { type: "string" },
        ...scheduleProps,
      },
      required: ["functionId", "eventId", "type", "startTime", "endTime"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const functionId = requireString(args, "functionId");
      const eventId = requireString(args, "eventId");
      return createScheduleCore(functionId, eventId, readScheduleArgs(args), userId);
    },
  },
  {
    name: "update_function_schedule",
    description: "Edit a schedule row. Same conflict-handling shape as create_function_schedule.",
    inputSchema: {
      type: "object",
      properties: {
        scheduleId: { type: "string" },
        functionId: { type: "string" },
        eventId: { type: "string" },
        ...scheduleProps,
      },
      required: ["scheduleId", "functionId", "eventId", "type", "startTime", "endTime"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const scheduleId = requireString(args, "scheduleId");
      const functionId = requireString(args, "functionId");
      const eventId = requireString(args, "eventId");
      return updateScheduleCore(scheduleId, functionId, eventId, readScheduleArgs(args), userId);
    },
  },
  {
    name: "delete_function_schedule",
    description: "Delete a schedule row.",
    inputSchema: {
      type: "object",
      properties: {
        scheduleId: { type: "string" },
        functionId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["scheduleId", "functionId", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const scheduleId = requireString(args, "scheduleId");
      const functionId = requireString(args, "functionId");
      const eventId = requireString(args, "eventId");
      await deleteScheduleCore(scheduleId, functionId, eventId, userId);
      return { scheduleId, deleted: true };
    },
  },
  // FunctionContact ----------------------------------------------------------
  {
    name: "add_function_contact",
    description: "Link an existing contact to a function with an optional role.",
    inputSchema: {
      type: "object",
      properties: {
        functionId: { type: "string" },
        eventId: { type: "string" },
        contactId: { type: "string" },
        role: { type: "string", description: "Optional free-text role." },
      },
      required: ["functionId", "eventId", "contactId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      addFunctionContactCore(
        requireString(args, "functionId"),
        requireString(args, "eventId"),
        requireString(args, "contactId"),
        optionalString(args, "role") ?? null,
        userId,
      ),
  },
  {
    name: "update_function_contact",
    description: "Change the role on a FunctionContact link.",
    inputSchema: {
      type: "object",
      properties: {
        functionContactId: { type: "string" },
        functionId: { type: "string" },
        eventId: { type: "string" },
        role: { type: "string" },
      },
      required: ["functionContactId", "functionId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      updateFunctionContactCore(
        requireString(args, "functionContactId"),
        requireString(args, "functionId"),
        requireString(args, "eventId"),
        optionalString(args, "role") ?? null,
        userId,
      ),
  },
  {
    name: "remove_function_contact",
    description: "Remove a contact link from a function.",
    inputSchema: {
      type: "object",
      properties: {
        functionContactId: { type: "string" },
        functionId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["functionContactId", "functionId", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const functionContactId = requireString(args, "functionContactId");
      const functionId = requireString(args, "functionId");
      const eventId = requireString(args, "eventId");
      await removeFunctionContactCore(functionContactId, functionId, eventId, userId);
      return { functionContactId, removed: true };
    },
  },
  {
    name: "create_and_add_function_contact",
    description:
      "Create a new contact and immediately link it to a function. Use when the contact doesn't yet exist.",
    inputSchema: {
      type: "object",
      properties: {
        functionId: { type: "string" },
        eventId: { type: "string" },
        firstName: { type: "string" },
        lastName: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        organization: { type: "string" },
        role: { type: "string" },
      },
      required: ["functionId", "eventId", "firstName", "lastName"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      createAndAddFunctionContactCore(
        {
          functionId: requireString(args, "functionId"),
          eventId: requireString(args, "eventId"),
          firstName: requireString(args, "firstName"),
          lastName: requireString(args, "lastName"),
          email: optionalString(args, "email") ?? null,
          phone: optionalString(args, "phone") ?? null,
          organization: optionalString(args, "organization") ?? null,
          role: optionalString(args, "role") ?? null,
        },
        userId,
      ),
  },
  // Agenda DnD ---------------------------------------------------------------
  {
    name: "swap_function_room",
    description:
      "Replace one room assignment on a function with another (used by the agenda DnD UI). Returns { success: false, error } if the target room is already on the function.",
    inputSchema: {
      type: "object",
      properties: {
        functionId: { type: "string" },
        oldRoomId: { type: "string" },
        newRoomId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["functionId", "oldRoomId", "newRoomId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      updateFunctionRoomCore(
        requireString(args, "functionId"),
        requireString(args, "oldRoomId"),
        requireString(args, "newRoomId"),
        requireString(args, "eventId"),
        userId,
      ),
  },
  {
    name: "schedule_unscheduled_function",
    description:
      "Assign a room and create a MAIN schedule entry on an unscheduled function. Returns conflicts when force is false.",
    inputSchema: {
      type: "object",
      properties: {
        functionId: { type: "string" },
        roomId: { type: "string" },
        startTime: { type: "string", description: "ISO 8601 datetime (absolute, e.g. with -05:00 offset)." },
        endTime: { type: "string" },
        eventId: { type: "string" },
        force: { type: "boolean", description: "Defaults false." },
      },
      required: ["functionId", "roomId", "startTime", "endTime", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      scheduleUnscheduledFunctionCore(
        requireString(args, "functionId"),
        requireString(args, "roomId"),
        requireString(args, "startTime"),
        requireString(args, "endTime"),
        requireString(args, "eventId"),
        optionalBoolean(args, "force"),
        userId,
      ),
  },
  {
    name: "reschedule_function_entry",
    description:
      "Move an existing schedule entry to new start/end times. Returns conflicts when force is false.",
    inputSchema: {
      type: "object",
      properties: {
        scheduleId: { type: "string" },
        functionId: { type: "string" },
        newStartTime: { type: "string" },
        newEndTime: { type: "string" },
        eventId: { type: "string" },
        force: { type: "boolean" },
      },
      required: ["scheduleId", "functionId", "newStartTime", "newEndTime", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      rescheduleEntryCore(
        requireString(args, "scheduleId"),
        requireString(args, "functionId"),
        requireString(args, "newStartTime"),
        requireString(args, "newEndTime"),
        requireString(args, "eventId"),
        optionalBoolean(args, "force"),
        userId,
      ),
  },
];
