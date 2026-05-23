import { PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermissionForUser } from "@/lib/permissions";
import type { McpToolDefinition } from "./types";
import { requireString, optionalString } from "./types";

export const vendorTools: McpToolDefinition[] = [
  {
    name: "list_vendors",
    description:
      "List all real (non-system, non-venue-backed) vendors with a contact count summary.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (_args, { userId }) => {
      await requirePermissionForUser(userId, PermissionResource.VENDORS, "VIEW");
      return prisma.vendor.findMany({
        where: { isSystemVendor: false, venueId: null },
        include: { _count: { select: { contacts: true } } },
        orderBy: { name: "asc" },
      });
    },
  },
  {
    name: "get_vendor",
    description: "Fetch a single vendor with its contacts.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      await requirePermissionForUser(userId, PermissionResource.VENDORS, "VIEW");
      return prisma.vendor.findUnique({
        where: { id },
        include: {
          contacts: { include: { contact: true }, orderBy: { id: "asc" } },
        },
      });
    },
  },
  {
    name: "search_vendors",
    description:
      "Case-insensitive substring search on vendor name. Returns up to 20 matches ordered by name.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Search substring." } },
      required: ["query"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const query = optionalString(args, "query") ?? "";
      await requirePermissionForUser(userId, PermissionResource.VENDORS, "VIEW");
      return prisma.vendor.findMany({
        where: { name: { contains: query, mode: "insensitive" } },
        orderBy: { name: "asc" },
        take: 20,
      });
    },
  },
];
