import type { ProvidedBy } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermissionForUser } from "@/lib/permissions";
import {
  createBoothEquipmentItemCore,
  createBoothGroupCore,
  createExhibitBoothCore,
  deleteBoothEquipmentItemCore,
  deleteBoothGroupCore,
  deleteExhibitBoothCore,
  updateBoothEquipmentItemCore,
  updateBoothGroupCore,
  updateExhibitBoothCore,
  type BoothEquipmentItemWriteArgs,
  type BoothGroupWriteArgs,
  type BoothWriteArgs,
} from "@/app/events/exhibits/core";
import { withGroupDefaults } from "@/lib/boothGroups";
import type { McpToolDefinition } from "./types";
import { partialBoolean, partialString, requireString } from "./types";

const PROVIDED = new Set(["NOT_REQUIRED", "GROUP", "VENUE", "OUTSIDE_VENDOR"]);

function partialDate(args: Record<string, unknown>, key: string): Date | null | undefined {
  const v = partialString(args, key);
  if (v === undefined || v === null) return v;
  const d = new Date(v);
  if (isNaN(d.getTime())) throw new Error(`${key} is not a valid ISO 8601 datetime`);
  return d;
}

function partialProvided(args: Record<string, unknown>, key: string): ProvidedBy | null | undefined {
  const v = partialString(args, key);
  if (v === undefined || v === null) return v;
  if (!PROVIDED.has(v)) throw new Error(`${key} must be NOT_REQUIRED, GROUP (booth to provide), VENUE or OUTSIDE_VENDOR`);
  return v as ProvidedBy;
}

const TEXT_KEYS = [
  "groupId", "functionId", "boothNumber", "location", "boothType", "companyName", "contactId", "specialRequirements", "setupNotes",
  "avNotes", "fbNotes", "decorNotes", "securityNotes", "signageNotes", "materialHandlingNotes", "electricalNotes",
  "utilitiesNotes", "taxExemptId", "costCenter", "billingNotes",
] as const;
const DATE_KEYS = ["startAt", "endAt", "setupBy", "teardownBy"] as const;
const BOOL_KEYS = ["shippingRequired", "customsRequired", "taxExempt"] as const;
const PROVIDED_KEYS = ["avProvider", "electricalProvider"] as const;

function readBooth(args: Record<string, unknown>): Partial<BoothWriteArgs> {
  const out: Partial<BoothWriteArgs> = {};
  const set = <K extends keyof BoothWriteArgs>(k: K, v: BoothWriteArgs[K] | undefined) => {
    if (v !== undefined) out[k] = v;
  };
  const name = partialString(args, "name");
  if (name) out.name = name;
  for (const k of TEXT_KEYS) set(k, partialString(args, k));
  for (const k of DATE_KEYS) set(k, partialDate(args, k));
  for (const k of BOOL_KEYS) set(k, partialBoolean(args, k));
  for (const k of PROVIDED_KEYS) set(k, partialProvided(args, k));
  return out;
}

// Keys a booth shares with its group; on a booth, null means "use the group's".
const sharedProps = {
  functionId: { type: ["string", "null"], description: "The event's exhibit function. Empty times inherit from its schedule." },
  location: { type: ["string", "null"], description: "Booth location." },
  boothType: { type: ["string", "null"], description: "A booth_type option label (e.g. 10'x10', Table Top)." },
  startAt: { type: ["string", "null"], description: "ISO 8601 with offset." },
  endAt: { type: ["string", "null"] },
  setupBy: { type: ["string", "null"] },
  teardownBy: { type: ["string", "null"], description: "Tear down no later than." },
  specialRequirements: { type: ["string", "null"] },
  setupNotes: { type: ["string", "null"] },
  avProvider: { type: ["string", "null"], enum: ["NOT_REQUIRED", "GROUP", "VENUE", "OUTSIDE_VENDOR", null], description: "GROUP = booth to provide." },
  avNotes: { type: ["string", "null"] },
  fbNotes: { type: ["string", "null"] },
  decorNotes: { type: ["string", "null"] },
  securityNotes: { type: ["string", "null"] },
  signageNotes: { type: ["string", "null"] },
  shippingRequired: { type: ["boolean", "null"] },
  customsRequired: { type: ["boolean", "null"] },
  materialHandlingNotes: { type: ["string", "null"] },
  electricalProvider: { type: ["string", "null"], enum: ["NOT_REQUIRED", "GROUP", "VENUE", "OUTSIDE_VENDOR", null] },
  electricalNotes: { type: ["string", "null"] },
  utilitiesNotes: { type: ["string", "null"] },
  taxExempt: { type: ["boolean", "null"] },
  taxExemptId: { type: ["string", "null"] },
  costCenter: { type: ["string", "null"] },
  billingNotes: { type: ["string", "null"] },
} as const;

