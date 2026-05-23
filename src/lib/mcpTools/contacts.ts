import { PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermissionForUser } from "@/lib/permissions";
import {
  createContactCore,
  updateContactCore,
  deleteContactCore,
  type ContactWriteArgs,
} from "@/app/contacts/core";
import type { McpToolDefinition } from "./types";
import { requireString, optionalString, optionalStringArray } from "./types";

function readWriteArgs(args: Record<string, unknown>, requireNames: boolean): ContactWriteArgs {
  const firstName = requireNames
    ? requireString(args, "firstName")
    : (optionalString(args, "firstName") ?? "");
  const lastName = requireNames
    ? requireString(args, "lastName")
    : (optionalString(args, "lastName") ?? "");
  return {
    firstName,
    lastName,
    email: optionalString(args, "email") ?? null,
    phone: optionalString(args, "phone") ?? null,
    organization: optionalString(args, "organization") ?? null,
    notes: optionalString(args, "notes") ?? null,
    roles: optionalStringArray(args, "roles"),
  };
}

const writeProps = {
  firstName: { type: "string" },
  lastName: { type: "string" },
  email: { type: "string", description: "Optional." },
  phone: { type: "string", description: "Optional." },
  organization: { type: "string", description: "Optional." },
  notes: { type: "string", description: "Optional." },
  roles: {
    type: "array",
    items: { type: "string" },
    description: "Optional CustomOption values from the CONTACT_ROLE category (e.g. SPEAKER, VENUE_CONTACT).",
  },
} as const;

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
  {
    name: "create_contact",
    description:
      "Create a new contact (speaker, vendor staff, attendee, etc.). Returns the created contact.",
    inputSchema: {
      type: "object",
      properties: writeProps,
      required: ["firstName", "lastName"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => createContactCore(readWriteArgs(args, true), userId),
  },
  {
    name: "update_contact",
    description:
      "Replace all writable fields on a contact. All fields except id are required — pass the existing value for fields you do not want to change.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, ...writeProps },
      required: ["id", "firstName", "lastName"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const id = requireString(args, "id");
      return updateContactCore(id, readWriteArgs(args, true), userId);
    },
  },
  {
    name: "delete_contact",
    description:
      "Delete a contact by id. Cascades per schema (removes contact links from functions, venues, vendors, etc.).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      await deleteContactCore(id, userId);
      return { id, deleted: true };
    },
  },
];
