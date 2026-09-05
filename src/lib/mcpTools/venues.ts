import { PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermissionForUser } from "@/lib/permissions";
import {
  createVenueCore,
  updateVenueCore,
  updateVenueVendorDetailsCore,
  deleteVenueCore,
  createRoomCore,
  updateRoomCore,
  deleteRoomCore,
  createRoomGroupCore,
  updateRoomGroupCore,
  deleteRoomGroupCore,
  addVenueContactCore,
  updateVenueContactCore,
  removeVenueContactCore,
  createAndAddVenueContactCore,
  type VenueWriteArgs,
  type RoomWriteArgs,
} from "@/app/venues/core";
import type { McpToolDefinition } from "./types";
import { requireString, optionalString } from "./types";

function readVenueArgs(args: Record<string, unknown>): VenueWriteArgs {
  return {
    name: requireString(args, "name"),
    address: optionalString(args, "address") ?? null,
    city: optionalString(args, "city") ?? null,
    state: optionalString(args, "state") ?? null,
    zip: optionalString(args, "zip") ?? null,
    country: optionalString(args, "country") ?? null,
    notes: optionalString(args, "notes") ?? null,
  };
}

const venueWriteProps = {
  name: { type: "string" },
  address: { type: "string", description: "Optional." },
  city: { type: "string", description: "Optional." },
  state: { type: "string", description: "Optional." },
  zip: { type: "string", description: "Optional." },
  country: { type: "string", description: "Optional." },
  notes: { type: "string", description: "Optional." },
} as const;

function readRoomArgs(args: Record<string, unknown>): RoomWriteArgs {
  const cap = args.capacity;
  return {
    name: requireString(args, "name"),
    capacity: typeof cap === "number" && Number.isFinite(cap) ? Math.trunc(cap) : null,
    notes: optionalString(args, "notes") ?? null,
    groupId: optionalString(args, "groupId") ?? null,
  };
}

const roomWriteProps = {
  name: { type: "string" },
  capacity: { type: "number", description: "Optional integer capacity." },
  notes: { type: "string", description: "Optional." },
  groupId: { type: "string", description: "Optional RoomGroup id this room belongs to." },
} as const;

