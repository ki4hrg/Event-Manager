import { PermissionResource } from "@prisma/client";
import type { EntityStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermissionForUser } from "@/lib/permissions";
import {
  addVendorToAVOrderCore,
  updateAVOrderVendorCore,
  removeVendorFromAVOrderCore,
  addVendorToCateringOrderCore,
  updateCateringOrderVendorCore,
  removeVendorFromCateringOrderCore,
  addVendorToSetupOrderCore,
  updateSetupOrderVendorCore,
  removeVendorFromSetupOrderCore,
  addVendorToPrintOrderCore,
  updatePrintOrderVendorCore,
  removeVendorFromPrintOrderCore,
} from "@/app/vendors/core";
import {
  createPrintOrderCore,
  updatePrintOrderCore,
  deletePrintOrderCore,
  deletePrintOrdersCore,
  bulkUpdatePrintOrdersCore,
  linkPrintOrderToFunctionCore,
  unlinkPrintOrderFromFunctionCore,
  linkPrintOrderToPresentationCore,
  unlinkPrintOrderFromPresentationCore,
  createPrintItemCore,
  updatePrintItemCore,
  deletePrintItemCore,
  type PrintItemWriteArgs,
  type BulkPrintOrderUpdates,
} from "@/app/events/print-orders/core";
import {
  createSupplyOrderCore,
  updateSupplyOrderCore,
  deleteSupplyOrderCore,
  deleteSupplyOrdersCore,
  bulkUpdateSupplyOrdersCore,
  updateSupplyOrderPackingStatusCore,
  linkSupplyOrderToFunctionCore,
  unlinkSupplyOrderFromFunctionCore,
  linkSupplyOrderToPresentationCore,
  unlinkSupplyOrderFromPresentationCore,
  createSupplyOrderItemCore,
  updateSupplyOrderItemCore,
  deleteSupplyOrderItemCore,
  updateSupplyOrderItemPackingStatusCore,
  type SupplyItemWriteArgs,
  type BulkSupplyOrderUpdates,
} from "@/app/events/supply-orders/core";
import {
  createSetupOrderCore,
  updateSetupOrderCore,
  deleteSetupOrderCore,
  deleteSetupOrdersCore,
  duplicateSetupOrderCore,
  bulkUpdateSetupOrdersCore,
  linkSetupOrderToFunctionCore,
  unlinkSetupOrderFromFunctionCore,
  linkSetupOrderToPresentationCore,
  unlinkSetupOrderFromPresentationCore,
  createSetupTableCore,
  updateSetupTableCore,
  deleteSetupTableCore,
  createSetupOrderDetailCore,
  updateSetupOrderDetailCore,
  deleteSetupOrderDetailCore,
  createSetupEquipmentItemCore,
  updateSetupEquipmentItemCore,
  deleteSetupEquipmentItemCore,
  type SetupTableWriteArgs,
  type SetupOrderDetailWriteArgs,
  type SetupEquipmentItemWriteArgs,
  type BulkSetupOrderUpdates,
} from "@/app/events/setup-orders/core";
import type { AcquisitionState, PackingStatus } from "@prisma/client";
import type { McpToolDefinition } from "./types";
import { requireString, optionalString, optionalStringArray } from "./types";

function optionalInt(args: Record<string, unknown>, key: string): number | null {
  const v = args[key];
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.trunc(v);
}

function readPrintItemArgs(args: Record<string, unknown>): PrintItemWriteArgs {
  return {
    description: requireString(args, "description"),
    quantity: optionalInt(args, "quantity"),
    distributionMethod: optionalString(args, "distributionMethod") ?? null,
    distributionNotes: optionalString(args, "distributionNotes") ?? null,
    designerVendorId: optionalString(args, "designerVendorId") ?? null,
    designerContactId: optionalString(args, "designerContactId") ?? null,
    printerVendorId: optionalString(args, "printerVendorId") ?? null,
    printerContactId: optionalString(args, "printerContactId") ?? null,
    notes: optionalString(args, "notes") ?? null,
  };
}

const printItemProps = {
  description: { type: "string" },
  quantity: { type: "number", description: "Optional integer." },
  distributionMethod: { type: "string", description: "Optional." },
  distributionNotes: { type: "string", description: "Optional." },
  designerVendorId: { type: "string", description: "Optional vendor id." },
  designerContactId: { type: "string", description: "Optional contact id." },
  printerVendorId: { type: "string", description: "Optional vendor id." },
  printerContactId: { type: "string", description: "Optional contact id." },
  notes: { type: "string", description: "Optional." },
} as const;

const ACQUISITION_STATES = ["ON_HAND", "TO_BUY", "TO_RENT", "TO_BORROW", "PROVIDED"] as const;
const PACKING_STATUSES = ["NEEDED", "PACKED", "LOADED", "DELIVERED", "RETURNED"] as const;

function readSupplyItemArgs(args: Record<string, unknown>): SupplyItemWriteArgs {
  return {
    description: optionalString(args, "description") ?? null,
    equipmentId: optionalString(args, "equipmentId") ?? null,
    quantity: optionalInt(args, "quantity"),
    acquisitionState: (optionalString(args, "acquisitionState") ?? "ON_HAND") as AcquisitionState,
    providerVendorId: optionalString(args, "providerVendorId") ?? null,
    providerContactId: optionalString(args, "providerContactId") ?? null,
    packingStatus: (optionalString(args, "packingStatus") ?? "NEEDED") as PackingStatus,
    notes: optionalString(args, "notes") ?? null,
  };
}

const supplyItemProps = {
  description: { type: "string", description: "Required unless equipmentId is set." },
  equipmentId: { type: "string", description: "Required unless description is set." },
  quantity: { type: "number" },
  acquisitionState: { type: "string", enum: ACQUISITION_STATES, description: "Defaults ON_HAND." },
  providerVendorId: { type: "string", description: "Optional. Single-party: vendor OR contact (setting vendor clears contact)." },
  providerContactId: { type: "string", description: "Optional. Single-party (see providerVendorId)." },
  packingStatus: { type: "string", enum: PACKING_STATUSES, description: "Defaults NEEDED." },
  notes: { type: "string" },
} as const;