const boothProps = {
  name: { type: "string", description: "Booth name." },
  groupId: { type: ["string", "null"], description: "Booth group (list_booth_groups). The booth's null settings use the group's." },
  boothNumber: { type: ["string", "null"] },
  companyName: { type: ["string", "null"] },
  contactId: { type: ["string", "null"], description: "Key contact person for the booth (contact id in this tenant)." },
  ...sharedProps,
} as const;

const groupProps = { name: { type: "string", description: "Group name (e.g. Standard 10x10)." }, ...sharedProps } as const;

function readGroup(args: Record<string, unknown>): Partial<BoothGroupWriteArgs> {
  const { groupId: _g, boothNumber: _b, companyName: _c, contactId: _k, ...rest } = readBooth(args);
  return rest;
}

const equipmentInclude = { orderBy: { sortOrder: "asc" } } as const;

const equipmentProps = {
  equipmentId: { type: "string", description: "Equipment catalog id (list_equipment_catalog). Optional when `item` is given." },
  item: { type: "string", description: "Free-text item name when not using the catalog." },
  quantity: { type: "integer" },
  providerVendorId: { type: "string" },
  providerContactId: { type: "string" },
  operatorVendorId: { type: "string" },
  operatorContactId: { type: "string" },
  notes: { type: "string" },
} as const;

function readEquipment(args: Record<string, unknown>): BoothEquipmentItemWriteArgs {
  const s = (k: string) => (typeof args[k] === "string" && args[k] ? (args[k] as string) : null);
  return {
    equipmentId: s("equipmentId"),
    item: s("item") ?? "",
    quantity: typeof args.quantity === "number" ? Math.trunc(args.quantity) : null,
    providerVendorId: s("providerVendorId"),
    providerContactId: s("providerContactId"),
    operatorVendorId: s("operatorVendorId"),
    operatorContactId: s("operatorContactId"),
    notes: s("notes"),
  };
}

