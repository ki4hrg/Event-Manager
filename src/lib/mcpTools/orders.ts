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
  updatePrintOrderPackingStatusCore,
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
  updatePrintItemAcquisitionStateCore,
  type PrintItemWriteArgs,
  type BulkPrintOrderUpdates,
} from "@/app/events/print-orders/core";
import {
  createSupplyOrderCore,
  updateSupplyOrderCore,
  deleteSupplyOrderCore,
  deleteSupplyOrdersCore,
  bulkUpdateSupplyOrdersCore,
  bulkSetSupplyOrderItemsPackingStatusCore,
  bulkSetSupplyOrderItemsAcquisitionStateCore,
  linkSupplyOrderToFunctionCore,
  unlinkSupplyOrderFromFunctionCore,
  linkSupplyOrderToPresentationCore,
  unlinkSupplyOrderFromPresentationCore,
  createSupplyOrderItemCore,
  updateSupplyOrderItemCore,
  deleteSupplyOrderItemCore,
  updateSupplyOrderItemPackingStatusCore,
  updateSupplyOrderItemAcquisitionStateCore,
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
import {
  createCateringOrderCore,
  updateCateringOrderCore,
  deleteCateringOrderCore,
  deleteCateringOrdersCore,
  bulkUpdateCateringOrdersCore,
  linkCateringOrderToFunctionCore,
  unlinkCateringOrderFromFunctionCore,
  createTimelineItemCore,
  updateTimelineItemCore,
  deleteTimelineItemCore,
  createCateringEquipmentItemCore,
  updateCateringEquipmentItemCore,
  deleteCateringEquipmentItemCore,
  createCateringOrderLineItemCore,
  updateCateringOrderLineItemCore,
  deleteCateringOrderLineItemCore,
  createCateringOrderMenuSectionCore,
  updateCateringOrderMenuSectionCore,
  deleteCateringOrderMenuSectionCore,
  createCateringOrderServiceLocationCore,
  updateCateringOrderServiceLocationCore,
  deleteCateringOrderServiceLocationCore,
  addCateringOrderContactCore,
  updateCateringOrderContactCore,
  removeCateringOrderContactCore,
  createAndAddCateringOrderContactCore,
  type CreateCateringOrderArgs,
  type UpdateCateringOrderArgs,
  type TimelineItemWriteArgs,
  type CateringEquipmentItemWriteArgs,
  type LineItemWriteArgs,
  type MenuSectionWriteArgs,
  type ServiceLocationWriteArgs,
  type BulkCateringOrderUpdates,
} from "@/app/events/catering-orders/core";
import {
  createAVOrderCore,
  updateAVOrderCore,
  deleteAVOrderCore,
  deleteAVOrdersCore,
  bulkUpdateAVOrdersCore,
  linkAVOrderToFunctionCore,
  unlinkAVOrderFromFunctionCore,
  linkAVOrderToPresentationCore,
  unlinkAVOrderFromPresentationCore,
  updateAudioSectionCore,
  createInputGroupCore,
  updateInputGroupCore,
  deleteInputGroupCore,
  createInputItemCore,
  updateInputItemCore,
  deleteInputItemCore,
  createMonitorMixCore,
  updateMonitorMixCore,
  deleteMonitorMixCore,
  createMonitorOutputCore,
  updateMonitorOutputCore,
  deleteMonitorOutputCore,
  updateVideoSectionCore,
  createVideoEquipmentItemCore,
  updateVideoEquipmentItemCore,
  deleteVideoEquipmentItemCore,
  createAVEquipmentItemCore,
  updateAVEquipmentItemCore,
  deleteAVEquipmentItemCore,
  type InputItemWriteArgs,
  type MonitorMixWriteArgs,
  type MonitorOutputWriteArgs,
  type AVEquipmentItemWriteArgs,
  type BulkAVOrderUpdates,
} from "@/app/events/av-orders/core";
import type { AcquisitionState, PackingStatus } from "@prisma/client";
import type { McpToolDefinition } from "./types";
import { requireString, optionalString, optionalStringArray } from "./types";

function optionalInt(args: Record<string, unknown>, key: string): number | null {
  const v = args[key];
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.trunc(v);
}

// Parse an ISO 8601 date/time string into a Date. Returns null when the key
// is absent, an empty string, or unparseable.
function parseOptionalDate(args: Record<string, unknown>, key: string): Date | null {
  const v = args[key];
  if (typeof v !== "string" || v.length === 0) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function readPrintItemArgs(args: Record<string, unknown>): PrintItemWriteArgs {
  return {
    description: requireString(args, "description"),
    quantity: optionalInt(args, "quantity"),
    acquisitionState: (optionalString(args, "acquisitionState") ?? "TO_PROCURE") as AcquisitionState,
    packingStatus: (optionalString(args, "packingStatus") ?? "NEEDED") as PackingStatus,
    distributionMethod: optionalString(args, "distributionMethod") ?? null,
    distributionNotes: optionalString(args, "distributionNotes") ?? null,
    designerVendorId: optionalString(args, "designerVendorId") ?? null,
    designerContactId: optionalString(args, "designerContactId") ?? null,
    printerVendorId: optionalString(args, "printerVendorId") ?? null,
    printerContactId: optionalString(args, "printerContactId") ?? null,
    notes: optionalString(args, "notes") ?? null,
    sourceLocationId: optionalString(args, "sourceLocationId") ?? null,
  };
}

const printItemProps = {
  description: { type: "string" },
  quantity: { type: "number", description: "Optional integer." },
  acquisitionState: { type: "string", enum: ["ON_HAND", "TO_PROCURE", "DROP_SHIP"], description: "Defaults TO_PROCURE." },
  packingStatus: { type: "string", enum: ["NEEDED", "IN_TRANSIT", "DELIVERED"], description: "Defaults NEEDED." },
  distributionMethod: { type: "string", description: "Optional." },
  distributionNotes: { type: "string", description: "Optional." },
  designerVendorId: { type: "string", description: "Optional vendor id." },
  designerContactId: { type: "string", description: "Optional contact id." },
  printerVendorId: { type: "string", description: "Optional vendor id." },
  printerContactId: { type: "string", description: "Optional contact id." },
  notes: { type: "string", description: "Optional." },
  sourceLocationId: { type: "string", description: "Optional storage location this item comes from. See `list_storage_locations`." },
} as const;

const ACQUISITION_STATES = ["ON_HAND", "TO_PROCURE", "DROP_SHIP"] as const;
const PACKING_STATUSES = ["NEEDED", "IN_TRANSIT", "DELIVERED"] as const;

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
    sourceLocationId: optionalString(args, "sourceLocationId") ?? null,
    containerLocationId: optionalString(args, "containerLocationId") ?? null,
    inventoryItemId: optionalString(args, "inventoryItemId") ?? null,
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
  sourceLocationId: { type: "string", description: "Optional storage location this item comes from. On a container line it means where that container sits for this event. See `list_storage_locations`." },
  inventoryItemId: { type: "string", description: "Optional provenance link to the durable inventory row this line was pulled from. Records origin only — it never decrements or reserves the inventory. See `list_inventory_items`." },
  containerLocationId: { type: "string", description: "Set when this line IS a container being shipped (a box, a pallet) rather than an item inside one. Must reference a CONTAINER location, and only one order per event may claim a given container. Container lines need no description or equipment." },
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
        roomId: { type: "string", description: "Optional staging room." },
        specificLocation: { type: "string", description: "Optional staging detail (e.g. 'Secretarial table')." },
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
          roomId: optionalString(args, "roomId") ?? null,
          specificLocation: optionalString(args, "specificLocation") ?? null,
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
    description: "Update name / notes / staging (roomId, specificLocation) on a print order. To change packingStatus use `update_print_order_packing_status` (it cascades to items).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        eventId: { type: "string" },
        name: { type: "string" },
        notes: { type: "string" },
        roomId: { type: "string", description: "Optional staging room (empty string clears)." },
        specificLocation: { type: "string", description: "Optional staging detail." },
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
          roomId: optionalString(args, "roomId") ?? null,
          specificLocation: optionalString(args, "specificLocation") ?? null,
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
    name: "update_print_order_packing_status",
    description: "Set or clear order-level packing status. When a concrete value is passed (NEEDED/IN_TRANSIT/DELIVERED) it cascades to every PrintItem on the order in the same transaction. Pass null to clear without cascade.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        eventId: { type: "string" },
        packingStatus: { type: ["string", "null"], enum: ["NEEDED", "IN_TRANSIT", "DELIVERED", null] },
      },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const eventId = requireString(args, "eventId");
      const raw = args["packingStatus"];
      const packingStatus =
        raw === null || raw === undefined ? null : (raw as PackingStatus);
      await updatePrintOrderPackingStatusCore(id, eventId, packingStatus, userId);
      return { ok: true };
    },
  },
  {
    name: "bulk_update_print_orders",
    description:
      "Update status / substatus / packing status / vendor (replace-all) / function link (skip-existing) on multiple print orders at once. Setting packingStatus to a concrete value cascades to items.",
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
        packingStatus: { type: "string", enum: ["NEEDED", "IN_TRANSIT", "DELIVERED"] },
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
      const packingStatus = optionalString(args, "packingStatus");
      if (packingStatus) updates.packingStatus = packingStatus as PackingStatus;
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
  {
    name: "update_print_item_acquisition_state",
    description: "Set the acquisition state on a single PrintItem (ON_HAND / TO_PROCURE / DROP_SHIP).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        printOrderId: { type: "string" },
        eventId: { type: "string" },
        acquisitionState: { type: "string", enum: ACQUISITION_STATES },
      },
      required: ["id", "printOrderId", "eventId", "acquisitionState"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const printOrderId = requireString(args, "printOrderId");
      const eventId = requireString(args, "eventId");
      const acquisitionState = requireString(args, "acquisitionState") as AcquisitionState;
      await updatePrintItemAcquisitionStateCore(id, printOrderId, eventId, acquisitionState, userId);
      return { ok: true };
    },
  },
  // SupplyOrder writes -----------------------------------------------------
  {
    name: "create_supply_order",
    description:
      "Create a supply order on an event. `roomId` (destination room) is optional — orders without a room/function/presentation surface as 'needs attention' on the overview. Provider is a single-party concept: pass either providerVendorId OR providerContactId (passing vendor clears contact). When both are omitted the event's default SUPPLY_ORDER vendor (if any) is auto-assigned. Auto-assigns default workflows. Optionally pin to a function and/or presentation at create.",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        name: { type: "string" },
        roomId: { type: "string", description: "Optional destination room id." },
        specificLocation: { type: "string", description: "Optional sub-location within the room." },
        notes: { type: "string" },
        providerVendorId: { type: "string" },
        providerContactId: { type: "string" },
        functionId: { type: "string", description: "Optional initial M:M function link." },
        presentationId: { type: "string", description: "Optional initial M:M presentation link." },
      },
      required: ["eventId", "name"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      createSupplyOrderCore(
        requireString(args, "eventId"),
        {
          name: requireString(args, "name"),
          roomId: optionalString(args, "roomId") ?? null,
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
    description: "Update name / room / specific location / notes / provider on a supply order. `roomId` is optional; pass an empty string to clear it.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        eventId: { type: "string" },
        name: { type: "string" },
        roomId: { type: "string", description: "Optional. Empty string clears the room." },
        specificLocation: { type: "string" },
        notes: { type: "string" },
        providerVendorId: { type: "string" },
        providerContactId: { type: "string" },
      },
      required: ["id", "eventId", "name"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      updateSupplyOrderCore(
        requireString(args, "id"),
        requireString(args, "eventId"),
        {
          name: requireString(args, "name"),
          roomId: optionalString(args, "roomId") ?? null,
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
    name: "bulk_set_supply_order_items_packing_status",
    description:
      "Set the same packing status on every SupplyOrderItem in a supply order, in a single transaction. Item-level status is the canonical state; there is no order-level packing field.",
    inputSchema: {
      type: "object",
      properties: {
        supplyOrderId: { type: "string" },
        eventId: { type: "string" },
        packingStatus: { type: "string", enum: PACKING_STATUSES },
      },
      required: ["supplyOrderId", "eventId", "packingStatus"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      await bulkSetSupplyOrderItemsPackingStatusCore(
        requireString(args, "supplyOrderId"),
        requireString(args, "eventId"),
        requireString(args, "packingStatus") as PackingStatus,
        userId,
      );
      return { ok: true };
    },
  },
  {
    name: "bulk_set_supply_order_items_acquisition_state",
    description:
      "Set the same acquisition state on every SupplyOrderItem in a supply order, in a single transaction (ON_HAND / TO_PROCURE / DROP_SHIP).",
    inputSchema: {
      type: "object",
      properties: {
        supplyOrderId: { type: "string" },
        eventId: { type: "string" },
        acquisitionState: { type: "string", enum: ACQUISITION_STATES },
      },
      required: ["supplyOrderId", "eventId", "acquisitionState"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      await bulkSetSupplyOrderItemsAcquisitionStateCore(
        requireString(args, "supplyOrderId"),
        requireString(args, "eventId"),
        requireString(args, "acquisitionState") as AcquisitionState,
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
  {
    name: "update_supply_order_item_acquisition_state",
    description: "Set the acquisition state on a single SupplyOrderItem (ON_HAND / TO_PROCURE / DROP_SHIP).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        supplyOrderId: { type: "string" },
        eventId: { type: "string" },
        acquisitionState: { type: "string", enum: ACQUISITION_STATES },
      },
      required: ["id", "supplyOrderId", "eventId", "acquisitionState"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const supplyOrderId = requireString(args, "supplyOrderId");
      const eventId = requireString(args, "eventId");
      const acquisitionState = requireString(args, "acquisitionState") as AcquisitionState;
      await updateSupplyOrderItemAcquisitionStateCore(id, supplyOrderId, eventId, acquisitionState, userId);
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
  // CateringOrder writes -----------------------------------------------------
  {
    name: "create_catering_order",
    description:
      "Create a catering order on an event. Optionally pin to a function. If `vendorId` is omitted, the event's default CATERING_ORDER vendor (if any) is auto-assigned. All deadline fields accept ISO 8601 datetimes. Auto-assigns default workflows.",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        name: { type: "string" },
        functionId: { type: "string", description: "Optional 1:1 function link." },
        serviceStyle: { type: "string", description: "e.g. PLATED, BUFFET, FAMILY_STYLE." },
        expectedCount: { type: "number" },
        confirmedCount: { type: "number" },
        guaranteeCount: { type: "number" },
        staffingNotes: { type: "string" },
        rentalMinimum: { type: "number" },
        fbMinimum: { type: "number" },
        depositDeadline: { type: "string", description: "ISO 8601 date/time." },
        guaranteeDeadline: { type: "string" },
        paymentDeadline: { type: "string" },
        cancellationTerms: { type: "string" },
        dietaryNotes: { type: "string" },
        notes: { type: "string" },
        vendorId: { type: "string" },
      },
      required: ["eventId", "name"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const parsed: CreateCateringOrderArgs = {
        name: requireString(args, "name"),
        functionId: optionalString(args, "functionId") ?? null,
        serviceStyle: optionalString(args, "serviceStyle") ?? null,
        expectedCount: optionalInt(args, "expectedCount"),
        confirmedCount: optionalInt(args, "confirmedCount"),
        guaranteeCount: optionalInt(args, "guaranteeCount"),
        staffingNotes: optionalString(args, "staffingNotes") ?? null,
        rentalMinimum:
          typeof args.rentalMinimum === "number" && Number.isFinite(args.rentalMinimum)
            ? args.rentalMinimum
            : null,
        fbMinimum:
          typeof args.fbMinimum === "number" && Number.isFinite(args.fbMinimum)
            ? args.fbMinimum
            : null,
        depositDeadline: parseOptionalDate(args, "depositDeadline"),
        guaranteeDeadline: parseOptionalDate(args, "guaranteeDeadline"),
        paymentDeadline: parseOptionalDate(args, "paymentDeadline"),
        cancellationTerms: optionalString(args, "cancellationTerms") ?? null,
        dietaryNotes: optionalString(args, "dietaryNotes") ?? null,
        notes: optionalString(args, "notes") ?? null,
        vendorId: optionalString(args, "vendorId") ?? null,
      };
      return createCateringOrderCore(requireString(args, "eventId"), parsed, userId);
    },
  },
  {
    name: "update_catering_order",
    description:
      "Partial update on a catering order. Pass only the fields you want to change. To clear a nullable field, pass an empty string (deadline fields) or 0 / explicit null. The UI splits this across four tab-scoped wrappers; MCP exposes the unified shape.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        eventId: { type: "string" },
        name: { type: "string" },
        serviceStyle: { type: "string" },
        expectedCount: { type: "number" },
        confirmedCount: { type: "number" },
        guaranteeCount: { type: "number" },
        staffingNotes: { type: "string" },
        rentalMinimum: { type: "number" },
        fbMinimum: { type: "number" },
        depositDeadline: { type: "string", description: "ISO 8601, empty string clears." },
        guaranteeDeadline: { type: "string" },
        paymentDeadline: { type: "string" },
        cancellationTerms: { type: "string" },
        dietaryNotes: { type: "string" },
        notes: { type: "string" },
      },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const updates: UpdateCateringOrderArgs = {};
      if ("name" in args) updates.name = requireString(args, "name");
      if ("serviceStyle" in args) updates.serviceStyle = optionalString(args, "serviceStyle") ?? null;
      if ("expectedCount" in args) updates.expectedCount = optionalInt(args, "expectedCount");
      if ("confirmedCount" in args) updates.confirmedCount = optionalInt(args, "confirmedCount");
      if ("guaranteeCount" in args) updates.guaranteeCount = optionalInt(args, "guaranteeCount");
      if ("staffingNotes" in args) updates.staffingNotes = optionalString(args, "staffingNotes") ?? null;
      if ("rentalMinimum" in args)
        updates.rentalMinimum =
          typeof args.rentalMinimum === "number" && Number.isFinite(args.rentalMinimum)
            ? args.rentalMinimum
            : null;
      if ("fbMinimum" in args)
        updates.fbMinimum =
          typeof args.fbMinimum === "number" && Number.isFinite(args.fbMinimum)
            ? args.fbMinimum
            : null;
      if ("depositDeadline" in args) updates.depositDeadline = parseOptionalDate(args, "depositDeadline");
      if ("guaranteeDeadline" in args) updates.guaranteeDeadline = parseOptionalDate(args, "guaranteeDeadline");
      if ("paymentDeadline" in args) updates.paymentDeadline = parseOptionalDate(args, "paymentDeadline");
      if ("cancellationTerms" in args) updates.cancellationTerms = optionalString(args, "cancellationTerms") ?? null;
      if ("dietaryNotes" in args) updates.dietaryNotes = optionalString(args, "dietaryNotes") ?? null;
      if ("notes" in args) updates.notes = optionalString(args, "notes") ?? null;
      return updateCateringOrderCore(
        requireString(args, "id"),
        requireString(args, "eventId"),
        updates,
        userId,
      );
    },
  },
  {
    name: "delete_catering_order",
    description: "Delete a catering order by id. Cascades per schema.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" } },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const eventId = requireString(args, "eventId");
      await deleteCateringOrderCore(id, eventId, userId);
      return { id, deleted: true };
    },
  },
  {
    name: "delete_catering_orders",
    description: "Bulk-delete multiple catering orders from an event.",
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
      deleteCateringOrdersCore(
        optionalStringArray(args, "ids"),
        requireString(args, "eventId"),
        userId,
      ),
  },
  {
    name: "bulk_update_catering_orders",
    description: "Update status / substatus / vendor (replace-all) on multiple catering orders at once.",
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
      const updates: BulkCateringOrderUpdates = {};
      const status = optionalString(args, "status");
      if (status) updates.status = status as EntityStatus;
      if ("substatus" in args) updates.substatus = optionalString(args, "substatus") ?? null;
      const vendorId = optionalString(args, "vendorId");
      if (vendorId) updates.vendorId = vendorId;
      await bulkUpdateCateringOrdersCore(ids, eventId, updates, userId);
      return { ok: true };
    },
  },
  // CateringOrder function link (1:1 FK) ----------------------------------
  {
    name: "link_catering_order_to_function",
    description: "Link a catering order to a function (1:1 via CateringOrder.functionId — replaces any prior link).",
    inputSchema: {
      type: "object",
      properties: {
        cateringOrderId: { type: "string" },
        functionId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["cateringOrderId", "functionId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      linkCateringOrderToFunctionCore(
        requireString(args, "cateringOrderId"),
        requireString(args, "functionId"),
        requireString(args, "eventId"),
        userId,
      ),
  },
  {
    name: "unlink_catering_order_from_function",
    description: "Clear the catering order's function link.",
    inputSchema: {
      type: "object",
      properties: {
        cateringOrderId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["cateringOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      unlinkCateringOrderFromFunctionCore(
        requireString(args, "cateringOrderId"),
        requireString(args, "eventId"),
        userId,
      ),
  },
  // TimelineItem ----------------------------------
  {
    name: "create_timeline_item",
    description:
      "Add a TimelineItem to a catering order. startTime and endTime are event-local (YYYY-MM-DDTHH:MM) and converted to UTC via the event timezone. sortOrder is auto-appended.",
    inputSchema: {
      type: "object",
      properties: {
        cateringOrderId: { type: "string" },
        eventId: { type: "string" },
        label: { type: "string" },
        startTime: { type: "string", description: "Event-local YYYY-MM-DDTHH:MM (no offset)." },
        endTime: { type: "string", description: "Optional. Event-local YYYY-MM-DDTHH:MM." },
        notes: { type: "string" },
      },
      required: ["cateringOrderId", "eventId", "label", "startTime"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const parsed: TimelineItemWriteArgs = {
        label: requireString(args, "label"),
        startTime: requireString(args, "startTime"),
        endTime: optionalString(args, "endTime") ?? null,
        notes: optionalString(args, "notes") ?? null,
      };
      return createTimelineItemCore(
        requireString(args, "cateringOrderId"),
        requireString(args, "eventId"),
        parsed,
        userId,
      );
    },
  },
  {
    name: "update_timeline_item",
    description: "Replace all writable fields on a TimelineItem.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        cateringOrderId: { type: "string" },
        eventId: { type: "string" },
        label: { type: "string" },
        startTime: { type: "string" },
        endTime: { type: "string" },
        notes: { type: "string" },
      },
      required: ["id", "cateringOrderId", "eventId", "label", "startTime"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const parsed: TimelineItemWriteArgs = {
        label: requireString(args, "label"),
        startTime: requireString(args, "startTime"),
        endTime: optionalString(args, "endTime") ?? null,
        notes: optionalString(args, "notes") ?? null,
      };
      return updateTimelineItemCore(
        requireString(args, "id"),
        requireString(args, "cateringOrderId"),
        requireString(args, "eventId"),
        parsed,
        userId,
      );
    },
  },
  {
    name: "delete_timeline_item",
    description: "Delete a TimelineItem from a catering order.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        cateringOrderId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["id", "cateringOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const cateringOrderId = requireString(args, "cateringOrderId");
      const eventId = requireString(args, "eventId");
      await deleteTimelineItemCore(id, cateringOrderId, eventId, userId);
      return { id, deleted: true };
    },
  },
  // EquipmentItem (catering-scoped) ----------------------------------
  {
    name: "create_catering_equipment_item",
    description: "Add an EquipmentItem to a catering order. When `equipmentId` is set, the canonical item name is resolved server-side.",
    inputSchema: {
      type: "object",
      properties: {
        cateringOrderId: { type: "string" },
        eventId: { type: "string" },
        ...setupEquipmentItemProps,
      },
      required: ["cateringOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const parsed: CateringEquipmentItemWriteArgs = {
        equipmentId: optionalString(args, "equipmentId") ?? null,
        item: optionalString(args, "item") ?? "",
        quantity: optionalInt(args, "quantity"),
        providerVendorId: optionalString(args, "providerVendorId") ?? null,
        providerContactId: optionalString(args, "providerContactId") ?? null,
        operatorVendorId: optionalString(args, "operatorVendorId") ?? null,
        operatorContactId: optionalString(args, "operatorContactId") ?? null,
        notes: optionalString(args, "notes") ?? null,
      };
      return createCateringEquipmentItemCore(
        requireString(args, "cateringOrderId"),
        requireString(args, "eventId"),
        parsed,
        userId,
      );
    },
  },
  {
    name: "update_catering_equipment_item",
    description: "Replace all writable fields on a catering-order EquipmentItem.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        cateringOrderId: { type: "string" },
        eventId: { type: "string" },
        ...setupEquipmentItemProps,
      },
      required: ["id", "cateringOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const parsed: CateringEquipmentItemWriteArgs = {
        equipmentId: optionalString(args, "equipmentId") ?? null,
        item: optionalString(args, "item") ?? "",
        quantity: optionalInt(args, "quantity"),
        providerVendorId: optionalString(args, "providerVendorId") ?? null,
        providerContactId: optionalString(args, "providerContactId") ?? null,
        operatorVendorId: optionalString(args, "operatorVendorId") ?? null,
        operatorContactId: optionalString(args, "operatorContactId") ?? null,
        notes: optionalString(args, "notes") ?? null,
      };
      return updateCateringEquipmentItemCore(
        requireString(args, "id"),
        requireString(args, "cateringOrderId"),
        requireString(args, "eventId"),
        parsed,
        userId,
      );
    },
  },
  {
    name: "delete_catering_equipment_item",
    description: "Delete a catering-order EquipmentItem.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        cateringOrderId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["id", "cateringOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const cateringOrderId = requireString(args, "cateringOrderId");
      const eventId = requireString(args, "eventId");
      await deleteCateringEquipmentItemCore(id, cateringOrderId, eventId, userId);
      return { id, deleted: true };
    },
  },
  // CateringOrderLineItem ----------------------------------
  {
    name: "create_catering_line_item",
    description: "Add a billable LineItem to a catering order. sortOrder is auto-appended.",
    inputSchema: {
      type: "object",
      properties: {
        cateringOrderId: { type: "string" },
        eventId: { type: "string" },
        description: { type: "string" },
        unitType: { type: "string" },
        unitPrice: { type: "number" },
        quantity: { type: "number" },
        notes: { type: "string" },
      },
      required: ["cateringOrderId", "eventId", "description"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const parsed: LineItemWriteArgs = {
        description: requireString(args, "description"),
        unitType: optionalString(args, "unitType") ?? null,
        unitPrice:
          typeof args.unitPrice === "number" && Number.isFinite(args.unitPrice)
            ? args.unitPrice
            : null,
        quantity: optionalInt(args, "quantity"),
        notes: optionalString(args, "notes") ?? null,
      };
      return createCateringOrderLineItemCore(
        requireString(args, "cateringOrderId"),
        requireString(args, "eventId"),
        parsed,
        userId,
      );
    },
  },
  {
    name: "update_catering_line_item",
    description: "Replace all writable fields on a CateringOrderLineItem.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        cateringOrderId: { type: "string" },
        eventId: { type: "string" },
        description: { type: "string" },
        unitType: { type: "string" },
        unitPrice: { type: "number" },
        quantity: { type: "number" },
        notes: { type: "string" },
      },
      required: ["id", "cateringOrderId", "eventId", "description"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const parsed: LineItemWriteArgs = {
        description: requireString(args, "description"),
        unitType: optionalString(args, "unitType") ?? null,
        unitPrice:
          typeof args.unitPrice === "number" && Number.isFinite(args.unitPrice)
            ? args.unitPrice
            : null,
        quantity: optionalInt(args, "quantity"),
        notes: optionalString(args, "notes") ?? null,
      };
      return updateCateringOrderLineItemCore(
        requireString(args, "id"),
        requireString(args, "cateringOrderId"),
        requireString(args, "eventId"),
        parsed,
        userId,
      );
    },
  },
  {
    name: "delete_catering_line_item",
    description: "Delete a CateringOrderLineItem.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        cateringOrderId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["id", "cateringOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const cateringOrderId = requireString(args, "cateringOrderId");
      const eventId = requireString(args, "eventId");
      await deleteCateringOrderLineItemCore(id, cateringOrderId, eventId, userId);
      return { id, deleted: true };
    },
  },
  // CateringOrderMenuSection ----------------------------------
  {
    name: "create_catering_menu_section",
    description: "Add a MenuSection to a catering order. menuContent is rich-text (HTML) from the RichTextEditor.",
    inputSchema: {
      type: "object",
      properties: {
        cateringOrderId: { type: "string" },
        eventId: { type: "string" },
        responsiblePartyVendorId: { type: "string" },
        menuContent: { type: "string", description: "HTML body (the catering UI uses a tiptap editor)." },
        notes: { type: "string" },
      },
      required: ["cateringOrderId", "eventId", "menuContent"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const parsed: MenuSectionWriteArgs = {
        responsiblePartyVendorId: optionalString(args, "responsiblePartyVendorId") ?? null,
        menuContent: requireString(args, "menuContent"),
        notes: optionalString(args, "notes") ?? null,
      };
      return createCateringOrderMenuSectionCore(
        requireString(args, "cateringOrderId"),
        requireString(args, "eventId"),
        parsed,
        userId,
      );
    },
  },
  {
    name: "update_catering_menu_section",
    description: "Replace all writable fields on a CateringOrderMenuSection.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        cateringOrderId: { type: "string" },
        eventId: { type: "string" },
        responsiblePartyVendorId: { type: "string" },
        menuContent: { type: "string" },
        notes: { type: "string" },
      },
      required: ["id", "cateringOrderId", "eventId", "menuContent"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const parsed: MenuSectionWriteArgs = {
        responsiblePartyVendorId: optionalString(args, "responsiblePartyVendorId") ?? null,
        menuContent: requireString(args, "menuContent"),
        notes: optionalString(args, "notes") ?? null,
      };
      return updateCateringOrderMenuSectionCore(
        requireString(args, "id"),
        requireString(args, "cateringOrderId"),
        requireString(args, "eventId"),
        parsed,
        userId,
      );
    },
  },
  {
    name: "delete_catering_menu_section",
    description: "Delete a CateringOrderMenuSection.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        cateringOrderId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["id", "cateringOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const cateringOrderId = requireString(args, "cateringOrderId");
      const eventId = requireString(args, "eventId");
      await deleteCateringOrderMenuSectionCore(id, cateringOrderId, eventId, userId);
      return { id, deleted: true };
    },
  },
  // CateringOrderServiceLocation ----------------------------------
  {
    name: "create_catering_service_location",
    description: "Add an additional service location to a catering order (e.g. service at a separate function).",
    inputSchema: {
      type: "object",
      properties: {
        cateringOrderId: { type: "string" },
        eventId: { type: "string" },
        name: { type: "string" },
        functionId: { type: "string", description: "Optional function this location services." },
        expectedCount: { type: "number" },
        notes: { type: "string" },
      },
      required: ["cateringOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const parsed: ServiceLocationWriteArgs = {
        name: optionalString(args, "name") ?? null,
        functionId: optionalString(args, "functionId") ?? null,
        expectedCount: optionalInt(args, "expectedCount"),
        notes: optionalString(args, "notes") ?? null,
      };
      return createCateringOrderServiceLocationCore(
        requireString(args, "cateringOrderId"),
        requireString(args, "eventId"),
        parsed,
        userId,
      );
    },
  },
  {
    name: "update_catering_service_location",
    description: "Replace all writable fields on a CateringOrderServiceLocation.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        cateringOrderId: { type: "string" },
        eventId: { type: "string" },
        name: { type: "string" },
        functionId: { type: "string" },
        expectedCount: { type: "number" },
        notes: { type: "string" },
      },
      required: ["id", "cateringOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const parsed: ServiceLocationWriteArgs = {
        name: optionalString(args, "name") ?? null,
        functionId: optionalString(args, "functionId") ?? null,
        expectedCount: optionalInt(args, "expectedCount"),
        notes: optionalString(args, "notes") ?? null,
      };
      return updateCateringOrderServiceLocationCore(
        requireString(args, "id"),
        requireString(args, "cateringOrderId"),
        requireString(args, "eventId"),
        parsed,
        userId,
      );
    },
  },
  {
    name: "delete_catering_service_location",
    description: "Delete a CateringOrderServiceLocation.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        cateringOrderId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["id", "cateringOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const cateringOrderId = requireString(args, "cateringOrderId");
      const eventId = requireString(args, "eventId");
      await deleteCateringOrderServiceLocationCore(id, cateringOrderId, eventId, userId);
      return { id, deleted: true };
    },
  },
  // CateringOrderContact ----------------------------------
  {
    name: "add_catering_order_contact",
    description: "Link an existing contact to a catering order with an optional role.",
    inputSchema: {
      type: "object",
      properties: {
        cateringOrderId: { type: "string" },
        eventId: { type: "string" },
        contactId: { type: "string" },
        role: { type: "string" },
      },
      required: ["cateringOrderId", "eventId", "contactId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      addCateringOrderContactCore(
        requireString(args, "cateringOrderId"),
        requireString(args, "eventId"),
        requireString(args, "contactId"),
        optionalString(args, "role") ?? null,
        userId,
      ),
  },
  {
    name: "update_catering_order_contact",
    description: "Update the role on a CateringOrderContact link.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        cateringOrderId: { type: "string" },
        eventId: { type: "string" },
        role: { type: "string" },
      },
      required: ["id", "cateringOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      updateCateringOrderContactCore(
        requireString(args, "id"),
        requireString(args, "cateringOrderId"),
        requireString(args, "eventId"),
        optionalString(args, "role") ?? null,
        userId,
      ),
  },
  {
    name: "remove_catering_order_contact",
    description: "Remove a CateringOrderContact link.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        cateringOrderId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["id", "cateringOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const cateringOrderId = requireString(args, "cateringOrderId");
      const eventId = requireString(args, "eventId");
      await removeCateringOrderContactCore(id, cateringOrderId, eventId, userId);
      return { id, removed: true };
    },
  },
  {
    name: "create_and_add_catering_order_contact",
    description:
      "Create a new contact and immediately link it to a catering order. Use when the contact doesn't yet exist.",
    inputSchema: {
      type: "object",
      properties: {
        cateringOrderId: { type: "string" },
        eventId: { type: "string" },
        firstName: { type: "string" },
        lastName: { type: "string" },
        email: { type: "string" },
        organization: { type: "string" },
        role: { type: "string" },
      },
      required: ["cateringOrderId", "eventId", "firstName", "lastName"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      createAndAddCateringOrderContactCore(
        {
          cateringOrderId: requireString(args, "cateringOrderId"),
          eventId: requireString(args, "eventId"),
          firstName: requireString(args, "firstName"),
          lastName: requireString(args, "lastName"),
          email: optionalString(args, "email") ?? null,
          organization: optionalString(args, "organization") ?? null,
          role: optionalString(args, "role") ?? null,
        },
        userId,
      ),
  },
  // AVOrder writes ----------------------------------
  {
    name: "create_av_order",
    description:
      "Create an AV order on an event. Auto-creates an AudioSection (with a default InputGroup) and VideoSection so the order's tabs exist immediately. Optionally pins to a function and/or presentation. If `vendorId` is omitted, the event's default AV_ORDER vendor (if any) is auto-assigned. Auto-assigns default workflows.",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        name: { type: "string" },
        notes: { type: "string" },
        functionId: { type: "string" },
        presentationId: { type: "string" },
        vendorId: { type: "string" },
      },
      required: ["eventId", "name"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      createAVOrderCore(
        requireString(args, "eventId"),
        {
          name: requireString(args, "name"),
          notes: optionalString(args, "notes") ?? null,
          functionId: optionalString(args, "functionId") ?? null,
          presentationId: optionalString(args, "presentationId") ?? null,
          vendorId: optionalString(args, "vendorId") ?? null,
        },
        userId,
      ),
  },
  {
    name: "update_av_order",
    description: "Update name / notes on an AV order.",
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
      updateAVOrderCore(
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
    name: "delete_av_order",
    description: "Delete an AV order by id. Cascades per schema (audio section, video section, all items, links).",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, eventId: { type: "string" } },
      required: ["id", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const eventId = requireString(args, "eventId");
      await deleteAVOrderCore(id, eventId, userId);
      return { id, deleted: true };
    },
  },
  {
    name: "delete_av_orders",
    description: "Bulk-delete multiple AV orders from an event.",
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
      deleteAVOrdersCore(
        optionalStringArray(args, "ids"),
        requireString(args, "eventId"),
        userId,
      ),
  },
  {
    name: "bulk_update_av_orders",
    description: "Update status / substatus / vendor (replace-all) on multiple AV orders at once.",
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
      const updates: BulkAVOrderUpdates = {};
      const status = optionalString(args, "status");
      if (status) updates.status = status as EntityStatus;
      if ("substatus" in args) updates.substatus = optionalString(args, "substatus") ?? null;
      const vendorId = optionalString(args, "vendorId");
      if (vendorId) updates.vendorId = vendorId;
      await bulkUpdateAVOrdersCore(ids, eventId, updates, userId);
      return { ok: true };
    },
  },
  // AVOrder links ----------------------------------
  {
    name: "link_av_order_to_function",
    description: "Link an AV order to a function (M:M via AVOrderFunction, upsert).",
    inputSchema: {
      type: "object",
      properties: {
        avOrderId: { type: "string" },
        functionId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["avOrderId", "functionId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      linkAVOrderToFunctionCore(
        requireString(args, "avOrderId"),
        requireString(args, "functionId"),
        requireString(args, "eventId"),
        userId,
      ),
  },
  {
    name: "unlink_av_order_from_function",
    description: "Remove an AV order's link to a function.",
    inputSchema: {
      type: "object",
      properties: {
        avOrderId: { type: "string" },
        functionId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["avOrderId", "functionId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      unlinkAVOrderFromFunctionCore(
        requireString(args, "avOrderId"),
        requireString(args, "functionId"),
        requireString(args, "eventId"),
        userId,
      ),
  },
  {
    name: "link_av_order_to_presentation",
    description: "Link an AV order to a presentation (M:M via AVOrderPresentation, upsert).",
    inputSchema: {
      type: "object",
      properties: {
        avOrderId: { type: "string" },
        presentationId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["avOrderId", "presentationId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      linkAVOrderToPresentationCore(
        requireString(args, "avOrderId"),
        requireString(args, "presentationId"),
        requireString(args, "eventId"),
        userId,
      ),
  },
  {
    name: "unlink_av_order_from_presentation",
    description: "Remove an AV order's link to a presentation.",
    inputSchema: {
      type: "object",
      properties: {
        avOrderId: { type: "string" },
        presentationId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["avOrderId", "presentationId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      unlinkAVOrderFromPresentationCore(
        requireString(args, "avOrderId"),
        requireString(args, "presentationId"),
        requireString(args, "eventId"),
        userId,
      ),
  },
  // AudioSection ----------------------------------
  {
    name: "update_audio_section",
    description: "Update the notes field on an AudioSection.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        avOrderId: { type: "string" },
        eventId: { type: "string" },
        notes: { type: "string" },
      },
      required: ["id", "avOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      updateAudioSectionCore(
        requireString(args, "id"),
        requireString(args, "avOrderId"),
        requireString(args, "eventId"),
        optionalString(args, "notes") ?? null,
        userId,
      ),
  },
  // InputGroup ----------------------------------
  {
    name: "create_input_group",
    description: "Add an InputGroup under an AudioSection. Defaults name to \"Default\". sortOrder is auto-appended.",
    inputSchema: {
      type: "object",
      properties: {
        audioSectionId: { type: "string" },
        avOrderId: { type: "string" },
        eventId: { type: "string" },
        name: { type: "string" },
        notes: { type: "string" },
      },
      required: ["audioSectionId", "avOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      createInputGroupCore(
        requireString(args, "audioSectionId"),
        requireString(args, "avOrderId"),
        requireString(args, "eventId"),
        {
          name: optionalString(args, "name") ?? "Default",
          notes: optionalString(args, "notes") ?? null,
        },
        userId,
      ),
  },
  {
    name: "update_input_group",
    description: "Replace all writable fields on an InputGroup.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        avOrderId: { type: "string" },
        eventId: { type: "string" },
        name: { type: "string" },
        providerVendorId: { type: "string" },
        providerContactId: { type: "string" },
        operatorVendorId: { type: "string" },
        operatorContactId: { type: "string" },
        notes: { type: "string" },
      },
      required: ["id", "avOrderId", "eventId", "name"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      updateInputGroupCore(
        requireString(args, "id"),
        requireString(args, "avOrderId"),
        requireString(args, "eventId"),
        {
          name: requireString(args, "name"),
          providerVendorId: optionalString(args, "providerVendorId") ?? null,
          providerContactId: optionalString(args, "providerContactId") ?? null,
          operatorVendorId: optionalString(args, "operatorVendorId") ?? null,
          operatorContactId: optionalString(args, "operatorContactId") ?? null,
          notes: optionalString(args, "notes") ?? null,
        },
        userId,
      ),
  },
  {
    name: "delete_input_group",
    description: "Delete an InputGroup (cascades to its InputItems).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        avOrderId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["id", "avOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const avOrderId = requireString(args, "avOrderId");
      const eventId = requireString(args, "eventId");
      await deleteInputGroupCore(id, avOrderId, eventId, userId);
      return { id, deleted: true };
    },
  },
  // InputItem ----------------------------------
  {
    name: "create_input_item",
    description: "Add an InputItem to an InputGroup.",
    inputSchema: {
      type: "object",
      properties: {
        inputGroupId: { type: "string" },
        avOrderId: { type: "string" },
        eventId: { type: "string" },
        description: { type: "string" },
        quantity: { type: "number", description: "Defaults 1." },
        equipmentId: { type: "string" },
        providerVendorId: { type: "string" },
        providerContactId: { type: "string" },
        operatorVendorId: { type: "string" },
        operatorContactId: { type: "string" },
        notes: { type: "string" },
      },
      required: ["inputGroupId", "avOrderId", "eventId", "description"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const parsed: InputItemWriteArgs = {
        description: requireString(args, "description"),
        quantity: optionalInt(args, "quantity") ?? 1,
        equipmentId: optionalString(args, "equipmentId") ?? null,
        providerVendorId: optionalString(args, "providerVendorId") ?? null,
        providerContactId: optionalString(args, "providerContactId") ?? null,
        operatorVendorId: optionalString(args, "operatorVendorId") ?? null,
        operatorContactId: optionalString(args, "operatorContactId") ?? null,
        notes: optionalString(args, "notes") ?? null,
      };
      return createInputItemCore(
        requireString(args, "inputGroupId"),
        requireString(args, "avOrderId"),
        requireString(args, "eventId"),
        parsed,
        userId,
      );
    },
  },
  {
    name: "update_input_item",
    description: "Replace all writable fields on an InputItem.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        avOrderId: { type: "string" },
        eventId: { type: "string" },
        description: { type: "string" },
        quantity: { type: "number" },
        equipmentId: { type: "string" },
        providerVendorId: { type: "string" },
        providerContactId: { type: "string" },
        operatorVendorId: { type: "string" },
        operatorContactId: { type: "string" },
        notes: { type: "string" },
      },
      required: ["id", "avOrderId", "eventId", "description"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const parsed: InputItemWriteArgs = {
        description: requireString(args, "description"),
        quantity: optionalInt(args, "quantity") ?? 1,
        equipmentId: optionalString(args, "equipmentId") ?? null,
        providerVendorId: optionalString(args, "providerVendorId") ?? null,
        providerContactId: optionalString(args, "providerContactId") ?? null,
        operatorVendorId: optionalString(args, "operatorVendorId") ?? null,
        operatorContactId: optionalString(args, "operatorContactId") ?? null,
        notes: optionalString(args, "notes") ?? null,
      };
      return updateInputItemCore(
        requireString(args, "id"),
        requireString(args, "avOrderId"),
        requireString(args, "eventId"),
        parsed,
        userId,
      );
    },
  },
  {
    name: "delete_input_item",
    description: "Delete an InputItem.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        avOrderId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["id", "avOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const avOrderId = requireString(args, "avOrderId");
      const eventId = requireString(args, "eventId");
      await deleteInputItemCore(id, avOrderId, eventId, userId);
      return { id, deleted: true };
    },
  },
  // MonitorMix ----------------------------------
  {
    name: "create_monitor_mix",
    description: "Add a MonitorMix under an AudioSection.",
    inputSchema: {
      type: "object",
      properties: {
        audioSectionId: { type: "string" },
        avOrderId: { type: "string" },
        eventId: { type: "string" },
        description: { type: "string" },
        equipmentId: { type: "string" },
        providerVendorId: { type: "string" },
        providerContactId: { type: "string" },
        operatorVendorId: { type: "string" },
        operatorContactId: { type: "string" },
        notes: { type: "string" },
      },
      required: ["audioSectionId", "avOrderId", "eventId", "description"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const parsed: MonitorMixWriteArgs = {
        description: requireString(args, "description"),
        equipmentId: optionalString(args, "equipmentId") ?? null,
        providerVendorId: optionalString(args, "providerVendorId") ?? null,
        providerContactId: optionalString(args, "providerContactId") ?? null,
        operatorVendorId: optionalString(args, "operatorVendorId") ?? null,
        operatorContactId: optionalString(args, "operatorContactId") ?? null,
        notes: optionalString(args, "notes") ?? null,
      };
      return createMonitorMixCore(
        requireString(args, "audioSectionId"),
        requireString(args, "avOrderId"),
        requireString(args, "eventId"),
        parsed,
        userId,
      );
    },
  },
  {
    name: "update_monitor_mix",
    description: "Replace all writable fields on a MonitorMix.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        avOrderId: { type: "string" },
        eventId: { type: "string" },
        description: { type: "string" },
        equipmentId: { type: "string" },
        providerVendorId: { type: "string" },
        providerContactId: { type: "string" },
        operatorVendorId: { type: "string" },
        operatorContactId: { type: "string" },
        notes: { type: "string" },
      },
      required: ["id", "avOrderId", "eventId", "description"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const parsed: MonitorMixWriteArgs = {
        description: requireString(args, "description"),
        equipmentId: optionalString(args, "equipmentId") ?? null,
        providerVendorId: optionalString(args, "providerVendorId") ?? null,
        providerContactId: optionalString(args, "providerContactId") ?? null,
        operatorVendorId: optionalString(args, "operatorVendorId") ?? null,
        operatorContactId: optionalString(args, "operatorContactId") ?? null,
        notes: optionalString(args, "notes") ?? null,
      };
      return updateMonitorMixCore(
        requireString(args, "id"),
        requireString(args, "avOrderId"),
        requireString(args, "eventId"),
        parsed,
        userId,
      );
    },
  },
  {
    name: "delete_monitor_mix",
    description: "Delete a MonitorMix (cascades to its MonitorOutputs).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        avOrderId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["id", "avOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const avOrderId = requireString(args, "avOrderId");
      const eventId = requireString(args, "eventId");
      await deleteMonitorMixCore(id, avOrderId, eventId, userId);
      return { id, deleted: true };
    },
  },
  // MonitorOutput ----------------------------------
  {
    name: "create_monitor_output",
    description: "Add a MonitorOutput under a MonitorMix.",
    inputSchema: {
      type: "object",
      properties: {
        monitorMixId: { type: "string" },
        avOrderId: { type: "string" },
        eventId: { type: "string" },
        equipmentId: { type: "string" },
        quantity: { type: "number", description: "Defaults 1." },
        providerVendorId: { type: "string" },
        providerContactId: { type: "string" },
        operatorVendorId: { type: "string" },
        operatorContactId: { type: "string" },
        notes: { type: "string" },
      },
      required: ["monitorMixId", "avOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const parsed: MonitorOutputWriteArgs = {
        equipmentId: optionalString(args, "equipmentId") ?? null,
        quantity: optionalInt(args, "quantity") ?? 1,
        providerVendorId: optionalString(args, "providerVendorId") ?? null,
        providerContactId: optionalString(args, "providerContactId") ?? null,
        operatorVendorId: optionalString(args, "operatorVendorId") ?? null,
        operatorContactId: optionalString(args, "operatorContactId") ?? null,
        notes: optionalString(args, "notes") ?? null,
      };
      return createMonitorOutputCore(
        requireString(args, "monitorMixId"),
        requireString(args, "avOrderId"),
        requireString(args, "eventId"),
        parsed,
        userId,
      );
    },
  },
  {
    name: "update_monitor_output",
    description: "Replace all writable fields on a MonitorOutput.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        avOrderId: { type: "string" },
        eventId: { type: "string" },
        equipmentId: { type: "string" },
        quantity: { type: "number" },
        providerVendorId: { type: "string" },
        providerContactId: { type: "string" },
        operatorVendorId: { type: "string" },
        operatorContactId: { type: "string" },
        notes: { type: "string" },
      },
      required: ["id", "avOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const parsed: MonitorOutputWriteArgs = {
        equipmentId: optionalString(args, "equipmentId") ?? null,
        quantity: optionalInt(args, "quantity") ?? 1,
        providerVendorId: optionalString(args, "providerVendorId") ?? null,
        providerContactId: optionalString(args, "providerContactId") ?? null,
        operatorVendorId: optionalString(args, "operatorVendorId") ?? null,
        operatorContactId: optionalString(args, "operatorContactId") ?? null,
        notes: optionalString(args, "notes") ?? null,
      };
      return updateMonitorOutputCore(
        requireString(args, "id"),
        requireString(args, "avOrderId"),
        requireString(args, "eventId"),
        parsed,
        userId,
      );
    },
  },
  {
    name: "delete_monitor_output",
    description: "Delete a MonitorOutput.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        avOrderId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["id", "avOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const avOrderId = requireString(args, "avOrderId");
      const eventId = requireString(args, "eventId");
      await deleteMonitorOutputCore(id, avOrderId, eventId, userId);
      return { id, deleted: true };
    },
  },
  // VideoSection ----------------------------------
  {
    name: "update_video_section",
    description: "Update the notes field on a VideoSection.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        avOrderId: { type: "string" },
        eventId: { type: "string" },
        notes: { type: "string" },
      },
      required: ["id", "avOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      updateVideoSectionCore(
        requireString(args, "id"),
        requireString(args, "avOrderId"),
        requireString(args, "eventId"),
        optionalString(args, "notes") ?? null,
        userId,
      ),
  },
  // VideoSection EquipmentItem ----------------------------------
  {
    name: "create_video_equipment_item",
    description: "Add an EquipmentItem to a VideoSection. When `equipmentId` is set, the canonical item name is resolved server-side.",
    inputSchema: {
      type: "object",
      properties: {
        videoSectionId: { type: "string" },
        avOrderId: { type: "string" },
        eventId: { type: "string" },
        ...setupEquipmentItemProps,
      },
      required: ["videoSectionId", "avOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const parsed: AVEquipmentItemWriteArgs = {
        equipmentId: optionalString(args, "equipmentId") ?? null,
        item: optionalString(args, "item") ?? "",
        quantity: optionalInt(args, "quantity"),
        providerVendorId: optionalString(args, "providerVendorId") ?? null,
        providerContactId: optionalString(args, "providerContactId") ?? null,
        operatorVendorId: optionalString(args, "operatorVendorId") ?? null,
        operatorContactId: optionalString(args, "operatorContactId") ?? null,
        notes: optionalString(args, "notes") ?? null,
      };
      return createVideoEquipmentItemCore(
        requireString(args, "videoSectionId"),
        requireString(args, "avOrderId"),
        requireString(args, "eventId"),
        parsed,
        userId,
      );
    },
  },
  {
    name: "update_video_equipment_item",
    description: "Replace all writable fields on a video-section EquipmentItem.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        avOrderId: { type: "string" },
        eventId: { type: "string" },
        ...setupEquipmentItemProps,
      },
      required: ["id", "avOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const parsed: AVEquipmentItemWriteArgs = {
        equipmentId: optionalString(args, "equipmentId") ?? null,
        item: optionalString(args, "item") ?? "",
        quantity: optionalInt(args, "quantity"),
        providerVendorId: optionalString(args, "providerVendorId") ?? null,
        providerContactId: optionalString(args, "providerContactId") ?? null,
        operatorVendorId: optionalString(args, "operatorVendorId") ?? null,
        operatorContactId: optionalString(args, "operatorContactId") ?? null,
        notes: optionalString(args, "notes") ?? null,
      };
      return updateVideoEquipmentItemCore(
        requireString(args, "id"),
        requireString(args, "avOrderId"),
        requireString(args, "eventId"),
        parsed,
        userId,
      );
    },
  },
  {
    name: "delete_video_equipment_item",
    description: "Delete a video-section EquipmentItem.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        avOrderId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["id", "avOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const avOrderId = requireString(args, "avOrderId");
      const eventId = requireString(args, "eventId");
      await deleteVideoEquipmentItemCore(id, avOrderId, eventId, userId);
      return { id, deleted: true };
    },
  },
  // AVOrder-direct EquipmentItem ----------------------------------
  {
    name: "create_av_equipment_item",
    description: "Add an EquipmentItem directly to an AV order (not under audio or video sections). When `equipmentId` is set, the canonical item name is resolved server-side.",
    inputSchema: {
      type: "object",
      properties: {
        avOrderId: { type: "string" },
        eventId: { type: "string" },
        ...setupEquipmentItemProps,
      },
      required: ["avOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const parsed: AVEquipmentItemWriteArgs = {
        equipmentId: optionalString(args, "equipmentId") ?? null,
        item: optionalString(args, "item") ?? "",
        quantity: optionalInt(args, "quantity"),
        providerVendorId: optionalString(args, "providerVendorId") ?? null,
        providerContactId: optionalString(args, "providerContactId") ?? null,
        operatorVendorId: optionalString(args, "operatorVendorId") ?? null,
        operatorContactId: optionalString(args, "operatorContactId") ?? null,
        notes: optionalString(args, "notes") ?? null,
      };
      return createAVEquipmentItemCore(
        requireString(args, "avOrderId"),
        requireString(args, "eventId"),
        parsed,
        userId,
      );
    },
  },
  {
    name: "update_av_equipment_item",
    description: "Replace all writable fields on an AVOrder-direct EquipmentItem.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        avOrderId: { type: "string" },
        eventId: { type: "string" },
        ...setupEquipmentItemProps,
      },
      required: ["id", "avOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const parsed: AVEquipmentItemWriteArgs = {
        equipmentId: optionalString(args, "equipmentId") ?? null,
        item: optionalString(args, "item") ?? "",
        quantity: optionalInt(args, "quantity"),
        providerVendorId: optionalString(args, "providerVendorId") ?? null,
        providerContactId: optionalString(args, "providerContactId") ?? null,
        operatorVendorId: optionalString(args, "operatorVendorId") ?? null,
        operatorContactId: optionalString(args, "operatorContactId") ?? null,
        notes: optionalString(args, "notes") ?? null,
      };
      return updateAVEquipmentItemCore(
        requireString(args, "id"),
        requireString(args, "avOrderId"),
        requireString(args, "eventId"),
        parsed,
        userId,
      );
    },
  },
  {
    name: "delete_av_equipment_item",
    description: "Delete an AVOrder-direct EquipmentItem.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        avOrderId: { type: "string" },
        eventId: { type: "string" },
      },
      required: ["id", "avOrderId", "eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const id = requireString(args, "id");
      const avOrderId = requireString(args, "avOrderId");
      const eventId = requireString(args, "eventId");
      await deleteAVEquipmentItemCore(id, avOrderId, eventId, userId);
      return { id, deleted: true };
    },
  },
];
