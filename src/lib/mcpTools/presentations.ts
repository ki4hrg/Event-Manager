import { PermissionResource } from "@prisma/client";
import type { EntityStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermissionForUser } from "@/lib/permissions";
import {
  createTrackCore,
  updateTrackCore,
  deleteTrackCore,
  createPresentationCore,
  updatePresentationCore,
  updatePresentationInstanceCountCore,
  deletePresentationCore,
  deletePresentationsCore,
  bulkUpdatePresentationsCore,
  duplicatePresentationCore,
  addSpeakerCore,
  updateSpeakerCore,
  removeSpeakerCore,
  createAndAddPresentationSpeakerCore,
  reorderSpeakersCore,
  type PresentationCreateArgs,
  type PresentationUpdateArgs,
  type BulkPresentationUpdates,
} from "@/app/events/presentations/core";
import type { McpToolDefinition } from "./types";
import { requireString, optionalString, optionalStringArray } from "./types";

function optionalBoolean(args: Record<string, unknown>, key: string): boolean {
  return args[key] === true;
}

function requireInt(args: Record<string, unknown>, key: string): number {
  const v = args[key];
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new Error(`${key} is required (integer)`);
  }
  return Math.trunc(v);
}

function optionalInt(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key];
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return Math.trunc(v);
}

function readCreatePresentationArgs(args: Record<string, unknown>): PresentationCreateArgs {
  return {
    title: requireString(args, "title"),
    description: optionalString(args, "description") ?? null,
    trackId: optionalString(args, "trackId") ?? null,
    schedulingNotes: optionalString(args, "schedulingNotes") ?? null,
    internalNotes: optionalString(args, "internalNotes") ?? null,
    type: optionalString(args, "type") ?? "",
    breakoutGroupId: optionalString(args, "breakoutGroupId") ?? null,
    instanceCount: optionalInt(args, "instanceCount") ?? 1,
    advancerVendorId: optionalString(args, "advancerVendorId") ?? null,
    advancerContactId: optionalString(args, "advancerContactId") ?? null,
    speakerContactIds: optionalStringArray(args, "speakerContactIds"),
    speakerRoles: optionalStringArray(args, "speakerRoles"),
    primarySpeakerId: optionalString(args, "primarySpeakerId") ?? null,
  };
}

function readUpdatePresentationArgs(args: Record<string, unknown>): PresentationUpdateArgs {
  const out: PresentationUpdateArgs = {
    title: requireString(args, "title"),
    description: optionalString(args, "description") ?? null,
    trackId: optionalString(args, "trackId") ?? null,
    schedulingNotes: optionalString(args, "schedulingNotes") ?? null,
    internalNotes: optionalString(args, "internalNotes") ?? null,
    type: optionalString(args, "type") ?? "",
  };
  if ("breakoutGroupId" in args) out.breakoutGroupId = optionalString(args, "breakoutGroupId") ?? null;
  const ic = optionalInt(args, "instanceCount");
  if (ic !== undefined) out.instanceCount = ic;
  if ("advancerVendorId" in args) out.advancerVendorId = optionalString(args, "advancerVendorId") ?? null;
  if ("advancerContactId" in args) out.advancerContactId = optionalString(args, "advancerContactId") ?? null;
  return out;
}

const presentationCreateProps = {
  title: { type: "string" },
  type: { type: "string", description: "Free-form, e.g. BREAKOUT, PLENARY, KEYNOTE." },
  description: { type: "string" },
  trackId: { type: "string", description: "Optional PresentationTrack id." },
  breakoutGroupId: { type: "string", description: "Optional BreakoutGroup id." },
  schedulingNotes: { type: "string" },
  internalNotes: { type: "string" },
  instanceCount: { type: "number", description: "How many times this presentation runs. Defaults 1." },
  advancerVendorId: { type: "string", description: "Optional default advancer vendor." },
  advancerContactId: { type: "string", description: "Optional default advancer contact." },
  speakerContactIds: {
    type: "array",
    items: { type: "string" },
    description: "Optional list of contact ids to add as speakers at create time.",
  },
  speakerRoles: {
    type: "array",
    items: { type: "string" },
    description: "Optional list of role strings, aligned by index with speakerContactIds.",
  },
  primarySpeakerId: {
    type: "string",
    description: "Contact id within speakerContactIds to mark as primary.",
  },
} as const;

const presentationUpdateProps = {
  title: { type: "string" },
  description: { type: "string" },
  trackId: { type: "string" },
  schedulingNotes: { type: "string" },
  internalNotes: { type: "string" },
  type: { type: "string" },
  breakoutGroupId: { type: "string" },
  instanceCount: { type: "number" },
  advancerVendorId: { type: "string" },
  advancerContactId: { type: "string" },
} as const;

