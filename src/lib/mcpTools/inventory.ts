import { prisma } from "@/lib/prisma";
import { requirePermissionForUser } from "@/lib/permissions";
import {
  createInventoryItemCore,
  updateInventoryItemCore,
  setInventoryItemArchivedCore,
  moveInventoryItemsCore,
  deleteInventoryItemsCore,
  type InventoryItemWriteArgs,
} from "@/app/storage-locations/inventory-core";
import {
  buildLocationIndex,
  formatLocationPath,
} from "@/lib/storageLocations";
import type { McpToolDefinition } from "./types";
import { requireString, optionalString, optionalStringArray } from "./types";

function optionalInt(args: Record<string, unknown>, key: string): number | null {
  const raw = args[key];
  if (raw == null || raw === "") return null;
  const value = typeof raw === "number" ? raw : parseInt(String(raw));
  return Number.isNaN(value) ? null : value;
}

function readInventoryArgs(args: Record<string, unknown>): InventoryItemWriteArgs {
  return {
    name: optionalString(args, "name") ?? null,
    equipmentId: requireString(args, "equipmentId"),
    quantity: optionalInt(args, "quantity"),
    notes: optionalString(args, "notes") ?? null,
    archived: args.archived === true,
  };
}

/** Resolves each item's location to a full `A › B › C` path for readability. */
async function withLocationPaths<T extends { locationId: string }>(items: T[]) {
  const rows = await prisma.storageLocation.findMany({
    select: {
      id: true,
      name: true,
      kind: true,
      type: true,
      parentId: true,
      sortOrder: true,
      archived: true,
    },
  });
  const index = buildLocationIndex(rows);
  return items.map((item) => ({
    ...item,
    locationPath: formatLocationPath(index, item.locationId),
  }));
}

const inventoryWriteProps = {
  name: {
    type: "string",
    description:
      "Optional qualifier only — 'blue', 'spare', 'left case'. The equipment link carries the identity, so leave this empty unless it distinguishes two rows of the same equipment.",
  },
  equipmentId: {
    type: "string",
    description:
      "Required. Inventory is catalogued gear, so every item points at an Equipment entry. See `list_equipment_catalog`.",
  },
  quantity: { type: "number", description: "Optional. Omit when the count isn't tracked." },
  notes: { type: "string", description: "Optional." },
  archived: {
    type: "boolean",
    description: "Archived items drop out of location contents unless explicitly included.",
  },
} as const;