export const boothTools: McpToolDefinition[] = [
  {
    name: "list_exhibit_booths",
    description:
      "List an event's exhibit booths (ESG Part IIIb) with booth #, name, company, group, type, location, exhibit function and key contact (type/location/function as set on the booth; null = group's). Returns summary shape — use `get_exhibit_booth` for full detail (set-up, services, material handling, utilities, billing, inventory, effective values with group defaults applied).",
    inputSchema: { type: "object", properties: { eventId: { type: "string" } }, required: ["eventId"], additionalProperties: false },
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      await requirePermissionForUser(userId, "FUNCTIONS", "VIEW", eventId);
      return prisma.exhibitBooth.findMany({
        where: { eventId },
        select: {
          id: true,
          boothNumber: true,
          name: true,
          companyName: true,
          group: { select: { id: true, name: true } },
          boothType: true,
          location: true,
          function: { select: { id: true, name: true, functionNumber: true } },
          contact: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { sortOrder: "asc" },
      });
    },
  },
  {
    name: "get_exhibit_booth",
    description:
      "Get one exhibit booth with every Booth Set-up Order field as stored, its group (with the group's inventory), its own inventory, and `effective`: the booth's settings with the group's filling the blanks.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" } },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      await requirePermissionForUser(userId, "FUNCTIONS", "VIEW", eventId);
      const booth = await prisma.exhibitBooth.findFirst({
        where: { id: requireString(args, "id"), eventId },
        include: {
          function: { select: { id: true, name: true, functionNumber: true } },
          contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
          group: { include: { equipmentItems: equipmentInclude } },
          equipmentItems: equipmentInclude,
        },
      });
      if (!booth) return null;
      const { group, function: _fn, contact: _c, equipmentItems: _e, ...own } = booth;
      return { ...booth, effective: withGroupDefaults(own, group) };
    },
  },
  {
    name: "create_exhibit_booth",
    description: "Create an exhibit booth (one Booth Set-up Order). Only name is required; put it in a group to share that group's settings.",
    inputSchema: {
      type: "object",
      properties: { eventId: { type: "string" }, ...boothProps },
      required: ["eventId", "name"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      createExhibitBoothCore(requireString(args, "eventId"), { ...readBooth(args), name: requireString(args, "name") }, userId),
  },
  {
    name: "update_exhibit_booth",
    description: "Partially update an exhibit booth. Omitted keys are unchanged; null clears.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" }, ...boothProps },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      updateExhibitBoothCore(requireString(args, "id"), requireString(args, "eventId"), readBooth(args), userId),
  },
  {
    name: "delete_exhibit_booth",
    description: "Delete an exhibit booth and its inventory items.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" } },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      await deleteExhibitBoothCore(id, requireString(args, "eventId"), userId);
      return { id, deleted: true };
    },
  },
  {
    name: "list_booth_groups",
    description:
      "List an event's booth groups: name, booth count, type, location, exhibit function. Returns summary shape — use `get_booth_group` for full detail (times, services, material handling, utilities, billing, standard inventory, booths).",
    inputSchema: { type: "object", properties: { eventId: { type: "string" } }, required: ["eventId"], additionalProperties: false },
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      await requirePermissionForUser(userId, "FUNCTIONS", "VIEW", eventId);
      return prisma.exhibitBoothGroup.findMany({
        where: { eventId },
        select: {
          id: true,
          name: true,
          boothType: true,
          location: true,
          function: { select: { id: true, name: true, functionNumber: true } },
          _count: { select: { booths: true } },
        },
        orderBy: { sortOrder: "asc" },
      });
    },
  },
  {
    name: "get_booth_group",
    description: "Get one booth group with every shared setting, its standard per-booth inventory and its booths.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" } },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      await requirePermissionForUser(userId, "FUNCTIONS", "VIEW", eventId);
      return prisma.exhibitBoothGroup.findFirst({
        where: { id: requireString(args, "id"), eventId },
        include: {
          function: { select: { id: true, name: true, functionNumber: true } },
          equipmentItems: equipmentInclude,
          booths: { select: { id: true, boothNumber: true, name: true, companyName: true }, orderBy: { sortOrder: "asc" } },
        },
      });
    },
  },
  {
    name: "create_booth_group",
    description: "Create a booth group: settings (function, type, times, services, utilities, billing) its booths share unless a booth sets its own.",
    inputSchema: {
      type: "object",
      properties: { eventId: { type: "string" }, ...groupProps },
      required: ["eventId", "name"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      createBoothGroupCore(requireString(args, "eventId"), { ...readGroup(args), name: requireString(args, "name") }, userId),
  },
  {
    name: "update_booth_group",
    description: "Partially update a booth group. Omitted keys are unchanged; null clears.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" }, ...groupProps },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      updateBoothGroupCore(requireString(args, "id"), requireString(args, "eventId"), readGroup(args), userId),
  },
  {
    name: "delete_booth_group",
    description: "Delete a booth group and its standard inventory. Its booths stay, ungrouped.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" } },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      await deleteBoothGroupCore(id, requireString(args, "eventId"), userId);
      return { id, deleted: true };
    },
  },
  {
    name: "create_booth_equipment_item",
    description:
      "Add an inventory-needed line to an exhibit booth (boothId) or to a booth group's standard per-booth inventory (groupId). Pass exactly one.",
    inputSchema: {
      type: "object",
      properties: { boothId: { type: "string" }, groupId: { type: "string" }, eventId: { type: "string" }, ...equipmentProps },
      required: ["eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const boothId = typeof args.boothId === "string" ? args.boothId : null;
      const groupId = typeof args.groupId === "string" ? args.groupId : null;
      if (!boothId === !groupId) throw new Error("Pass exactly one of boothId or groupId");
      return createBoothEquipmentItemCore(
        boothId ? { boothId } : { groupId: groupId as string },
        requireString(args, "eventId"),
        readEquipment(args),
        userId,
      );
    },
  },
  {
    name: "update_booth_equipment_item",
    description: "Replace an exhibit booth or booth group inventory line.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" }, ...equipmentProps },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      updateBoothEquipmentItemCore(requireString(args, "id"), requireString(args, "eventId"), readEquipment(args), userId),
  },
  {
    name: "delete_booth_equipment_item",
    description: "Delete an exhibit booth or booth group inventory line.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" } },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      await deleteBoothEquipmentItemCore(id, requireString(args, "eventId"), userId);
      return { id, deleted: true };
    },
  },
];
