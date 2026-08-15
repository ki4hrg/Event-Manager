import { LocationKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermissionForUser } from "@/lib/permissions";
import {
  createStorageLocationCore,
  updateStorageLocationCore,
  moveStorageLocationCore,
  setStorageLocationArchivedCore,
  deleteStorageLocationCore,
  type StorageLocationWriteArgs,
} from "@/app/storage-locations/core";
import {
  buildLocationIndex,
  flattenLocations,
  formatLocationPath,
} from "@/lib/storageLocations";
import type { McpToolDefinition } from "./types";
import { requireString, optionalString } from "./types";

const LOCATION_KINDS = ["PLACE", "CONTAINER"] as const;

function readKind(args: Record<string, unknown>, fallback: LocationKind): LocationKind {
  const raw = optionalString(args, "kind");
  if (!raw) return fallback;
  if (raw !== "PLACE" && raw !== "CONTAINER") {
    throw new Error(`kind must be PLACE or CONTAINER, got: ${raw}`);
  }
  return raw as LocationKind;
}

function readLocationArgs(args: Record<string, unknown>): StorageLocationWriteArgs {
  return {
    name: requireString(args, "name"),
    kind: readKind(args, LocationKind.PLACE),
    type: optionalString(args, "type") ?? null,
    parentId: optionalString(args, "parentId") ?? null,
    notes: optionalString(args, "notes") ?? null,
    archived: args.archived === true,
  };
}

const locationWriteProps = {
  name: { type: "string" },
  kind: {
    type: "string",
    enum: LOCATION_KINDS,
    description:
      "PLACE stays put (a building, a shelf); CONTAINER travels to the venue and is packed as a unit. Defaults PLACE.",
  },
  type: {
    type: "string",
    description: "Optional display label from the location_type options (Shelf, Pallet, Tote...).",
  },
  parentId: {
    type: "string",
    description: "Optional parent location id. Omit for a top-level location.",
  },
  notes: { type: "string", description: "Optional." },
  archived: {
    type: "boolean",
    description: "Archived locations and everything inside them drop out of pickers.",
  },
} as const;

export const storageLocationTools: McpToolDefinition[] = [
  {
    name: "list_storage_locations",
    description:
      "List the storage location tree (where things live between events), in depth order with a resolved path for each node. Returns summary shape — use `get_storage_location` for full detail (notes, timestamps, parent record).",
    inputSchema: {
      type: "object",
      properties: {
        includeArchived: { type: "boolean", description: "Defaults false." },
        kind: { type: "string", enum: LOCATION_KINDS, description: "Optional filter." },
      },
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      await requirePermissionForUser(ctx.userId, "STORAGE_LOCATIONS", "VIEW");
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
      const kind = optionalString(args, "kind");
      return flattenLocations(index, {
        includeArchived: args.includeArchived === true,
        kind: kind === "PLACE" || kind === "CONTAINER" ? (kind as LocationKind) : undefined,
      });
    },
  },
  {
    name: "get_storage_location",
    description:
      "Full detail for one storage location, including its resolved path, direct children, and how many order items are sourced from it.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      await requirePermissionForUser(ctx.userId, "STORAGE_LOCATIONS", "VIEW");
      const id = requireString(args, "id");
      const location = await prisma.storageLocation.findUnique({
        where: { id },
        include: {
          parent: { select: { id: true, name: true } },
          children: {
            select: { id: true, name: true, kind: true, type: true, archived: true },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          },
          _count: {
            select: {
              sourcedSupplyItems: true,
              sourcedPrintItems: true,
              containerSupplyItems: true,
              // Durable contents, as opposed to the per-event order lines above.
              inventoryItems: true,
            },
          },
        },
      });
      if (!location) throw new Error("Storage location not found.");

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
      return { ...location, path: formatLocationPath(buildLocationIndex(rows), id) };
    },
  },
  {
    name: "create_storage_location",
    description:
      "Create a storage location. Names must be unique among siblings (and among top-level locations).",
    inputSchema: {
      type: "object",
      properties: locationWriteProps,
      required: ["name"],
      additionalProperties: false,
    },
    handler: async (args, ctx) =>
      createStorageLocationCore(readLocationArgs(args), ctx.userId),
  },
  {
    name: "update_storage_location",
    description:
      "Replace all writable fields on a storage location. To only change its parent use `move_storage_location`.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, ...locationWriteProps },
      required: ["id", "name"],
      additionalProperties: false,
    },
    handler: async (args, ctx) =>
      updateStorageLocationCore(requireString(args, "id"), readLocationArgs(args), ctx.userId),
  },
  {
    name: "move_storage_location",
    description:
      "Reparent a storage location. Errors if the move would put a location inside itself. Note this moves its durable home — a container's per-event placement is the sourceLocationId on its supply order container line.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        parentId: { type: "string", description: "Empty or omitted moves it to the top level." },
      },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (args, ctx) =>
      moveStorageLocationCore(
        requireString(args, "id"),
        optionalString(args, "parentId") ?? null,
        ctx.userId,
      ),
  },
  {
    name: "archive_storage_location",
    description:
      "Archive or restore a storage location. Archiving hides it and everything inside it from pickers without deleting history — the field-safe alternative to deletion.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        archived: { type: "boolean", description: "Defaults true." },
      },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (args, ctx) =>
      setStorageLocationArchivedCore(
        requireString(args, "id"),
        args.archived !== false,
        ctx.userId,
      ),
  },
  {
    name: "delete_storage_location",
    description:
      "Delete a storage location. Anything inside it moves to the top level, and items sourced from it lose the reference.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      await deleteStorageLocationCore(requireString(args, "id"), ctx.userId);
      return { deleted: true };
    },
  },
];