export const inventoryTools: McpToolDefinition[] = [
  {
    name: "list_equipment_catalog",
    description:
      "The Equipment catalog that inventory items and order lines point at. Needed to get an equipmentId before calling `create_inventory_item`. Read-only — extending the catalog is admin-only and has no MCP tool.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Optional. Filter to one equipment_category label." },
      },
    },
    handler: async (args, ctx) => {
      // Gated on STORAGE_LOCATIONS rather than EQUIPMENT deliberately. EQUIPMENT
      // is admin-only, but getEquipment() in the app is auth-only so that every
      // order form can render a picker — gating this on EQUIPMENT would make MCP
      // stricter than the UI for the same user, and would stop a packer from
      // filing inventory they can file on screen.
      await requirePermissionForUser(ctx.userId, "STORAGE_LOCATIONS", "VIEW");
      const category = optionalString(args, "category");
      return prisma.equipment.findMany({
        where: category ? { category } : {},
        select: { id: true, name: true, category: true },
        orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
      });
    },
  },
  {
    name: "list_inventory_items",
    description:
      "Durable inventory — what physically lives at storage locations between events, as opposed to the per-event supply order lines that draw on it. Filter by location to answer 'what is in this box', or by equipment to answer 'where is our stock of X'. Returns summary shape — use `get_inventory_item` for full detail (notes, timestamps, linked supply order lines).",
    inputSchema: {
      type: "object",
      properties: {
        locationId: {
          type: "string",
          description: "Optional. Only items filed directly at this location, not its descendants.",
        },
        equipmentId: { type: "string", description: "Optional. Only items of this equipment." },
        includeArchived: { type: "boolean", description: "Defaults false." },
      },
    },
    handler: async (args, ctx) => {
      await requirePermissionForUser(ctx.userId, "STORAGE_LOCATIONS", "VIEW");
      const locationId = optionalString(args, "locationId");
      const equipmentId = optionalString(args, "equipmentId");
      const items = await prisma.inventoryItem.findMany({
        where: {
          ...(locationId ? { locationId } : {}),
          ...(equipmentId ? { equipmentId } : {}),
          ...(args.includeArchived === true ? {} : { archived: false }),
        },
        select: {
          id: true,
          name: true,
          quantity: true,
          archived: true,
          locationId: true,
          location: { select: { id: true, name: true } },
          equipment: { select: { id: true, name: true, category: true } },
        },
        orderBy: [{ locationId: "asc" }, { sortOrder: "asc" }],
      });
      return withLocationPaths(items);
    },
  },
  {
    name: "get_inventory_item",
    description:
      "Full detail for one inventory item, including its location path and any supply order lines pulled from it.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    handler: async (args, ctx) => {
      await requirePermissionForUser(ctx.userId, "STORAGE_LOCATIONS", "VIEW");
      const item = await prisma.inventoryItem.findUnique({
        where: { id: requireString(args, "id") },
        include: {
          location: { select: { id: true, name: true, kind: true, type: true } },
          equipment: { select: { id: true, name: true, category: true } },
          supplyOrderItems: {
            select: {
              id: true,
              quantity: true,
              packingStatus: true,
              supplyOrder: { select: { id: true, name: true, eventId: true } },
            },
          },
        },
      });
      if (!item) throw new Error("Inventory item not found.");
      const [withPath] = await withLocationPaths([item]);
      return withPath;
    },
  },
  {
    name: "create_inventory_item",
    description:
      "File a new item at a storage location. Equipment is required and must already exist in the catalog — there is no MCP tool to extend it, since that is admin-only.",
    inputSchema: {
      type: "object",
      properties: {
        locationId: { type: "string", description: "Where it lives. See `list_storage_locations`." },
        ...inventoryWriteProps,
      },
      required: ["locationId", "equipmentId"],
    },
    handler: async (args, ctx) =>
      createInventoryItemCore(
        requireString(args, "locationId"),
        readInventoryArgs(args),
        ctx.userId,
      ),
  },
  {
    name: "update_inventory_item",
    description:
      "Replace an inventory item's writable fields. Does NOT move it — use `move_inventory_items` for that.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, ...inventoryWriteProps },
      required: ["id", "equipmentId"],
    },
    handler: async (args, ctx) =>
      updateInventoryItemCore(requireString(args, "id"), readInventoryArgs(args), ctx.userId),
  },
  {
    name: "move_inventory_items",
    description:
      "Re-file items at a different location — the common edit during a repack. An item has exactly one home, so this is a move, not a copy.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" } },
        targetLocationId: { type: "string" },
      },
      required: ["ids", "targetLocationId"],
    },
    handler: async (args, ctx) =>
      moveInventoryItemsCore(
        optionalStringArray(args, "ids"),
        requireString(args, "targetLocationId"),
        ctx.userId,
      ),
  },
  {
    name: "archive_inventory_item",
    description:
      "Archive or restore an item. Archiving is the retire path for consumed stock — it needs only WRITE, where deleting needs DELETE.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        archived: { type: "boolean", description: "Defaults true." },
      },
      required: ["id"],
    },
    handler: async (args, ctx) =>
      setInventoryItemArchivedCore(
        requireString(args, "id"),
        args.archived !== false,
        ctx.userId,
      ),
  },
  {
    name: "delete_inventory_items",
    description:
      "Permanently delete inventory items. Prefer `archive_inventory_item` for stock that was used up — deleting loses the record that it was ever there.",
    inputSchema: {
      type: "object",
      properties: { ids: { type: "array", items: { type: "string" } } },
      required: ["ids"],
    },
    handler: async (args, ctx) =>
      deleteInventoryItemsCore(optionalStringArray(args, "ids"), ctx.userId),
  },
];
