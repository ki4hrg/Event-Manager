import { PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermissionForUser } from "@/lib/permissions";
import type { McpToolDefinition } from "./types";
import { requireString } from "./types";

export const venueTools: McpToolDefinition[] = [
  {
    name: "list_venues",
    description: "List all venues with a count of rooms per venue.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (_args, { userId }) => {
      await requirePermissionForUser(userId, PermissionResource.VENUES, "VIEW");
      return prisma.venue.findMany({
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
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      await requirePermissionForUser(userId, PermissionResource.VENUES, "VIEW");
      return prisma.venue.findUnique({
        where: { id },
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
    handler: async (args, { userId }) => {
      const venueId = requireString(args, "venueId");
      await requirePermissionForUser(userId, PermissionResource.VENUES, "VIEW");
      return prisma.room.findMany({
        where: { venueId },
        include: { group: true },
        orderBy: { name: "asc" },
      });
    },
  },
];
