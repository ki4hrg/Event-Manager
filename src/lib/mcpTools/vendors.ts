import { PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermissionForUser } from "@/lib/permissions";
import {
  createVendorCore,
  updateVendorCore,
  deleteVendorCore,
  createAndAddVendorContactCore,
  addVendorContactCore,
  updateVendorContactCore,
  removeVendorContactCore,
  addVendorToEventCore,
  removeVendorFromEventCore,
  setDefaultVendorCore,
  removeDefaultVendorCore,
  type ModelType,
} from "@/app/vendors/core";
import type { McpToolDefinition } from "./types";
import { requireString, optionalString, optionalStringArray } from "./types";

const MODEL_TYPES = [
  "CATERING_ORDER",
  "AV_ORDER",
  "SETUP_ORDER",
  "PRINT_ORDER",
  "SUPPLY_ORDER",
  "MEDIA_DELIVERABLE",
] as const satisfies readonly ModelType[];

function requireModelType(args: Record<string, unknown>, key: string): ModelType {
  const v = requireString(args, key);
  if (!(MODEL_TYPES as readonly string[]).includes(v)) {
    throw new Error(
      `${key} must be one of: ${MODEL_TYPES.join(", ")} (got ${JSON.stringify(v)})`,
    );
  }
  return v as ModelType;
}

function optionalBoolean(args: Record<string, unknown>, key: string): boolean {
  return args[key] === true;
}

const vendorWriteProps = {
  name: { type: "string" },
  models: {
    type: "array",
    items: { type: "string", enum: [...MODEL_TYPES, "LEAD_SOURCE"] },
    description:
      "Order types this vendor services (used to filter vendor pickers). Empty array = general-purpose (appears in every picker). LEAD_SOURCE tags an organization that brings hotel leads (a CVB, a third-party planner): it's offered as a hotel proposal's lead source.",
  },
  notes: { type: "string", description: "Optional free-form notes." },
} as const;