function readSetupTableArgs(args: Record<string, unknown>): SetupTableWriteArgs {
  return {
    quantity: optionalInt(args, "quantity") ?? 0,
    tableType: optionalString(args, "tableType") ?? null,
    chairCount: optionalInt(args, "chairCount"),
    chairType: optionalString(args, "chairType") ?? null,
    providerVendorId: optionalString(args, "providerVendorId") ?? null,
    notes: optionalString(args, "notes") ?? null,
  };
}

function readSetupOrderDetailArgs(args: Record<string, unknown>): SetupOrderDetailWriteArgs {
  return {
    headline: optionalString(args, "headline") ?? null,
    description: requireString(args, "description"),
    responsiblePartyVendorId: optionalString(args, "responsiblePartyVendorId") ?? null,
  };
}

function readSetupEquipmentItemArgs(args: Record<string, unknown>): SetupEquipmentItemWriteArgs {
  return {
    equipmentId: optionalString(args, "equipmentId") ?? null,
    item: optionalString(args, "item") ?? "",
    quantity: optionalInt(args, "quantity"),
    providerVendorId: optionalString(args, "providerVendorId") ?? null,
    providerContactId: optionalString(args, "providerContactId") ?? null,
    operatorVendorId: optionalString(args, "operatorVendorId") ?? null,
    operatorContactId: optionalString(args, "operatorContactId") ?? null,
    notes: optionalString(args, "notes") ?? null,
  };
}

const setupTableProps = {
  quantity: { type: "number" },
  tableType: { type: "string", description: "Optional (e.g. ROUND_60, RECT_6FT — free text or CustomOption value)." },
  chairCount: { type: "number" },
  chairType: { type: "string" },
  providerVendorId: { type: "string", description: "Optional per-table provider vendor." },
  notes: { type: "string" },
} as const;

const setupOrderDetailProps = {
  headline: { type: "string", description: "Optional short title for the detail line." },
  description: { type: "string", description: "Required body text." },
  responsiblePartyVendorId: { type: "string", description: "Optional vendor responsible for this detail." },
} as const;

const setupEquipmentItemProps = {
  equipmentId: { type: "string", description: "Optional Equipment id. When set, server resolves canonical item name; otherwise `item` is used as the name." },
  item: { type: "string", description: "Required when equipmentId is null. Ignored when equipmentId is set." },
  quantity: { type: "number" },
  providerVendorId: { type: "string" },
  providerContactId: { type: "string" },
  operatorVendorId: { type: "string" },
  operatorContactId: { type: "string" },
  notes: { type: "string" },
} as const;

// Build the trio of MCP tools (add / update / remove) for vendor links on a
// given order type. The four order types differ only in the field name used
// to identify the order (avOrderId / cateringOrderId / setupOrderId / printOrderId)
// and the core functions invoked.
type OrderVendorBinding = {
  kind: "av" | "catering" | "setup" | "print";
  orderField: string;
  add: (orderId: string, vendorId: string, eventId: string, notes: string | null, userId: string) => Promise<unknown>;
  update: (id: string, orderId: string, eventId: string, notes: string | null, userId: string) => Promise<unknown>;
  remove: (id: string, orderId: string, eventId: string, userId: string) => Promise<void>;
};

function orderVendorTools(b: OrderVendorBinding): McpToolDefinition[] {
  return [
    {
      name: `add_vendor_to_${b.kind}_order`,
      description: `Link a vendor to a ${b.kind} order with optional notes (creates a ${b.kind}OrderVendor row).`,
      inputSchema: {
        type: "object",
        properties: {
          [b.orderField]: { type: "string" },
          vendorId: { type: "string" },
          eventId: { type: "string" },
          notes: { type: "string", description: "Optional." },
        },
        required: [b.orderField, "vendorId", "eventId"],
        additionalProperties: false,
      },
      handler: (args, { userId }) =>
        b.add(
          requireString(args, b.orderField),
          requireString(args, "vendorId"),
          requireString(args, "eventId"),
          optionalString(args, "notes") ?? null,
          userId,
        ),
    },
    {
      name: `update_${b.kind}_order_vendor`,
      description: `Update notes on a ${b.kind} order vendor link.`,
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: `The ${b.kind}OrderVendor row id.` },
          [b.orderField]: { type: "string" },
          eventId: { type: "string" },
          notes: { type: "string" },
        },
        required: ["id", b.orderField, "eventId"],
        additionalProperties: false,
      },
      handler: (args, { userId }) =>
        b.update(
          requireString(args, "id"),
          requireString(args, b.orderField),
          requireString(args, "eventId"),
          optionalString(args, "notes") ?? null,
          userId,
        ),
    },
    {
      name: `remove_vendor_from_${b.kind}_order`,
      description: `Remove a vendor link from a ${b.kind} order (deletes the ${b.kind}OrderVendor row).`,
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: `The ${b.kind}OrderVendor row id.` },
          [b.orderField]: { type: "string" },
          eventId: { type: "string" },
        },
        required: ["id", b.orderField, "eventId"],
        additionalProperties: false,
      },
      handler: async (args, { userId }) => {
        const id = requireString(args, "id");
        await b.remove(
          id,
          requireString(args, b.orderField),
          requireString(args, "eventId"),
          userId,
        );
        return { id, removed: true };
      },
    },
  ];
}

