import { PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermissionForUser } from "@/lib/permissions";
import { eventVenuesInclude, eventVenuesOrderBy } from "@/lib/eventVenues";
import {
  createEventSeriesCore,
  updateEventSeriesCore,
  deleteEventSeriesCore,
} from "@/app/events/series/core";
import { importFromEventCore, getDefaultImportSource } from "@/app/events/import/core";
import {
  addEventStaffCore,
  setEventStaffLevelCore,
  removeEventStaffCore,
  grantSeriesAccessCore,
  parseAccessCap,
} from "@/app/events/[id]/staff/core";
import {
  eventScopeWhere,
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
    venueIds: optionalStringArray(args, "venueIds"),
    seriesId: optionalString(args, "seriesId") ?? null,
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
  venueIds: {
    type: "array",
    items: { type: "string" },
    description:
      "Venue ids in event order — the first is the primary venue. Rooms from every listed venue are available to the event's functions and orders. Omitting it leaves the event with no venues.",
  },
  seriesId: {
    type: "string",
    description:
      "Optional EventSeries id grouping the yearly editions of one conference. Use `list_event_series` to resolve a name to an id.",
  },
} as const;

export const eventTools: McpToolDefinition[] = [
  {
    name: "list_events",
    description:
      "List events visible to the API key's user. Honors the same scope rules as the UI — users without EVENTS:UNASSIGNED:VIEW see only events they are staff on. Returns summary shape — use `get_event` for full detail (venue addresses, updatedBy attribution).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (_args, { userId, tenantId }) => {
      await requirePermissionForUser(userId, PermissionResource.EVENTS, "VIEW", { tenantId });
      return prisma.event.findMany({
        where: await eventScopeWhere(userId, tenantId),
        include: {
          venues: {
            orderBy: eventVenuesOrderBy,
            select: { sortOrder: true, venue: { select: { id: true, name: true } } },
          },
          series: { select: { id: true, name: true } },
        },
        orderBy: { startDate: "desc" },
      });
    },
  },
  {
    name: "get_event",
    description: "Fetch a single event by id, including its venues in order (the first is the primary venue).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Event id." },
      },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (args, { userId, tenantId }) => {
      const id = requireString(args, "id");
      await requirePermissionForUser(userId, PermissionResource.EVENTS, "VIEW", id);
      return prisma.event.findUnique({
        where: { id },
        include: {
          ...eventVenuesInclude,
          series: { select: { id: true, name: true } },
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
    handler: (args, { userId, tenantId }) => createEventCore(readEventArgs(args), userId, tenantId),
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
    handler: (args, { userId, tenantId }) => {
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
    handler: async (args, { userId, tenantId }) => {
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
    handler: (args, { userId, tenantId }) =>
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
    handler: (args, { userId, tenantId }) =>
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
    handler: async (args, { userId, tenantId }) => {
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
    handler: (args, { userId, tenantId }) =>
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
  {
    name: "list_event_series",
    description:
      "List event series — the groupings that tie the yearly editions of one conference together. Each row includes its events (id, name, startDate) newest first — scoped to events the key's user may see, same as `list_events` — so this doubles as the lookup for \"the previous event in this series\".",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (_args, { userId, tenantId }) => {
      await requirePermissionForUser(userId, PermissionResource.EVENTS, "VIEW", { tenantId });
      const scopeWhere = await eventScopeWhere(userId, tenantId);
      return prisma.eventSeries.findMany({
        where: { tenantId },
        select: {
          id: true,
          name: true,
          events: {
            where: scopeWhere,
            select: { id: true, name: true, startDate: true },
            orderBy: { startDate: "desc" },
          },
        },
        orderBy: { name: "asc" },
      });
    },
  },
  {
    name: "create_event_series",
    description:
      "Create an event series. Names are unique. Assign events to it with the seriesId field on create_event / update_event.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
      additionalProperties: false,
    },
    handler: (args, { userId, tenantId }) => createEventSeriesCore(requireString(args, "name"), userId, tenantId),
  },
  {
    name: "update_event_series",
    description: "Rename an event series. Returns the updated series.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, name: { type: "string" } },
      required: ["id", "name"],
      additionalProperties: false,
    },
    handler: (args, { userId, tenantId }) =>
      updateEventSeriesCore(requireString(args, "id"), requireString(args, "name"), userId, tenantId),
  },
  {
    name: "delete_event_series",
    description:
      "Delete an event series. Refuses while the series still has events — move them to another series first.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    handler: (args, { userId, tenantId }) => deleteEventSeriesCore(requireString(args, "id"), userId, tenantId),
  },
  {
    name: "list_event_staff",
    description:
      "List the APP USERS assigned to an event, with each one's per-event access cap (null = their role's level applies unchanged). Distinct from event KEY staff (the `*_event_key_staff` tools), which assign Contacts to event roles and have nothing to do with login permissions.",
    inputSchema: {
      type: "object",
      properties: { eventId: { type: "string" } },
      required: ["eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId, tenantId }) => {
      const eventId = requireString(args, "eventId");
      await requirePermissionForUser(userId, PermissionResource.EVENTS, "VIEW", eventId);
      // Role is per tenant: report the one held in the event's tenant.
      const rows = await prisma.eventStaff.findMany({
        where: { eventId },
        select: {
          id: true,
          accessLevel: true,
          addedAt: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              memberships: {
                where: { tenant: { events: { some: { id: eventId } } } },
                select: { role: { select: { id: true, name: true } } },
                take: 1,
              },
            },
          },
        },
        orderBy: [{ user: { name: "asc" } }, { user: { email: "asc" } }],
      });
      return rows.map(({ user: { memberships, ...user }, ...row }) => ({
        ...row,
        user: { ...user, role: memberships[0]?.role ?? null },
      }));
    },
  },
  {
    name: "add_event_staff",
    description:
      "Assign an app user to an event, optionally capping what they can do there. accessLevel caps the user's role-derived ASSIGNED level for this event only — it can narrow (a WRITE role held to VIEW here) but never widen. Omit or pass null for uncapped. Idempotent: re-adding an existing assignment updates the cap only if accessLevel is supplied, so it never silently widens access.",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        userId: { type: "string", description: "The User id being granted access." },
        accessLevel: {
          type: "string",
          enum: ["VIEW", "WRITE", "DELETE"],
          description:
            "Optional cap. Omit for uncapped. There is no NONE — remove the assignment to revoke access.",
        },
      },
      required: ["eventId", "userId"],
      additionalProperties: false,
    },
    handler: (args, { userId: actorId }) =>
      addEventStaffCore(
        {
          eventId: requireString(args, "eventId"),
          userId: requireString(args, "userId"),
          // undefined (omitted) leaves an existing cap alone; see addEventStaffCore.
          accessLevel:
            args.accessLevel === undefined
              ? undefined
              : parseAccessCap(optionalString(args, "accessLevel") ?? null),
        },
        actorId,
      ),
  },
  {
    name: "set_event_staff_level",
    description:
      "Change the per-event access cap on an existing staff assignment. Pass null to clear the cap so the user's role level applies in full.",
    inputSchema: {
      type: "object",
      properties: {
        staffId: { type: "string", description: "EventStaff id from `list_event_staff`." },
        eventId: { type: "string" },
        accessLevel: { type: "string", enum: ["VIEW", "WRITE", "DELETE"] },
      },
      required: ["staffId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId: actorId }) =>
      setEventStaffLevelCore(
        {
          staffId: requireString(args, "staffId"),
          eventId: requireString(args, "eventId"),
          accessLevel: parseAccessCap(optionalString(args, "accessLevel") ?? null),
        },
        actorId,
      ),
  },
  {
    name: "remove_event_staff",
    description:
      "Remove an app user's assignment to an event, revoking their access to it. This is how access is revoked — there is no NONE access level.",
    inputSchema: {
      type: "object",
      properties: {
        staffId: { type: "string", description: "EventStaff id from `list_event_staff`." },
        eventId: { type: "string" },
      },
      required: ["staffId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId: actorId }) =>
      removeEventStaffCore(
        requireString(args, "staffId"),
        requireString(args, "eventId"),
        actorId,
      ),
  },
  {
    name: "grant_series_access",
    description:
      "Assign one app user to every event in a series at a single access cap — the provisioning move for someone who needs to read the past years of a conference. Events the caller cannot write are skipped rather than failing the batch; returns { granted, skipped } as event-name lists.",
    inputSchema: {
      type: "object",
      properties: {
        userId: { type: "string", description: "The User id being granted access." },
        seriesId: { type: "string", description: "EventSeries id from `list_event_series`." },
        accessLevel: {
          type: "string",
          enum: ["VIEW", "WRITE", "DELETE"],
          description: "Optional cap applied to every grant. Omit for uncapped.",
        },
      },
      required: ["userId", "seriesId"],
      additionalProperties: false,
    },
    handler: (args, { userId: actorId }) =>
      grantSeriesAccessCore(
        {
          userId: requireString(args, "userId"),
          seriesId: requireString(args, "seriesId"),
          accessLevel: parseAccessCap(optionalString(args, "accessLevel") ?? null),
        },
        actorId,
      ),
  },
  {
    name: "get_import_source",
    description:
      "Find the event a new event should import from: the most recent prior edition in the same series. Returns null when the event has no series or is the first in it.",
    inputSchema: {
      type: "object",
      properties: { eventId: { type: "string", description: "The NEW event." } },
      required: ["eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId, tenantId }) => {
      const eventId = requireString(args, "eventId");
      await requirePermissionForUser(userId, PermissionResource.EVENTS, "VIEW", eventId);
      return getDefaultImportSource(eventId);
    },
  },
  {
    name: "import_from_event",
    description:
      "Seed a new event from a previous one. Copies the chosen functions and presentations (with their breakout groups and tracks), and optionally event vendors, key staff, and status defaults. This is a DRAFT seed, not a clone: functions arrive UNSCHEDULED unless includeSchedules is true, statuses come from the target event's own defaults rather than the source, and room assignments are dropped when the two events are at different venues. Re-runnable — pick the ids you want each time. Returns per-category counts plus `notes` describing anything that did not carry over.",
    inputSchema: {
      type: "object",
      properties: {
        sourceEventId: { type: "string" },
        targetEventId: { type: "string" },
        functionIds: {
          type: "array",
          items: { type: "string" },
          description: "Function ids to copy. Omit or empty to copy no functions.",
        },
        presentationIds: {
          type: "array",
          items: { type: "string" },
          description: "Presentation ids to copy. Omit or empty to copy no presentations.",
        },
        includeSchedules: {
          type: "boolean",
          description:
            "Carry the source's times over. Default false — the unscheduled bucket is the point, it reads as the to-do list for building the new schedule. Breakout slot assignments only come across when this is true and both endpoints were copied.",
        },
        includeContacts: { type: "boolean", description: "Function contacts and presentation speakers. Default false." },
        includeVendors: { type: "boolean", description: "Event vendor list with its per-order-type defaults. Default false." },
        includeKeyStaff: { type: "boolean", description: "Event key staff (Contacts in event roles). Default false." },
        includeStatusDefaults: { type: "boolean", description: "Per-order-type default statuses. Default false." },
      },
      required: ["sourceEventId", "targetEventId"],
      additionalProperties: false,
    },
    handler: (args, { userId, tenantId }) =>
      importFromEventCore(
        {
          sourceEventId: requireString(args, "sourceEventId"),
          targetEventId: requireString(args, "targetEventId"),
          functionIds: optionalStringArray(args, "functionIds"),
          presentationIds: optionalStringArray(args, "presentationIds"),
          includeSchedules: args.includeSchedules === true,
          includeContacts: args.includeContacts === true,
          includeVendors: args.includeVendors === true,
          includeKeyStaff: args.includeKeyStaff === true,
          includeStatusDefaults: args.includeStatusDefaults === true,
        },
        userId,
      ),
  },
];