export const vendorTools: McpToolDefinition[] = [
  {
    name: "list_vendors",
    description:
      "List all real (non-system, non-venue-backed) vendors with a contact count summary. Returns summary shape — use `get_vendor` for full detail (the actual contacts via VendorContact links).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (_args, { userId, tenantId }) => {
      await requirePermissionForUser(userId, PermissionResource.VENDORS, "VIEW", { tenantId });
      return prisma.vendor.findMany({
        where: { tenantId, isSystemVendor: false, venueId: null },
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
    handler: async (args, { userId, tenantId }) => {
      const id = requireString(args, "id");
      await requirePermissionForUser(userId, PermissionResource.VENDORS, "VIEW", { tenantId });
      return prisma.vendor.findFirst({
        where: { id, tenantId },
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
    handler: async (args, { userId, tenantId }) => {
      const query = optionalString(args, "query") ?? "";
      await requirePermissionForUser(userId, PermissionResource.VENDORS, "VIEW", { tenantId });
      return prisma.vendor.findMany({
        where: { tenantId, name: { contains: query, mode: "insensitive" } },
        orderBy: { name: "asc" },
        take: 20,
      });
    },
  },
  {
    name: "create_vendor",
    description: "Create a new vendor. Returns the created vendor.",
    inputSchema: {
      type: "object",
      properties: vendorWriteProps,
      required: ["name"],
      additionalProperties: false,
    },
    handler: (args, { userId, tenantId }) =>
      createVendorCore(
        {
          name: requireString(args, "name"),
          models: optionalStringArray(args, "models"),
          notes: optionalString(args, "notes") ?? null,
        },
        userId,
        tenantId,
      ),
  },
  {
    name: "update_vendor",
    description: "Replace all writable fields on a vendor. Returns the updated vendor.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, ...vendorWriteProps },
      required: ["id", "name"],
      additionalProperties: false,
    },
    handler: (args, { userId, tenantId }) => {
      const id = requireString(args, "id");
      return updateVendorCore(
        id,
        {
          name: requireString(args, "name"),
          models: optionalStringArray(args, "models"),
          notes: optionalString(args, "notes") ?? null,
        },
        userId,
        tenantId,
      );
    },
  },
  {
    name: "delete_vendor",
    description: "Delete a vendor by id. Cascades per schema.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (args, { userId, tenantId }) => {
      const id = requireString(args, "id");
      await deleteVendorCore(id, userId, tenantId);
      return { id, deleted: true };
    },
  },
  // VendorContact (vendor ↔ contact junction) ---------------------------------
  {
    name: "create_and_add_vendor_contact",
    description:
      "Create a new contact and immediately link it to the vendor as a VendorContact. Use when the contact does not yet exist; otherwise prefer add_vendor_contact.",
    inputSchema: {
      type: "object",
      properties: {
        vendorId: { type: "string" },
        firstName: { type: "string" },
        lastName: { type: "string" },
        email: { type: "string", description: "Optional." },
        organization: { type: "string", description: "Optional." },
        contactType: {
          type: "string",
          description: "Optional CustomOption value from the VENDOR_CONTACT_TYPE category.",
        },
        isPrimary: {
          type: "boolean",
          description:
            "When true, this contact becomes the vendor's primary and any prior primary is unset.",
        },
      },
      required: ["vendorId", "firstName", "lastName"],
      additionalProperties: false,
    },
    handler: (args, { userId, tenantId }) =>
      createAndAddVendorContactCore(
        {
          vendorId: requireString(args, "vendorId"),
          firstName: requireString(args, "firstName"),
          lastName: requireString(args, "lastName"),
          email: optionalString(args, "email") ?? null,
          organization: optionalString(args, "organization") ?? null,
          contactType: optionalString(args, "contactType") ?? null,
          isPrimary: optionalBoolean(args, "isPrimary"),
        },
        userId,
        tenantId,
      ),
  },
  {
    name: "add_vendor_contact",
    description:
      "Link an existing contact to a vendor with an optional role and primary flag.",
    inputSchema: {
      type: "object",
      properties: {
        vendorId: { type: "string" },
        contactId: { type: "string" },
        contactType: { type: "string", description: "Optional role label." },
        isPrimary: { type: "boolean" },
      },
      required: ["vendorId", "contactId"],
      additionalProperties: false,
    },
    handler: (args, { userId, tenantId }) =>
      addVendorContactCore(
        {
          vendorId: requireString(args, "vendorId"),
          contactId: requireString(args, "contactId"),
          contactType: optionalString(args, "contactType") ?? null,
          isPrimary: optionalBoolean(args, "isPrimary"),
        },
        userId,
        tenantId,
      ),
  },
  {
    name: "update_vendor_contact",
    description:
      "Update the role label and primary flag on an existing VendorContact link.",
    inputSchema: {
      type: "object",
      properties: {
        vendorContactId: { type: "string", description: "VendorContact id (the junction row)." },
        vendorId: { type: "string" },
        contactType: { type: "string" },
        isPrimary: { type: "boolean" },
      },
      required: ["vendorContactId", "vendorId"],
      additionalProperties: false,
    },
    handler: (args, { userId, tenantId }) =>
      updateVendorContactCore(
        {
          vendorContactId: requireString(args, "vendorContactId"),
          vendorId: requireString(args, "vendorId"),
          contactType: optionalString(args, "contactType") ?? null,
          isPrimary: optionalBoolean(args, "isPrimary"),
        },
        userId,
        tenantId,
      ),
  },
  {
    name: "remove_vendor_contact",
    description: "Remove a contact from a vendor (deletes the VendorContact junction row).",
    inputSchema: {
      type: "object",
      properties: {
        vendorContactId: { type: "string" },
        vendorId: { type: "string" },
      },
      required: ["vendorContactId", "vendorId"],
      additionalProperties: false,
    },
    handler: async (args, { userId, tenantId }) => {
      const vendorContactId = requireString(args, "vendorContactId");
      const vendorId = requireString(args, "vendorId");
      await removeVendorContactCore(vendorContactId, vendorId, userId, tenantId);
      return { vendorContactId, vendorId, removed: true };
    },
  },
  // EventVendor (event ↔ vendor assignment) -----------------------------------
  {
    name: "add_vendor_to_event",
    description:
      "Assign a vendor to an event (creates the EventVendor row that puts the vendor in pickers for this event).",
    inputSchema: {
      type: "object",
      properties: { eventId: { type: "string" }, vendorId: { type: "string" } },
      required: ["eventId", "vendorId"],
      additionalProperties: false,
    },
    handler: (args, { userId, tenantId }) =>
      addVendorToEventCore(
        requireString(args, "eventId"),
        requireString(args, "vendorId"),
        userId,
      ),
  },
  {
    name: "remove_vendor_from_event",
    description:
      "Remove a vendor from an event by EventVendor id. Cannot remove system or venue-backed vendors (they are always surfaced as virtual entries).",
    inputSchema: {
      type: "object",
      properties: { eventVendorId: { type: "string" } },
      required: ["eventVendorId"],
      additionalProperties: false,
    },
    handler: async (args, { userId, tenantId }) => {
      const eventVendorId = requireString(args, "eventVendorId");
      await removeVendorFromEventCore(eventVendorId, userId);
      return { eventVendorId, removed: true };
    },
  },
  {
    name: "set_default_vendor_for_event_model_type",
    description:
      "Designate `vendorId` as the default vendor on `eventId` for the given order `modelType`. Transfers the designation away from any other vendor that held it. Lazy-creates the EventVendor row if needed.",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        vendorId: { type: "string" },
        modelType: { type: "string", enum: MODEL_TYPES },
      },
      required: ["eventId", "vendorId", "modelType"],
      additionalProperties: false,
    },
    handler: async (args, { userId, tenantId }) => {
      await setDefaultVendorCore(
        requireString(args, "eventId"),
        requireString(args, "vendorId"),
        requireModelType(args, "modelType"),
        userId,
      );
      return { ok: true };
    },
  },
  {
    name: "remove_default_vendor_for_event_model_type",
    description:
      "Remove the default-vendor designation on `eventId` for `vendorId` and the given order `modelType`.",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        vendorId: { type: "string" },
        modelType: { type: "string", enum: MODEL_TYPES },
      },
      required: ["eventId", "vendorId", "modelType"],
      additionalProperties: false,
    },
    handler: async (args, { userId, tenantId }) => {
      await removeDefaultVendorCore(
        requireString(args, "eventId"),
        requireString(args, "vendorId"),
        requireModelType(args, "modelType"),
        userId,
      );
      return { ok: true };
    },
  },
];
