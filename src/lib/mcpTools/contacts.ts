import { PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermissionForUser } from "@/lib/permissions";
import type { McpToolDefinition } from "./types";
import { requireString, optionalString } from "./types";

export const contactTools: McpToolDefinition[] = [
  {
    name: "list_contacts",
    description: "List all contacts ordered by last name, first name.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (_args, { userId }) => {
      await requirePermissionForUser(userId, PermissionResource.CONTACTS, "VIEW");
      return prisma.contact.findMany({
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      });
    },
  },
  {
    name: "get_contact",
    description: "Fetch a single contact by id.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      await requirePermissionForUser(userId, PermissionResource.CONTACTS, "VIEW");
      return prisma.contact.findUnique({ where: { id } });
    },
  },
  {
    name: "search_contacts",
    description:
      "Case-insensitive search across first name, last name, email, and organization. Returns up to 20 matches.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Search substring (>= 2 chars)." } },
      required: ["query"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      await requirePermissionForUser(userId, PermissionResource.CONTACTS, "VIEW");
      const query = optionalString(args, "query") ?? "";
      if (query.length < 2) return [];
      return prisma.contact.findMany({
        where: {
          OR: [
            { firstName: { contains: query, mode: "insensitive" } },
            { lastName: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
            { organization: { contains: query, mode: "insensitive" } },
          ],
        },
        take: 20,
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      });
    },
  },
];