export const presentationTools: McpToolDefinition[] = [
  {
    name: "list_presentations",
    description:
      "List presentations for an event. Includes track, speakers (with contacts), and slot/function/room assignments.",
    inputSchema: {
      type: "object",
      properties: { eventId: { type: "string" } },
      required: ["eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      await requirePermissionForUser(
        userId,
        PermissionResource.PRESENTATIONS,
        "VIEW",
        eventId,
      );
      return prisma.presentation.findMany({
        where: { eventId },
        include: {
          track: true,
          speakers: {
            include: { contact: true },
            orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
          },
          slots: {
            include: {
              function: { include: { schedules: { orderBy: { startTime: "asc" } } } },
              room: true,
            },
          },
        },
        orderBy: { title: "asc" },
      });
    },
  },
  {
    name: "get_presentation",
    description: "Fetch a single presentation with track, speakers, slots, and breakout group.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const row = await prisma.presentation.findUnique({
        where: { id },
        include: {
          track: true,
          breakoutGroup: true,
          speakers: {
            include: { contact: true },
            orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
          },
          slots: {
            include: {
              function: {
                include: {
                  schedules: { orderBy: { startTime: "asc" } },
                  breakoutGroup: true,
                  rooms: { include: { room: true } },
                },
              },
              room: true,
            },
          },
        },
      });
      if (!row) return null;
      await requirePermissionForUser(
        userId,
        PermissionResource.PRESENTATIONS,
        "VIEW",
        row.eventId,
      );
      return row;
    },
  },
  // Track --------------------------------------------------------------------
  {
    name: "list_presentation_tracks",
    description: "List PresentationTracks defined for an event, ordered by sortOrder.",
    inputSchema: {
      type: "object",
      properties: { eventId: { type: "string" } },
      required: ["eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      await requirePermissionForUser(
        userId,
        PermissionResource.PRESENTATIONS,
        "VIEW",
        eventId,
      );
      return prisma.presentationTrack.findMany({
        where: { eventId },
        orderBy: { sortOrder: "asc" },
      });
    },
  },
  {
    name: "create_presentation_track",
    description: "Add a presentation track to an event. sortOrder is auto-assigned.",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        name: { type: "string" },
        color: { type: "string", description: "Optional CSS color string." },
      },
      required: ["eventId", "name"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      createTrackCore(
        requireString(args, "eventId"),
        { name: requireString(args, "name"), color: optionalString(args, "color") ?? null },
        userId,
      ),
  },
  {
    name: "update_presentation_track",
    description: "Update a track's name or color.",
    inputSchema: {
      type: "object",
      properties: {
        trackId: { type: "string" },
        eventId: { type: "string" },
        name: { type: "string" },
        color: { type: "string" },
      },
      required: ["trackId", "eventId", "name"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      updateTrackCore(
        requireString(args, "trackId"),
        requireString(args, "eventId"),
        { name: requireString(args, "name"), color: optionalString(args, "color") ?? null },
        userId,
      ),
  },
  {
    name: "delete_presentation_track",
    description: "Delete a track. Presentations on the track have their trackId cleared (SetNull).",
    inputSchema: {
      type: "object",
      properties: { trackId: { type: "string" }, eventId: { type: "string" } },
      required: ["trackId", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const trackId = requireString(args, "trackId");
      const eventId = requireString(args, "eventId");
      await deleteTrackCore(trackId, eventId, userId);
      return { trackId, deleted: true };
    },
  },
  // Presentation -------------------------------------------------------------
  {
    name: "create_presentation",
    description:
      "Create a presentation on an event. Optionally add speakers at create time. Auto-assigns default workflows.",
    inputSchema: {
      type: "object",
      properties: { eventId: { type: "string" }, ...presentationCreateProps },
      required: ["eventId", "title"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      return createPresentationCore(eventId, readCreatePresentationArgs(args), userId);
    },
  },
  {
    name: "update_presentation",
    description:
      "Update a presentation. Always replaces title/type/description/trackId/schedulingNotes/internalNotes. " +
      "Optional fields (breakoutGroupId, instanceCount, advancerVendorId, advancerContactId) are only updated when the key is present in args — use empty string to clear a nullable field.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        eventId: { type: "string" },
        ...presentationUpdateProps,
      },
      required: ["id", "eventId", "title"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const id = requireString(args, "id");
      const eventId = requireString(args, "eventId");
      return updatePresentationCore(id, eventId, readUpdatePresentationArgs(args), userId);
    },
  },
  {
    name: "update_presentation_instance_count",
    description: "Set the instanceCount on a presentation (how many times it runs).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        eventId: { type: "string" },
        count: { type: "number" },
      },
      required: ["id", "eventId", "count"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      updatePresentationInstanceCountCore(
        requireString(args, "id"),
        requireString(args, "eventId"),
        requireInt(args, "count"),
        userId,
      ),
  },
  {
    name: "delete_presentation",
    description: "Delete a presentation by id. Cascades per schema.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" } },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const eventId = requireString(args, "eventId");
      await deletePresentationCore(id, eventId, userId);
      return { id, deleted: true };
    },
  },
  {
    name: "delete_presentations",
    description: "Bulk-delete multiple presentations from an event.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" } },
        eventId: { type: "string" },
      },
      required: ["ids", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      deletePresentationsCore(
        optionalStringArray(args, "ids"),
        requireString(args, "eventId"),
        userId,
      ),
  },
  {
    name: "bulk_update_presentations",
    description: "Update status / substatus / track / type on multiple presentations at once.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" } },
        eventId: { type: "string" },
        status: {
          type: "string",
          enum: ["TODO", "IN_PROGRESS", "READY", "BLOCKED", "DONE", "CANCELLED"],
        },
        substatus: { type: "string" },
        trackId: { type: "string", description: "Empty string clears." },
        type: { type: "string" },
      },
      required: ["ids", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const ids = optionalStringArray(args, "ids");
      const eventId = requireString(args, "eventId");
      const updates: BulkPresentationUpdates = {};
      const status = optionalString(args, "status");
      if (status) updates.status = status as EntityStatus;
      if ("substatus" in args) updates.substatus = optionalString(args, "substatus") ?? null;
      if ("trackId" in args) updates.trackId = optionalString(args, "trackId") ?? null;
      const type = optionalString(args, "type");
      if (type) updates.type = type;
      return bulkUpdatePresentationsCore(ids, eventId, updates, userId);
    },
  },
  {
    name: "duplicate_presentation",
    description: 'Duplicate a presentation (including speakers) into the same event. Named "<original> (Copy)".',
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" } },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      duplicatePresentationCore(
        requireString(args, "id"),
        requireString(args, "eventId"),
        userId,
      ),
  },
  // Speaker (PresentationContact) -------------------------------------------
  {
    name: "add_presentation_speaker",
    description:
      "Add an existing contact as a speaker on a presentation. Auto-appends to the sortOrder. Setting isPrimary unsets any other primary.",
    inputSchema: {
      type: "object",
      properties: {
        presentationId: { type: "string" },
        eventId: { type: "string" },
        contactId: { type: "string" },
        role: { type: "string" },
        isPrimary: { type: "boolean" },
      },
      required: ["presentationId", "eventId", "contactId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      addSpeakerCore(
        requireString(args, "presentationId"),
        requireString(args, "eventId"),
        requireString(args, "contactId"),
        optionalString(args, "role") ?? null,
        optionalBoolean(args, "isPrimary"),
        userId,
      ),
  },
  {
    name: "update_presentation_speaker",
    description: "Change role / isPrimary on a PresentationContact link.",
    inputSchema: {
      type: "object",
      properties: {
        speakerId: { type: "string" },
        presentationId: { type: "string" },
        eventId: { type: "string" },
        role: { type: "string" },
        isPrimary: { type: "boolean" },
      },
      required: ["speakerId", "presentationId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      updateSpeakerCore(
        requireString(args, "speakerId"),
        requireString(args, "presentationId"),
        requireString(args, "eventId"),
        optionalString(args, "role") ?? null,
        optionalBoolean(args, "isPrimary"),
        userId,
      ),
  },
  {
    name: "remove_presentation_speaker",
    description: "Remove a speaker link from a presentation.",
    inputSchema: {
      type: "object",
      properties: {
        speakerId: { type: "string" },
        presentationId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["speakerId", "presentationId", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const speakerId = requireString(args, "speakerId");
      const presentationId = requireString(args, "presentationId");
      const eventId = requireString(args, "eventId");
      await removeSpeakerCore(speakerId, presentationId, eventId, userId);
      return { speakerId, removed: true };
    },
  },
  {
    name: "create_and_add_presentation_speaker",
    description:
      "Create a new contact and immediately add as a presentation speaker. Use when the contact does not yet exist.",
    inputSchema: {
      type: "object",
      properties: {
        presentationId: { type: "string" },
        eventId: { type: "string" },
        firstName: { type: "string" },
        lastName: { type: "string" },
        email: { type: "string" },
        organization: { type: "string" },
        role: { type: "string" },
        isPrimary: { type: "boolean" },
      },
      required: ["presentationId", "eventId", "firstName", "lastName"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      createAndAddPresentationSpeakerCore(
        {
          presentationId: requireString(args, "presentationId"),
          eventId: requireString(args, "eventId"),
          firstName: requireString(args, "firstName"),
          lastName: requireString(args, "lastName"),
          email: optionalString(args, "email") ?? null,
          organization: optionalString(args, "organization") ?? null,
          role: optionalString(args, "role") ?? null,
          isPrimary: optionalBoolean(args, "isPrimary"),
        },
        userId,
      ),
  },
  {
    name: "reorder_presentation_speakers",
    description:
      "Replace the sortOrder of all speakers on a presentation with the order given by `orderedIds` (front-to-back).",
    inputSchema: {
      type: "object",
      properties: {
        presentationId: { type: "string" },
        eventId: { type: "string" },
        orderedIds: { type: "array", items: { type: "string" } },
      },
      required: ["presentationId", "eventId", "orderedIds"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const presentationId = requireString(args, "presentationId");
      const eventId = requireString(args, "eventId");
      const orderedIds = optionalStringArray(args, "orderedIds");
      await reorderSpeakersCore(presentationId, eventId, orderedIds, userId);
      return { ok: true };
    },
  },
];
