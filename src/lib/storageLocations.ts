import { cache } from "react";
import type { LocationKind, StorageLocation } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// The storage catalog is small (tens to low hundreds of nodes), so it is read
// whole and walked in memory rather than with recursive queries. The packing
// list polls every 15s; a per-request CTE there would be the wrong trade.
// If the catalog ever outgrows this, subtreeIds is the single place to change.

export const PATH_SEPARATOR = " › ";

export type LocationNode = Pick<
  StorageLocation,
  "id" | "name" | "kind" | "type" | "parentId" | "sortOrder" | "archived"
>;

export type LocationIndex = {
  all: LocationNode[];
  byId: Map<string, LocationNode>;
  childrenByParent: Map<string | null, LocationNode[]>;
};

/**
 * Effective parent map for one event: the durable tree with each container
 * line's per-event placement laid over it.
 */
export type PlacementMap = Map<string, string | null>;

export type ContainerLine = {
  containerLocationId: string | null;
  sourceLocationId: string | null;
};

function compareNodes(a: LocationNode, b: LocationNode) {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.name.localeCompare(b.name);
}

function indexNodes(rows: LocationNode[]): LocationIndex {
  const byId = new Map<string, LocationNode>();
  const childrenByParent = new Map<string | null, LocationNode[]>();
  for (const row of rows) {
    byId.set(row.id, row);
    const key = row.parentId;
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key)!.push(row);
  }
  childrenByParent.forEach((bucket) => bucket.sort(compareNodes));
  return { all: rows, byId, childrenByParent };
}

/**
 * Cached per request so a page and its child components share one read
 * (same reasoning as getEvent in src/app/events/actions.ts).
 */