export const orderTools: McpToolDefinition[] = [
  // Catering ------------------------------------------------------------------
  {
    name: "list_catering_orders",
    description:
      "List catering orders for an event, including primary function summary and assigned vendors. Returns summary shape — use `get_catering_order` for full detail (menu sections, line items, equipment items, timeline items, full function include).",
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
        PermissionResource.CATERING_ORDERS,
        "VIEW",
        eventId,
      );
      return prisma.cateringOrder.findMany({
        where: { eventId },
        include: {
          function: {
            select: {
              id: true,
              name: true,
              schedules: { select: { startTime: true, endTime: true } },
            },
          },
          vendors: { include: { vendor: { select: { id: true, name: true } } } },
        },
      });
    },
  },
  {
    name: "get_catering_order",
    description:
      "Fetch a single catering order with menu sections, line items, equipment, timeline items, and vendors.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const row = await prisma.cateringOrder.findUnique({
        where: { id },
        include: {
          function: {
            include: {
              schedules: { orderBy: { startTime: "asc" } },
              rooms: { include: { room: { select: { id: true, name: true } } } },
            },
          },
          lineItems: { orderBy: [{ sortOrder: "asc" }, { description: "asc" }] },
          menuSections: {
            include: { responsiblePartyVendor: true },
            orderBy: [{ sortOrder: "asc" }],
          },
          equipmentItems: {
            include: {
              equipment: true,
              providerVendor: true,
              providerContact: true,
              operatorVendor: true,
              operatorContact: true,
            },
            orderBy: [{ sortOrder: "asc" }, { item: "asc" }],
          },
          timelineItems: { orderBy: [{ sortOrder: "asc" }, { startTime: "asc" }] },
          vendors: { include: { vendor: { select: { id: true, name: true } } } },
        },
      });
      if (!row) return null;
      await requirePermissionForUser(
        userId,
        PermissionResource.CATERING_ORDERS,
        "VIEW",
        row.eventId,
      );
      return row;
    },
  },
  // AV ------------------------------------------------------------------------
  {
    name: "list_av_orders",
    description:
      "List AV orders for an event, including linked functions and presentations and assigned vendors. Returns summary shape — use `get_av_order` for full detail (audio section with input groups + items + monitor mixes + outputs, video section with equipment items, function schedules).",
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
        PermissionResource.AV_ORDERS,
        "VIEW",
        eventId,
      );
      return prisma.aVOrder.findMany({
        where: { eventId },
        include: {
          functionLinks: { include: { function: { select: { id: true, name: true } } } },
          presentationLinks: {
            include: { presentation: { select: { id: true, title: true } } },
          },
          vendors: { include: { vendor: { select: { id: true, name: true } } } },
        },
        orderBy: { name: "asc" },
      });
    },
  },
  {
    name: "get_av_order",
    description:
      "Fetch a single AV order with audio/video sections, input groups, monitor mixes, equipment items, and vendors.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const row = await prisma.aVOrder.findUnique({
        where: { id },
        include: {
          functionLinks: {
            include: {
              function: {
                include: { schedules: { orderBy: { startTime: "asc" } } },
              },
            },
          },
          presentationLinks: {
            include: { presentation: { select: { id: true, title: true } } },
          },
          audioSection: {
            include: {
              inputGroups: {
                include: {
                  providerVendor: true,
                  providerContact: true,
                  operatorVendor: true,
                  operatorContact: true,
                  inputItems: {
                    include: {
                      equipment: true,
                      providerVendor: true,
                      providerContact: true,
                      operatorVendor: true,
                      operatorContact: true,
                    },
                    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
                  },
                },
                orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
              },
              monitorMixes: {
                include: {
                  monitorOutputs: {
                    include: { equipment: true },
                    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
                  },
                },
                orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
              },
            },
          },
          videoSection: {
            include: {
              equipmentItems: {
                include: {
                  equipment: true,
                  providerVendor: true,
                  providerContact: true,
                  operatorVendor: true,
                  operatorContact: true,
                },
                orderBy: [{ sortOrder: "asc" }, { item: "asc" }],
              },
            },
          },
          vendors: { include: { vendor: { select: { id: true, name: true } } } },
        },
      });
      if (!row) return null;
      await requirePermissionForUser(
        userId,
        PermissionResource.AV_ORDERS,
        "VIEW",
        row.eventId,
      );
      return row;
    },
  },
  // Setup ---------------------------------------------------------------------
  {
    name: "list_setup_orders",
    description:
      "List setup orders for an event, including assigned room, linked functions/presentations, tables, equipment, and vendors. Returns summary shape — use `get_setup_order` for full detail (table provider vendor, details with responsible-party vendor, equipment with provider/operator vendors+contacts, function schedules).",
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
        PermissionResource.SETUP_ORDERS,
        "VIEW",
        eventId,
      );
      return prisma.setupOrder.findMany({
        where: { eventId },
        include: {
          room: { select: { id: true, name: true } },
          functionLinks: { include: { function: { select: { id: true, name: true } } } },
          presentationLinks: {
            include: { presentation: { select: { id: true, title: true } } },
          },
          tables: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
          equipmentItems: { orderBy: [{ sortOrder: "asc" }, { item: "asc" }] },
          vendors: { include: { vendor: { select: { id: true, name: true } } } },
        },
        orderBy: { createdAt: "asc" },
      });
    },
  },
  {
    name: "get_setup_order",
    description:
      "Fetch a single setup order with full detail: tables (with provider vendor), details, equipment items, links.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const row = await prisma.setupOrder.findUnique({
        where: { id },
        include: {
          room: true,
          functionLinks: {
            include: {
              function: { include: { schedules: { orderBy: { startTime: "asc" } } } },
            },
          },
          presentationLinks: {
            include: {
              presentation: { select: { id: true, title: true, eventId: true } },
            },
          },
          tables: {
            include: { providerVendor: { select: { id: true, name: true } } },
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          },
          details: {
            include: { responsiblePartyVendor: { select: { id: true, name: true } } },
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          },
          equipmentItems: {
            include: {
              equipment: true,
              providerVendor: true,
              providerContact: true,
              operatorVendor: true,
              operatorContact: true,
            },
            orderBy: [{ sortOrder: "asc" }, { item: "asc" }],
          },
          vendors: { include: { vendor: { select: { id: true, name: true } } } },
        },
      });
      if (!row) return null;
      await requirePermissionForUser(
        userId,
        PermissionResource.SETUP_ORDERS,
        "VIEW",
        row.eventId,
      );
      return row;
    },
  },
  // Print ---------------------------------------------------------------------
  {
    name: "list_print_orders",
    description:
      "List print orders for an event, including items, linked functions/presentation, and vendors. Returns summary shape — use `get_print_order` for full detail (item designer/printer vendor+contact attribution, full function include with schedules + contacts).",
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
        PermissionResource.PRINT_ORDERS,
        "VIEW",
        eventId,
      );
      return prisma.printOrder.findMany({
        where: { eventId },
        include: {
          items: true,
          functions: { include: { function: { select: { id: true, name: true } } } },
          presentation: { select: { id: true, title: true } },
          vendors: { include: { vendor: { select: { id: true, name: true } } } },
        },
        orderBy: { createdAt: "asc" },
      });
    },
  },
  {
    name: "get_print_order",
    description:
      "Fetch a single print order with items (including designer/printer attribution), linked functions, and presentation.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const row = await prisma.printOrder.findUnique({
        where: { id },
        include: {
          functions: {
            include: {
              function: {
                include: {
                  schedules: { orderBy: { startTime: "asc" } },
                  contacts: { include: { contact: true } },
                },
              },
            },
            orderBy: { function: { name: "asc" } },
          },
          presentation: { select: { id: true, title: true, eventId: true } },
          items: {
            include: {
              designerVendor: { select: { id: true, name: true } },
              designerContact: { select: { id: true, firstName: true, lastName: true } },
              printerVendor: { select: { id: true, name: true } },
              printerContact: { select: { id: true, firstName: true, lastName: true } },
            },
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          },
          vendors: { include: { vendor: { select: { id: true, name: true } } } },
        },
      });
      if (!row) return null;
      await requirePermissionForUser(
        userId,
        PermissionResource.PRINT_ORDERS,
        "VIEW",
        row.eventId,
      );
      return row;
    },
  },
  // Supply --------------------------------------------------------------------
  {
    name: "list_supply_orders",
    description:
      "List supply orders for an event, including item packing/acquisition state summaries, links, and provider. Returns summary shape — use `get_supply_order` for full detail (per-item equipment + provider vendor/contact, function schedules + contacts, presentation speakers).",
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
        PermissionResource.SUPPLY_ORDERS,
        "VIEW",
        eventId,
      );
      return prisma.supplyOrder.findMany({
        where: { eventId },
        include: {
          room: { select: { id: true, name: true } },
          items: { select: { id: true, packingStatus: true, acquisitionState: true } },
          functions: { include: { function: { select: { id: true, name: true } } } },
          presentations: {
            include: { presentation: { select: { id: true, title: true } } },
          },
          providerVendor: { select: { id: true, name: true } },
          providerContact: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: "asc" },
      });
    },
  },
  {
    name: "get_supply_order",
    description:
      "Fetch a single supply order with full item-level provider attribution and link detail.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const row = await prisma.supplyOrder.findUnique({
        where: { id },
        include: {
          room: { select: { id: true, name: true } },
          providerVendor: { select: { id: true, name: true } },
          providerContact: { select: { id: true, firstName: true, lastName: true } },
          functions: {
            include: {
              function: {
                include: {
                  schedules: { orderBy: { startTime: "asc" } },
                  contacts: { include: { contact: true } },
                },
              },
            },
          },
          presentations: {
            include: { presentation: { select: { id: true, title: true } } },
          },
          items: {
            include: {
              providerVendor: { select: { id: true, name: true } },
            },
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          },
        },
      });
      if (!row) return null;
      await requirePermissionForUser(
        userId,
        PermissionResource.SUPPLY_ORDERS,
        "VIEW",
        row.eventId,
      );
      return row;
    },
  },
  // Order ↔ Vendor junctions (4 order types × 3 ops = 12 tools) --------------
  ...orderVendorTools({
    kind: "av",
    orderField: "avOrderId",
    add: addVendorToAVOrderCore,
    update: updateAVOrderVendorCore,
    remove: removeVendorFromAVOrderCore,
  }),
  ...orderVendorTools({
    kind: "catering",
    orderField: "cateringOrderId",
    add: addVendorToCateringOrderCore,
    update: updateCateringOrderVendorCore,
    remove: removeVendorFromCateringOrderCore,
  }),
  ...orderVendorTools({
    kind: "setup",
    orderField: "setupOrderId",
    add: addVendorToSetupOrderCore,
    update: updateSetupOrderVendorCore,
    remove: removeVendorFromSetupOrderCore,
  }),
  ...orderVendorTools({
    kind: "print",
    orderField: "printOrderId",
    add: addVendorToPrintOrderCore,
    update: updatePrintOrderVendorCore,
    remove: removeVendorFromPrintOrderCore,
  }),
  // PrintOrder writes -------------------------------------------------------
  {
    name: "create_print_order",
    description:
      "Create a print order on an event. Optionally pin to a function and/or presentation at create. If `vendorId` is omitted, the event's default PRINT_ORDER vendor (if any) is auto-assigned. Auto-assigns default workflows.",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        name: { type: "string" },
        notes: { type: "string", description: "Optional." },
        functionId: { type: "string", description: "Optional initial function link." },
        presentationId: { type: "string", description: "Optional 1:1 presentation link." },
        vendorId: { type: "string", description: "Optional vendor pin. Falls back to event default." },
      },
      required: ["eventId", "name"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      return createPrintOrderCore(
        eventId,
        {
          name: requireString(args, "name"),
          notes: optionalString(args, "notes") ?? null,
          functionId: optionalString(args, "functionId") ?? null,
          presentationId: optionalString(args, "presentationId") ?? null,
          vendorId: optionalString(args, "vendorId") ?? null,
        },
        userId,
      );
    },
  },
  {
    name: "update_print_order",
    description: "Update name / notes on a print order.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        eventId: { type: "string" },
        name: { type: "string" },
        notes: { type: "string" },
      },
      required: ["id", "eventId", "name"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      updatePrintOrderCore(
        requireString(args, "id"),
        requireString(args, "eventId"),
        {
          name: requireString(args, "name"),
          notes: optionalString(args, "notes") ?? null,
        },
        userId,
      ),
  },
  {
    name: "delete_print_order",
    description: "Delete a print order by id. Cascades per schema.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" } },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const eventId = requireString(args, "eventId");
      await deletePrintOrderCore(id, eventId, userId);
      return { id, deleted: true };
    },
  },
  {
    name: "delete_print_orders",
    description: "Bulk-delete multiple print orders from an event.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" } },
        eventId: { type: "string" },
      },
      required: ["ids", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      deletePrintOrdersCore(
        optionalStringArray(args, "ids"),
        requireString(args, "eventId"),
        userId,
      ),
  },
  {
    name: "bulk_update_print_orders",
    description:
      "Update status / substatus / vendor (replace-all) / function link (skip-existing) on multiple print orders at once.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" } },
        eventId: { type: "string" },
        status: {
          type: "string",
          enum: ["TODO", "IN_PROGRESS", "READY", "BLOCKED", "DONE", "CANCELLED"],
        },
        substatus: { type: "string" },
        vendorId: { type: "string", description: "When set, replaces all vendor links on the targeted orders." },
        functionId: { type: "string", description: "When set, ensures this function is linked on all targets (skip-existing)." },
      },
      required: ["ids", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const ids = optionalStringArray(args, "ids");
      const eventId = requireString(args, "eventId");
      const updates: BulkPrintOrderUpdates = {};
      const status = optionalString(args, "status");
      if (status) updates.status = status as EntityStatus;
      if ("substatus" in args) updates.substatus = optionalString(args, "substatus") ?? null;
      const vendorId = optionalString(args, "vendorId");
      if (vendorId) updates.vendorId = vendorId;
      const functionId = optionalString(args, "functionId");
      if (functionId) updates.functionId = functionId;
      await bulkUpdatePrintOrdersCore(ids, eventId, updates, userId);
      return { ok: true };
    },
  },
  // PrintOrder links -------------------------------------------------------
  {
    name: "link_print_order_to_function",
    description: "Link a print order to a function (M:M via PrintOrderFunction).",
    inputSchema: {
      type: "object",
      properties: {
        printOrderId: { type: "string" },
        functionId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["printOrderId", "functionId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      linkPrintOrderToFunctionCore(
        requireString(args, "printOrderId"),
        requireString(args, "functionId"),
        requireString(args, "eventId"),
        userId,
      ),
  },
  {
    name: "unlink_print_order_from_function",
    description: "Remove a print order's link to a function.",
    inputSchema: {
      type: "object",
      properties: {
        printOrderId: { type: "string" },
        functionId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["printOrderId", "functionId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      unlinkPrintOrderFromFunctionCore(
        requireString(args, "printOrderId"),
        requireString(args, "functionId"),
        requireString(args, "eventId"),
        userId,
      ),
  },
  {
    name: "link_print_order_to_presentation",
    description: "Link a print order to a presentation (1:1 via PrintOrder.presentationId — replaces any prior link).",
    inputSchema: {
      type: "object",
      properties: {
        printOrderId: { type: "string" },
        presentationId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["printOrderId", "presentationId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      linkPrintOrderToPresentationCore(
        requireString(args, "printOrderId"),
        requireString(args, "presentationId"),
        requireString(args, "eventId"),
        userId,
      ),
  },
  {
    name: "unlink_print_order_from_presentation",
    description: "Clear the print order's presentation link.",
    inputSchema: {
      type: "object",
      properties: {
        printOrderId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["printOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      unlinkPrintOrderFromPresentationCore(
        requireString(args, "printOrderId"),
        requireString(args, "eventId"),
        userId,
      ),
  },
  // PrintItem ---------------------------------------------------------------
  {
    name: "create_print_item",
    description: "Add a PrintItem line to a print order. sortOrder is auto-appended.",
    inputSchema: {
      type: "object",
      properties: {
        printOrderId: { type: "string" },
        eventId: { type: "string" },
        ...printItemProps,
      },
      required: ["printOrderId", "eventId", "description"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      createPrintItemCore(
        requireString(args, "printOrderId"),
        requireString(args, "eventId"),
        readPrintItemArgs(args),
        userId,
      ),
  },
  {
    name: "update_print_item",
    description: "Replace all writable fields on a PrintItem line.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        printOrderId: { type: "string" },
        eventId: { type: "string" },
        ...printItemProps,
      },
      required: ["id", "printOrderId", "eventId", "description"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      updatePrintItemCore(
        requireString(args, "id"),
        requireString(args, "printOrderId"),
        requireString(args, "eventId"),
        readPrintItemArgs(args),
        userId,
      ),
  },
  {
    name: "delete_print_item",
    description: "Delete a PrintItem line.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        printOrderId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["id", "printOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const printOrderId = requireString(args, "printOrderId");
      const eventId = requireString(args, "eventId");
      await deletePrintItemCore(id, printOrderId, eventId, userId);
      return { id, deleted: true };
    },
  },
  // SupplyOrder writes -----------------------------------------------------
  {
    name: "create_supply_order",
    description:
      "Create a supply order on an event. `roomId` (destination room) is required. Provider is a single-party concept: pass either providerVendorId OR providerContactId (passing vendor clears contact). When both are omitted the event's default SUPPLY_ORDER vendor (if any) is auto-assigned. Auto-assigns default workflows. Optionally pin to a function and/or presentation at create.",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        name: { type: "string" },
        roomId: { type: "string", description: "Destination room id (required)." },
        specificLocation: { type: "string", description: "Optional sub-location within the room." },
        notes: { type: "string" },
        providerVendorId: { type: "string" },
        providerContactId: { type: "string" },
        functionId: { type: "string", description: "Optional initial M:M function link." },
        presentationId: { type: "string", description: "Optional initial M:M presentation link." },
      },
      required: ["eventId", "name", "roomId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      createSupplyOrderCore(
        requireString(args, "eventId"),
        {
          name: requireString(args, "name"),
          roomId: requireString(args, "roomId"),
          specificLocation: optionalString(args, "specificLocation") ?? null,
          notes: optionalString(args, "notes") ?? null,
          providerVendorId: optionalString(args, "providerVendorId") ?? null,
          providerContactId: optionalString(args, "providerContactId") ?? null,
          functionId: optionalString(args, "functionId") ?? null,
          presentationId: optionalString(args, "presentationId") ?? null,
        },
        userId,
      ),
  },
  {
    name: "update_supply_order",
    description: "Update name / room / specific location / notes / provider on a supply order.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        eventId: { type: "string" },
        name: { type: "string" },
        roomId: { type: "string" },
        specificLocation: { type: "string" },
        notes: { type: "string" },
        providerVendorId: { type: "string" },
        providerContactId: { type: "string" },
      },
      required: ["id", "eventId", "name", "roomId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      updateSupplyOrderCore(
        requireString(args, "id"),
        requireString(args, "eventId"),
        {
          name: requireString(args, "name"),
          roomId: requireString(args, "roomId"),
          specificLocation: optionalString(args, "specificLocation") ?? null,
          notes: optionalString(args, "notes") ?? null,
          providerVendorId: optionalString(args, "providerVendorId") ?? null,
          providerContactId: optionalString(args, "providerContactId") ?? null,
        },
        userId,
      ),
  },
  {
    name: "delete_supply_order",
    description: "Delete a supply order by id. Cascades per schema.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" } },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const eventId = requireString(args, "eventId");
      await deleteSupplyOrderCore(id, eventId, userId);
      return { id, deleted: true };
    },
  },
  {
    name: "delete_supply_orders",
    description: "Bulk-delete multiple supply orders from an event.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" } },
        eventId: { type: "string" },
      },
      required: ["ids", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      deleteSupplyOrdersCore(
        optionalStringArray(args, "ids"),
        requireString(args, "eventId"),
        userId,
      ),
  },
  {
    name: "update_supply_order_packing_status",
    description:
      "Set the order-level packing status. When a status is provided, the change cascades to every item in a single transaction (one-way: item-level changes do NOT bubble back up).",
    inputSchema: {
      type: "object",
      properties: {
        supplyOrderId: { type: "string" },
        eventId: { type: "string" },
        packingStatus: { type: "string", enum: [...PACKING_STATUSES, ""], description: "Pass empty string to clear." },
      },
      required: ["supplyOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const raw = optionalString(args, "packingStatus") ?? "";
      const packingStatus = raw ? (raw as PackingStatus) : null;
      await updateSupplyOrderPackingStatusCore(
        requireString(args, "supplyOrderId"),
        requireString(args, "eventId"),
        packingStatus,
        userId,
      );
      return { ok: true };
    },
  },
  {
    name: "bulk_update_supply_orders",
    description: "Update status / substatus / function link / presentation link on multiple supply orders at once (links are skip-existing add).",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" } },
        eventId: { type: "string" },
        status: { type: "string", enum: ["TODO", "IN_PROGRESS", "READY", "BLOCKED", "DONE", "CANCELLED"] },
        substatus: { type: "string" },
        functionId: { type: "string" },
        presentationId: { type: "string" },
      },
      required: ["ids", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const ids = optionalStringArray(args, "ids");
      const eventId = requireString(args, "eventId");
      const updates: BulkSupplyOrderUpdates = {};
      const status = optionalString(args, "status");
      if (status) updates.status = status as EntityStatus;
      if ("substatus" in args) updates.substatus = optionalString(args, "substatus") ?? null;
      const functionId = optionalString(args, "functionId");
      if (functionId) updates.functionId = functionId;
      const presentationId = optionalString(args, "presentationId");
      if (presentationId) updates.presentationId = presentationId;
      await bulkUpdateSupplyOrdersCore(ids, eventId, updates, userId);
      return { ok: true };
    },
  },
  // SupplyOrder links -----------------------------------------------------
  {
    name: "link_supply_order_to_function",
    description: "Link a supply order to a function (M:M via SupplyOrderFunction).",
    inputSchema: {
      type: "object",
      properties: {
        supplyOrderId: { type: "string" },
        functionId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["supplyOrderId", "functionId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      linkSupplyOrderToFunctionCore(
        requireString(args, "supplyOrderId"),
        requireString(args, "functionId"),
        requireString(args, "eventId"),
        userId,
      ),
  },
  {
    name: "unlink_supply_order_from_function",
    description: "Remove a supply order's link to a function.",
    inputSchema: {
      type: "object",
      properties: {
        supplyOrderId: { type: "string" },
        functionId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["supplyOrderId", "functionId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      unlinkSupplyOrderFromFunctionCore(
        requireString(args, "supplyOrderId"),
        requireString(args, "functionId"),
        requireString(args, "eventId"),
        userId,
      ),
  },
  {
    name: "link_supply_order_to_presentation",
    description: "Link a supply order to a presentation (M:M via SupplyOrderPresentation).",
    inputSchema: {
      type: "object",
      properties: {
        supplyOrderId: { type: "string" },
        presentationId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["supplyOrderId", "presentationId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      linkSupplyOrderToPresentationCore(
        requireString(args, "supplyOrderId"),
        requireString(args, "presentationId"),
        requireString(args, "eventId"),
        userId,
      ),
  },
  {
    name: "unlink_supply_order_from_presentation",
    description: "Remove a supply order's link to a presentation.",
    inputSchema: {
      type: "object",
      properties: {
        supplyOrderId: { type: "string" },
        presentationId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["supplyOrderId", "presentationId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      unlinkSupplyOrderFromPresentationCore(
        requireString(args, "supplyOrderId"),
        requireString(args, "presentationId"),
        requireString(args, "eventId"),
        userId,
      ),
  },
  // SupplyOrderItem -----------------------------------------------------
  {
    name: "create_supply_order_item",
    description:
      "Add a SupplyOrderItem to a supply order. Must provide either description or equipmentId. Provider is single-party (vendor OR contact). sortOrder is auto-appended.",
    inputSchema: {
      type: "object",
      properties: {
        supplyOrderId: { type: "string" },
        eventId: { type: "string" },
        ...supplyItemProps,
      },
      required: ["supplyOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      createSupplyOrderItemCore(
        requireString(args, "supplyOrderId"),
        requireString(args, "eventId"),
        readSupplyItemArgs(args),
        userId,
      ),
  },
  {
    name: "update_supply_order_item",
    description: "Replace all writable fields on a SupplyOrderItem.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        supplyOrderId: { type: "string" },
        eventId: { type: "string" },
        ...supplyItemProps,
      },
      required: ["id", "supplyOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      updateSupplyOrderItemCore(
        requireString(args, "id"),
        requireString(args, "supplyOrderId"),
        requireString(args, "eventId"),
        readSupplyItemArgs(args),
        userId,
      ),
  },
  {
    name: "delete_supply_order_item",
    description: "Delete a SupplyOrderItem.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        supplyOrderId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["id", "supplyOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const supplyOrderId = requireString(args, "supplyOrderId");
      const eventId = requireString(args, "eventId");
      await deleteSupplyOrderItemCore(id, supplyOrderId, eventId, userId);
      return { id, deleted: true };
    },
  },
  {
    name: "update_supply_order_item_packing_status",
    description: "Set the packing status on a single SupplyOrderItem.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        supplyOrderId: { type: "string" },
        eventId: { type: "string" },
        packingStatus: { type: "string", enum: PACKING_STATUSES },
      },
      required: ["id", "supplyOrderId", "eventId", "packingStatus"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const supplyOrderId = requireString(args, "supplyOrderId");
      const eventId = requireString(args, "eventId");
      const packingStatus = requireString(args, "packingStatus") as PackingStatus;
      await updateSupplyOrderItemPackingStatusCore(id, supplyOrderId, eventId, packingStatus, userId);
      return { ok: true };
    },
  },
  // SetupOrder writes -----------------------------------------------------
  {
    name: "create_setup_order",
    description:
      "Create a setup order on an event. All fields except eventId are optional. If `vendorId` is omitted, the event's default SETUP_ORDER vendor (if any) is auto-assigned. Optionally pin to a function and/or presentation at create. Auto-assigns default workflows.",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        name: { type: "string" },
        setupType: { type: "string", description: "Optional CustomOption value or free text." },
        notes: { type: "string" },
        roomId: { type: "string", description: "Optional destination room." },
        functionId: { type: "string", description: "Optional initial M:M function link." },
        presentationId: { type: "string", description: "Optional initial M:M presentation link." },
        vendorId: { type: "string", description: "Optional vendor pin. Falls back to event default." },
      },
      required: ["eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      createSetupOrderCore(
        requireString(args, "eventId"),
        {
          name: optionalString(args, "name") ?? null,
          setupType: optionalString(args, "setupType") ?? null,
          notes: optionalString(args, "notes") ?? null,
          roomId: optionalString(args, "roomId") ?? null,
          functionId: optionalString(args, "functionId") ?? null,
          presentationId: optionalString(args, "presentationId") ?? null,
          vendorId: optionalString(args, "vendorId") ?? null,
        },
        userId,
      ),
  },
  {
    name: "update_setup_order",
    description: "Update name / setupType / notes / room on a setup order.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        eventId: { type: "string" },
        name: { type: "string" },
        setupType: { type: "string" },
        notes: { type: "string" },
        roomId: { type: "string" },
      },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      updateSetupOrderCore(
        requireString(args, "id"),
        requireString(args, "eventId"),
        {
          name: optionalString(args, "name") ?? null,
          setupType: optionalString(args, "setupType") ?? null,
          notes: optionalString(args, "notes") ?? null,
          roomId: optionalString(args, "roomId") ?? null,
        },
        userId,
      ),
  },
  {
    name: "delete_setup_order",
    description: "Delete a setup order by id. Cascades per schema.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" } },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const eventId = requireString(args, "eventId");
      await deleteSetupOrderCore(id, eventId, userId);
      return { id, deleted: true };
    },
  },
  {
    name: "delete_setup_orders",
    description: "Bulk-delete multiple setup orders from an event.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" } },
        eventId: { type: "string" },
      },
      required: ["ids", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      deleteSetupOrdersCore(
        optionalStringArray(args, "ids"),
        requireString(args, "eventId"),
        userId,
      ),
  },
  {
    name: "duplicate_setup_order",
    description: 'Duplicate a setup order (including tables, details, equipment items) into the same event. Named "<original> (Copy)".',
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" } },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      duplicateSetupOrderCore(
        requireString(args, "id"),
        requireString(args, "eventId"),
        userId,
      ),
  },
  {
    name: "bulk_update_setup_orders",
    description: "Update status / substatus / vendor (replace-all) on multiple setup orders at once.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" } },
        eventId: { type: "string" },
        status: { type: "string", enum: ["TODO", "IN_PROGRESS", "READY", "BLOCKED", "DONE", "CANCELLED"] },
        substatus: { type: "string" },
        vendorId: { type: "string" },
      },
      required: ["ids", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const ids = optionalStringArray(args, "ids");
      const eventId = requireString(args, "eventId");
      const updates: BulkSetupOrderUpdates = {};
      const status = optionalString(args, "status");
      if (status) updates.status = status as EntityStatus;
      if ("substatus" in args) updates.substatus = optionalString(args, "substatus") ?? null;
      const vendorId = optionalString(args, "vendorId");
      if (vendorId) updates.vendorId = vendorId;
      await bulkUpdateSetupOrdersCore(ids, eventId, updates, userId);
      return { ok: true };
    },
  },
  // SetupOrder links -----------------------------------------------------
  {
    name: "link_setup_order_to_function",
    description: "Link a setup order to a function (M:M via SetupOrderFunction, upsert).",
    inputSchema: {
      type: "object",
      properties: {
        setupOrderId: { type: "string" },
        functionId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["setupOrderId", "functionId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      linkSetupOrderToFunctionCore(
        requireString(args, "setupOrderId"),
        requireString(args, "functionId"),
        requireString(args, "eventId"),
        userId,
      ),
  },
  {
    name: "unlink_setup_order_from_function",
    description: "Remove a setup order's link to a function.",
    inputSchema: {
      type: "object",
      properties: {
        setupOrderId: { type: "string" },
        functionId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["setupOrderId", "functionId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      unlinkSetupOrderFromFunctionCore(
        requireString(args, "setupOrderId"),
        requireString(args, "functionId"),
        requireString(args, "eventId"),
        userId,
      ),
  },
  {
    name: "link_setup_order_to_presentation",
    description: "Link a setup order to a presentation (M:M via SetupOrderPresentation, upsert).",
    inputSchema: {
      type: "object",
      properties: {
        setupOrderId: { type: "string" },
        presentationId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["setupOrderId", "presentationId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      linkSetupOrderToPresentationCore(
        requireString(args, "setupOrderId"),
        requireString(args, "presentationId"),
        requireString(args, "eventId"),
        userId,
      ),
  },
  {
    name: "unlink_setup_order_from_presentation",
    description: "Remove a setup order's link to a presentation.",
    inputSchema: {
      type: "object",
      properties: {
        setupOrderId: { type: "string" },
        presentationId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["setupOrderId", "presentationId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      unlinkSetupOrderFromPresentationCore(
        requireString(args, "setupOrderId"),
        requireString(args, "presentationId"),
        requireString(args, "eventId"),
        userId,
      ),
  },
  // SetupTable -----------------------------------------------------
  {
    name: "create_setup_table",
    description: "Add a SetupTable row to a setup order. sortOrder is auto-appended.",
    inputSchema: {
      type: "object",
      properties: {
        setupOrderId: { type: "string" },
        eventId: { type: "string" },
        ...setupTableProps,
      },
      required: ["setupOrderId", "eventId", "quantity"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      createSetupTableCore(
        requireString(args, "setupOrderId"),
        requireString(args, "eventId"),
        readSetupTableArgs(args),
        userId,
      ),
  },
  {
    name: "update_setup_table",
    description: "Replace all writable fields on a SetupTable row.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        setupOrderId: { type: "string" },
        eventId: { type: "string" },
        ...setupTableProps,
      },
      required: ["id", "setupOrderId", "eventId", "quantity"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      updateSetupTableCore(
        requireString(args, "id"),
        requireString(args, "setupOrderId"),
        requireString(args, "eventId"),
        readSetupTableArgs(args),
        userId,
      ),
  },
  {
    name: "delete_setup_table",
    description: "Delete a SetupTable row.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        setupOrderId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["id", "setupOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const setupOrderId = requireString(args, "setupOrderId");
      const eventId = requireString(args, "eventId");
      await deleteSetupTableCore(id, setupOrderId, eventId, userId);
      return { id, deleted: true };
    },
  },
  // SetupOrderDetail -----------------------------------------------------
  {
    name: "create_setup_order_detail",
    description:
      "Add a SetupOrderDetail line (free-form setup instruction). sortOrder is auto-appended.",
    inputSchema: {
      type: "object",
      properties: {
        setupOrderId: { type: "string" },
        eventId: { type: "string" },
        ...setupOrderDetailProps,
      },
      required: ["setupOrderId", "eventId", "description"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      createSetupOrderDetailCore(
        requireString(args, "setupOrderId"),
        requireString(args, "eventId"),
        readSetupOrderDetailArgs(args),
        userId,
      ),
  },
  {
    name: "update_setup_order_detail",
    description: "Replace all writable fields on a SetupOrderDetail line.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        setupOrderId: { type: "string" },
        eventId: { type: "string" },
        ...setupOrderDetailProps,
      },
      required: ["id", "setupOrderId", "eventId", "description"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      updateSetupOrderDetailCore(
        requireString(args, "id"),
        requireString(args, "setupOrderId"),
        requireString(args, "eventId"),
        readSetupOrderDetailArgs(args),
        userId,
      ),
  },
  {
    name: "delete_setup_order_detail",
    description: "Delete a SetupOrderDetail line.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        setupOrderId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["id", "setupOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const setupOrderId = requireString(args, "setupOrderId");
      const eventId = requireString(args, "eventId");
      await deleteSetupOrderDetailCore(id, setupOrderId, eventId, userId);
      return { id, deleted: true };
    },
  },
  // Setup EquipmentItem -----------------------------------------------------
  {
    name: "create_setup_equipment_item",
    description: "Add an EquipmentItem to a setup order. When `equipmentId` is set, the canonical item name is resolved server-side from the Equipment row.",
    inputSchema: {
      type: "object",
      properties: {
        setupOrderId: { type: "string" },
        eventId: { type: "string" },
        ...setupEquipmentItemProps,
      },
      required: ["setupOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      createSetupEquipmentItemCore(
        requireString(args, "setupOrderId"),
        requireString(args, "eventId"),
        readSetupEquipmentItemArgs(args),
        userId,
      ),
  },
  {
    name: "update_setup_equipment_item",
    description: "Replace all writable fields on a setup-order EquipmentItem.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        setupOrderId: { type: "string" },
        eventId: { type: "string" },
        ...setupEquipmentItemProps,
      },
      required: ["id", "setupOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      updateSetupEquipmentItemCore(
        requireString(args, "id"),
        requireString(args, "setupOrderId"),
        requireString(args, "eventId"),
        readSetupEquipmentItemArgs(args),
        userId,
      ),
  },
  {
    name: "delete_setup_equipment_item",
    description: "Delete a setup-order EquipmentItem.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        setupOrderId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["id", "setupOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const setupOrderId = requireString(args, "setupOrderId");
      const eventId = requireString(args, "eventId");
      await deleteSetupEquipmentItemCore(id, setupOrderId, eventId, userId);
      return { id, deleted: true };
    },
  },
];
