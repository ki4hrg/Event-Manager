import { PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadPermissionsForUser, requirePermissionForUser } from "@/lib/permissions";
import {
  createEventCore,
  updateEventCore,
  deleteEventCore,
  addEventKeyStaffCore,
  updateEventKeyStaffCore,
  removeEventKeyStaffCore,
  createContactAndAddKeyStaffCore,
  type EventWriteArgs,
} from "@/app/events/core";
import type { McpToolDefinition } from "./types";
import { requireString, optionalString, optionalStringArray } from "./types";

function requireDate(args: Record<string, unknown>, key: string): Date {
  const v = requireString(args, key);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`${key} is not a valid ISO 8601 date/time: ${JSON.stringify(v)}`);
  }
  return d;
}

function readEventArgs(args: Record<string, unknown>): EventWriteArgs {
  return {
    name: requireString(args, "name"),
    description: optionalString(args, "description") ?? null,
    startDate: requireDate(args, "startDate"),
    endDate: requireDate(args, "endDate"),
    timezone: optionalString(args, "timezone") ?? "America/Chicago",
    venueId: optionalString(args, "venueId") ?? null,
  };
}

const eventWriteProps = {
  name: { type: "string" },
  description: { type: "string", description: "Optional." },
  startDate: { type: "string", description: "ISO 8601 datetime, e.g. 2026-09-12T08:00:00-05:00." },
  endDate: { type: "string", description: "ISO 8601 datetime." },
  timezone: {
    type: "string",
    description: "IANA tz name (e.g. America/Chicago). Defaults to America/Chicago.",
  },
  venueId: { type: "string", description: "Optional Venue id." },
} as const;

export const eventTools: McpToolDefinition[] = [
  {
    name: "list_events",
    description:
      "List events visible to the API key's user. Honors the same scope rules as the UI — users without EVENTS:UNASSIGNED:VIEW see only events they are staff on. Returns summary shape — use `get_event` for full detail (updatedBy attribution).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (_args, { userId }) => {
      await requirePermissionForUser(userId, PermissionResource.EVENTS, "VIEW");
      const { permissions } = await loadPermissionsForUser(userId);
      const unassigned = permissions.find(
        (p) => p.resource === PermissionResource.EVENTS && p.scope === "UNASSIGNED",
      );
      const canSeeUnassigned = unassigned && unassigned.level !== "NONE";

      return prisma.event.findMany({
        where: canSeeUnassigned ? undefined : { staff: { some: { userId } } },
        include: { venue: true },
        orderBy: { startDate: "desc" },
      });
    },
  },
  {
    name: "get_event",
    description: "Fetch a single event by id, including its venue.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Event id." },
      },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      await requirePermissionForUser(userId, PermissionResource.EVENTS, "VIEW", id);
      return prisma.event.findUnique({
        where: { id },
        include: {
          venue: true,
          updatedBy: { select: { name: true, email: true } },
        },
      });
    },
  },
  {
    name: "create_event",
    description:
      "Create a new event. The calling user is auto-assigned as event staff so the create doesn't lock them out under a UNASSIGNED:NONE role.",
    inputSchema: {
      type: "object",
      properties: eventWriteProps,
      required: ["name", "startDate", "endDate"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => createEventCore(readEventArgs(args), userId),
  },
  {
    name: "update_event",
    description: "Replace all writable fields on an event. Returns the updated event.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, ...eventWriteProps },
      required: ["id", "name", "startDate", "endDate"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const id = requireString(args, "id");
      return updateEventCore(id, readEventArgs(args), userId);
    },
  },
  {
    name: "delete_event",
    description: "Delete an event by id. Cascades per schema.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      await deleteEventCore(id, userId);
      return { id, deleted: true };
    },
  },
  // EventKeyStaff ------------------------------------------------------------
  {
    name: "add_event_key_staff",
    description:
      "Assign an existing contact as event key staff (e.g. point-of-contact for catering / AV). Optional title and model-type scoping.",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        contactId: { type: "string" },
        title: { type: "string", description: "Optional role title (e.g. \"Lead Caterer\")." },
        models: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional list of order model types this staff handles (CATERING_ORDER, AV_ORDER, etc.). Empty = unrestricted.",
        },
      },
      required: ["eventId", "contactId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      addEventKeyStaffCore(
        {
          eventId: requireString(args, "eventId"),
          contactId: requireString(args, "contactId"),
          title: optionalString(args, "title") ?? null,
          models: optionalStringArray(args, "models"),
        },
        userId,
      ),
  },
  {
    name: "update_event_key_staff",
    description: "Update title and model-type scoping on an existing EventKeyStaff row.",
    inputSchema: {
      type: "object",
      properties: {
        keyStaffId: { type: "string" },
        eventId: { type: "string" },
        title: { type: "string" },
        models: { type: "array", items: { type: "string" } },
      },
      required: ["keyStaffId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      updateEventKeyStaffCore(
        {
          keyStaffId: requireString(args, "keyStaffId"),
          eventId: requireString(args, "eventId"),
          title: optionalString(args, "title") ?? null,
          models: optionalStringArray(args, "models"),
        },
        userId,
      ),
  },
  {
    name: "remove_event_key_staff",
    description: "Remove a key-staff assignment from an event.",
    inputSchema: {
      type: "object",
      properties: {
        keyStaffId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["keyStaffId", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const keyStaffId = requireString(args, "keyStaffId");
      const eventId = requireString(args, "eventId");
      await removeEventKeyStaffCore(keyStaffId, eventId, userId);
      return { keyStaffId, removed: true };
    },
  },
  {
    name: "create_contact_and_add_key_staff",
    description:
      "Create a new contact and immediately assign them as event key staff. Use when the contact does not yet exist; otherwise prefer add_event_key_staff. Wrapped in a single transaction.",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        firstName: { type: "string" },
        lastName: { type: "string" },
        email: { type: "string", description: "Optional." },
        organization: { type: "string", description: "Optional." },
        title: { type: "string", description: "Optional role title." },
        models: { type: "array", items: { type: "string" } },
      },
      required: ["eventId", "firstName", "lastName"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      createContactAndAddKeyStaffCore(
        {
          eventId: requireString(args, "eventId"),
          firstName: requireString(args, "firstName"),
          lastName: requireString(args, "lastName"),
          email: optionalString(args, "email") ?? null,
          organization: optionalString(args, "organization") ?? null,
          title: optionalString(args, "title") ?? null,
          models: optionalStringArray(args, "models"),
        },
        userId,
      ),
  },
];
