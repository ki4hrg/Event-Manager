import { PermissionResource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermissionForUser } from "@/lib/permissions";
import type { McpToolDefinition } from "./types";
import { requireString } from "./types";

export const orderTools: McpToolDefinition[] = [
  // Catering ------------------------------------------------------------------
  {
    name: "list_catering_orders",
    description:
      "List catering orders for an event, including primary function summary and assigned vendors.",
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
      "List AV orders for an event, including linked functions and presentations and assigned vendors.",
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
      "List setup orders for an event, including assigned room, linked functions/presentations, tables, equipment, and vendors.",
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
      "List print orders for an event, including items, linked functions/presentation, and vendors.",
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
      "List supply orders for an event, including item packing/acquisition state summaries, links, and provider.",
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
];
