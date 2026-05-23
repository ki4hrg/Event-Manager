import { PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadPermissionsForUser, requirePermissionForUser } from "@/lib/permissions";
import type { McpToolDefinition } from "./types";
import { requireString } from "./types";

export const eventTools: McpToolDefinition[] = [
  {
    name: "list_events",
    description:
      "List events visible to the API key's user. Honors the same scope rules as the UI — users without EVENTS:UNASSIGNED:VIEW see only events they are staff on.",
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
];
