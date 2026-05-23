import { PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermissionForUser } from "@/lib/permissions";
import type { McpToolDefinition } from "./types";
import { requireString } from "./types";

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
];