export const getLocationIndex = cache(async (tenantId: string): Promise<LocationIndex> => {
  const rows = await prisma.storageLocation.findMany({
    where: { tenantId },
    select: {
      id: true,
      name: true,
      kind: true,
      type: true,
      parentId: true,
      sortOrder: true,
      archived: true,
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return indexNodes(rows);
});

/** Same shape as getLocationIndex, for callers that already hold the rows. */
export function buildLocationIndex(rows: LocationNode[]): LocationIndex {
  return indexNodes([...rows].sort(compareNodes));
}

/**
 * Lay an event's container placements over the durable tree. A container line
 * with no sourceLocationId leaves that container at its durable home.
 */
export function resolvePlacements(
  index: LocationIndex,
  containerLines: ContainerLine[],
): PlacementMap {
  const placements: PlacementMap = new Map();
  for (const node of index.all) placements.set(node.id, node.parentId);
  for (const line of containerLines) {
    if (!line.containerLocationId || !line.sourceLocationId) continue;
    if (!placements.has(line.containerLocationId)) continue;
    placements.set(line.containerLocationId, line.sourceLocationId);
  }
  return placements;
}

export type ChildrenMap = Map<string | null, string[]>;

/**
 * Build once and pass into repeated subtreeIds calls — computing subtrees for
 * every node otherwise rebuilds this map per node, on a path the packing list
 * polls every 15 seconds.
 */
export function buildChildrenMap(placements: PlacementMap): ChildrenMap {
  const children: ChildrenMap = new Map();
  placements.forEach((parentId, id) => {
    if (!children.has(parentId)) children.set(parentId, []);
    children.get(parentId)!.push(id);
  });
  return children;
}

/**
 * Every id at or below `rootId` on the effective graph, inclusive.
 *
 * The visited set is load-bearing, not defensive tidiness: two container lines
 * can point at each other while the durable tree stays acyclic, and a cycle
 * written directly to the database would otherwise hang a page render.
 */
export function subtreeIds(
  placements: PlacementMap,
  rootId: string,
  prebuiltChildren?: ChildrenMap,
): Set<string> {
  const children = prebuiltChildren ?? buildChildrenMap(placements);
  const seen = new Set<string>();
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const childId of children.get(id) ?? []) {
      if (!seen.has(childId)) queue.push(childId);
    }
  }
  return seen;
}

/** Ancestors of `id`, nearest first. Stops on a cycle rather than looping. */
export function ancestorIds(placements: PlacementMap, id: string): string[] {
  const chain: string[] = [];
  const seen = new Set<string>([id]);
  let current = placements.get(id) ?? null;
  while (current && !seen.has(current)) {
    chain.push(current);
    seen.add(current);
    current = placements.get(current) ?? null;
  }
  return chain;
}

/** `Off-Site Storage › Logistics Pallet › Registration Box` */
export function formatLocationPath(
  index: LocationIndex,
  id: string,
  placements?: PlacementMap,
): string {
  const node = index.byId.get(id);
  if (!node) return "";
  const map = placements ?? durablePlacements(index);
  const names = ancestorIds(map, id)
    .map((ancestorId) => index.byId.get(ancestorId)?.name)
    .filter((name): name is string => !!name)
    .reverse();
  return [...names, node.name].join(PATH_SEPARATOR);
}

export function durablePlacements(index: LocationIndex): PlacementMap {
  const placements: PlacementMap = new Map();
  for (const node of index.all) placements.set(node.id, node.parentId);
  return placements;
}

export type FlatLocationOption = LocationNode & { depth: number; path: string };

/**
 * Depth-ordered flat list for rendering an indented tree or select. Nodes whose
 * parent is missing (or unreachable through a cycle) are surfaced as roots so
 * they never silently vanish from the UI.
 */
export function flattenLocations(
  index: LocationIndex,
  options: {
    placements?: PlacementMap;
    includeArchived?: boolean;
    kind?: LocationKind;
    excludeSubtreeOf?: string;
    onlyIds?: Set<string>;
  } = {},
): FlatLocationOption[] {
  const placements = options.placements ?? durablePlacements(index);
  const excluded = options.excludeSubtreeOf
    ? subtreeIds(placements, options.excludeSubtreeOf)
    : null;

  const children = buildChildrenMap(placements);
  const rootIds = index.all
    .filter((node) => {
      const parentId = placements.get(node.id) ?? null;
      return parentId === null || !index.byId.has(parentId);
    })
    .map((node) => node.id);

  const out: FlatLocationOption[] = [];
  const seen = new Set<string>();

  const walk = (id: string, depth: number, prefix: string[]) => {
    if (seen.has(id)) return;
    seen.add(id);
    const node = index.byId.get(id);
    if (!node) return;
    const path = [...prefix, node.name];
    const hidden =
      (excluded?.has(id) ?? false) ||
      (!options.includeArchived && node.archived) ||
      (options.onlyIds ? !options.onlyIds.has(id) : false) ||
      (options.kind ? node.kind !== options.kind : false);
    if (!hidden) {
      out.push({ ...node, depth, path: path.join(PATH_SEPARATOR) });
    }
    // Archived nodes hide their whole subtree; a retired pallet shouldn't leave
    // its boxes floating loose in every picker.
    if (!options.includeArchived && node.archived) return;
    if (excluded?.has(id)) return;
    for (const childId of children.get(id) ?? []) walk(childId, depth + 1, path);
  };

  for (const id of rootIds) walk(id, 0, []);
  // Anything left unvisited sits under a cycle — show it rather than drop it.
  for (const node of index.all) {
    if (!seen.has(node.id)) walk(node.id, 0, []);
  }
  return out;
}

/**
 * Narrows a flattened node to the serializable shape LocationSelect expects.
 * Structural, so lib doesn't have to import from a client component.
 */
export function toLocationOption(node: FlatLocationOption) {
  return {
    id: node.id,
    name: node.name,
    kind: node.kind,
    depth: node.depth,
    path: node.path,
    archived: node.archived,
  };
}

/**
 * Throws when reparenting `nodeId` under `newParentId` would create a cycle.
 * Callers own the message wording; this is the shared guard.
 */
export function assertNoCycle(
  index: LocationIndex,
  nodeId: string,
  newParentId: string | null,
): void {
  if (!newParentId) return;
  if (newParentId === nodeId) {
    throw new Error("A location can't be its own parent.");
  }
  const placements = durablePlacements(index);
  if (subtreeIds(placements, nodeId).has(newParentId)) {
    const name = index.byId.get(nodeId)?.name ?? "this location";
    const parentName = index.byId.get(newParentId)?.name ?? "that location";
    throw new Error(`Can't move "${name}" into "${parentName}" — it's already inside it.`);
  }
}