export const venueTools: McpToolDefinition[] = [
  {
    name: "list_venues",
    description:
      "List all venues with a count of rooms per venue. Returns summary shape — use `get_venue` for full detail (rooms, room groups, contacts, linked vendor).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (_args, { userId, tenantId }) => {
      await requirePermissionForUser(userId, PermissionResource.VENUES, "VIEW", { tenantId });
      return prisma.venue.findMany({
        where: { tenantId },
        include: { _count: { select: { rooms: true } } },
        orderBy: { name: "asc" },
      });
    },
  },
  {
    name: "get_venue",
    description: "Fetch a single venue with rooms, room groups, contacts, and linked vendor.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (args, { userId, tenantId }) => {
      const id = requireString(args, "id");
      await requirePermissionForUser(userId, PermissionResource.VENUES, "VIEW", { tenantId });
      return prisma.venue.findFirst({
        where: { id, tenantId },
        include: {
          rooms: { orderBy: { name: "asc" } },
          roomGroups: { orderBy: { sortOrder: "asc" } },
          contacts: { include: { contact: true }, orderBy: { id: "asc" } },
          vendor: true,
        },
      });
    },
  },
  {
    name: "list_rooms",
    description: "List all rooms for a venue, ordered by name.",
    inputSchema: {
      type: "object",
      properties: { venueId: { type: "string" } },
      required: ["venueId"],
      additionalProperties: false,
    },
    handler: async (args, { userId, tenantId }) => {
      const venueId = requireString(args, "venueId");
      await requirePermissionForUser(userId, PermissionResource.VENUES, "VIEW", { tenantId });
      return prisma.room.findMany({
        where: { venueId, venue: { tenantId } },
        include: { group: true },
        orderBy: { name: "asc" },
      });
    },
  },
  {
    name: "create_venue",
    description:
      "Create a new venue. Also creates a backing Vendor row (linked via venueId) so the venue can appear as a vendor in order pickers.",
    inputSchema: {
      type: "object",
      properties: venueWriteProps,
      required: ["name"],
      additionalProperties: false,
    },
    handler: (args, { userId, tenantId }) => createVenueCore(readVenueArgs(args), userId, tenantId),
  },
  {
    name: "update_venue",
    description:
      "Replace all writable fields on a venue. The backing Vendor row name is kept in sync.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, ...venueWriteProps },
      required: ["id", "name"],
      additionalProperties: false,
    },
    handler: (args, { userId, tenantId }) => {
      const id = requireString(args, "id");
      return updateVenueCore(id, readVenueArgs(args), userId, tenantId);
    },
  },
  {
    name: "update_venue_vendor_details",
    description:
      "Update the notes field on the Vendor row that backs a venue (without touching the venue itself).",
    inputSchema: {
      type: "object",
      properties: {
        venueId: { type: "string" },
        notes: { type: "string", description: "Notes for the venue's backing Vendor record (empty string clears)." },
      },
      required: ["venueId"],
      additionalProperties: false,
    },
    handler: async (args, { userId, tenantId }) => {
      const venueId = requireString(args, "venueId");
      await updateVenueVendorDetailsCore(venueId, optionalString(args, "notes") ?? null, userId, tenantId);
      return { venueId, ok: true };
    },
  },
  {
    name: "delete_venue",
    description: "Delete a venue by id. Cascades per schema.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (args, { userId, tenantId }) => {
      const id = requireString(args, "id");
      await deleteVenueCore(id, userId, tenantId);
      return { id, deleted: true };
    },
  },
  // Room ---------------------------------------------------------------------
  {
    name: "create_room",
    description: "Add a new room to a venue. Optional room group assignment.",
    inputSchema: {
      type: "object",
      properties: { venueId: { type: "string" }, ...roomWriteProps },
      required: ["venueId", "name"],
      additionalProperties: false,
    },
    handler: (args, { userId, tenantId }) => {
      const venueId = requireString(args, "venueId");
      return createRoomCore(venueId, readRoomArgs(args), userId, tenantId);
    },
  },
  {
    name: "update_room",
    description: "Update a room. Replaces all writable fields.",
    inputSchema: {
      type: "object",
      properties: {
        roomId: { type: "string" },
        venueId: { type: "string" },
        ...roomWriteProps,
      },
      required: ["roomId", "venueId", "name"],
      additionalProperties: false,
    },
    handler: (args, { userId, tenantId }) => {
      const roomId = requireString(args, "roomId");
      const venueId = requireString(args, "venueId");
      return updateRoomCore(roomId, venueId, readRoomArgs(args), userId, tenantId);
    },
  },
  {
    name: "delete_room",
    description: "Delete a room from a venue.",
    inputSchema: {
      type: "object",
      properties: { roomId: { type: "string" }, venueId: { type: "string" } },
      required: ["roomId", "venueId"],
      additionalProperties: false,
    },
    handler: async (args, { userId, tenantId }) => {
      const roomId = requireString(args, "roomId");
      const venueId = requireString(args, "venueId");
      await deleteRoomCore(roomId, venueId, userId, tenantId);
      return { roomId, deleted: true };
    },
  },
  // RoomGroup ---------------------------------------------------------------
  {
    name: "create_room_group",
    description: "Create a room group under a venue (used to cluster rooms in pickers).",
    inputSchema: {
      type: "object",
      properties: { venueId: { type: "string" }, name: { type: "string" } },
      required: ["venueId", "name"],
      additionalProperties: false,
    },
    handler: (args, { userId, tenantId }) =>
      createRoomGroupCore(requireString(args, "venueId"), requireString(args, "name"), userId, tenantId),
  },
  {
    name: "update_room_group",
    description: "Rename a room group.",
    inputSchema: {
      type: "object",
      properties: {
        groupId: { type: "string" },
        venueId: { type: "string" },
        name: { type: "string" },
      },
      required: ["groupId", "venueId", "name"],
      additionalProperties: false,
    },
    handler: (args, { userId, tenantId }) =>
      updateRoomGroupCore(
        requireString(args, "groupId"),
        requireString(args, "venueId"),
        requireString(args, "name"),
        userId,
        tenantId,
      ),
  },
  {
    name: "delete_room_group",
    description: "Delete a room group. Rooms in the group are not deleted; their groupId is cleared.",
    inputSchema: {
      type: "object",
      properties: { groupId: { type: "string" }, venueId: { type: "string" } },
      required: ["groupId", "venueId"],
      additionalProperties: false,
    },
    handler: async (args, { userId, tenantId }) => {
      const groupId = requireString(args, "groupId");
      const venueId = requireString(args, "venueId");
      await deleteRoomGroupCore(groupId, venueId, userId, tenantId);
      return { groupId, deleted: true };
    },
  },
  // VenueContact -----------------------------------------------------------
  {
    name: "add_venue_contact",
    description: "Link an existing contact to a venue with an optional role.",
    inputSchema: {
      type: "object",
      properties: {
        venueId: { type: "string" },
        contactId: { type: "string" },
        role: { type: "string", description: "Optional free-text role." },
      },
      required: ["venueId", "contactId"],
      additionalProperties: false,
    },
    handler: (args, { userId, tenantId }) =>
      addVenueContactCore(
        requireString(args, "venueId"),
        requireString(args, "contactId"),
        optionalString(args, "role") ?? null,
        userId,
        tenantId,
      ),
  },
  {
    name: "update_venue_contact",
    description: "Update the role on an existing VenueContact link.",
    inputSchema: {
      type: "object",
      properties: {
        venueContactId: { type: "string" },
        venueId: { type: "string" },
        role: { type: "string" },
      },
      required: ["venueContactId", "venueId"],
      additionalProperties: false,
    },
    handler: (args, { userId, tenantId }) =>
      updateVenueContactCore(
        requireString(args, "venueContactId"),
        requireString(args, "venueId"),
        optionalString(args, "role") ?? null,
        userId,
        tenantId,
      ),
  },
  {
    name: "remove_venue_contact",
    description: "Remove a contact from a venue (deletes the VenueContact junction row).",
    inputSchema: {
      type: "object",
      properties: {
        venueContactId: { type: "string" },
        venueId: { type: "string" },
      },
      required: ["venueContactId", "venueId"],
      additionalProperties: false,
    },
    handler: async (args, { userId, tenantId }) => {
      const venueContactId = requireString(args, "venueContactId");
      const venueId = requireString(args, "venueId");
      await removeVenueContactCore(venueContactId, venueId, userId, tenantId);
      return { venueContactId, removed: true };
    },
  },
  {
    name: "create_and_add_venue_contact",
    description:
      "Create a new contact and immediately link it to the venue as a VenueContact. Use when the contact does not yet exist; otherwise prefer add_venue_contact.",
    inputSchema: {
      type: "object",
      properties: {
        venueId: { type: "string" },
        firstName: { type: "string" },
        lastName: { type: "string" },
        email: { type: "string", description: "Optional." },
        organization: { type: "string", description: "Optional." },
        role: { type: "string", description: "Optional free-text role." },
      },
      required: ["venueId", "firstName", "lastName"],
      additionalProperties: false,
    },
    handler: (args, { userId, tenantId }) =>
      createAndAddVenueContactCore(
        {
          venueId: requireString(args, "venueId"),
          firstName: requireString(args, "firstName"),
          lastName: requireString(args, "lastName"),
          email: optionalString(args, "email") ?? null,
          organization: optionalString(args, "organization") ?? null,
          role: optionalString(args, "role") ?? null,
        },
        userId,
        tenantId,
      ),
  },
];
