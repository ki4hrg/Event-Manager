import { PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermissionForUser } from "@/lib/permissions";
import type { McpToolDefinition } from "./types";
import { requireString } from "./types";

export const functionTools: McpToolDefinition[] = [
  {
    name: "list_functions",
    description:
      "List all functions for an event. Includes rooms, schedules (ordered by start time), and breakout group when applicable.",
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
];
