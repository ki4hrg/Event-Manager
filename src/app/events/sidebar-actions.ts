"use server";

import { prisma } from "@/lib/prisma";
import { resolveOptionLabel } from "@/lib/optionUtils";
import { getSetupOrderDisplayName } from "./setup-orders/utils";

export type SidebarSection =
  | "functions"
  | "av-orders"
  | "catering-orders"
  | "print-orders"
  | "setup-orders"
  | "supply-orders"
  | "media-deliverables"
  | "presentations";

export type SidebarItem =
  | { kind: "header"; id: string; label: string }
  | { kind: "link"; id: string; label: string; href: string };

export async function getSidebarItems(
  eventId: string,
  section: SidebarSection
): Promise<SidebarItem[]> {
  const base = `/events/${eventId}`;

  if (section === "functions") {
    const [rows, typeOptions] = await Promise.all([
      prisma.function.findMany({
        where: { eventId },
        select: { id: true, name: true, type: true },
      }),
      prisma.customOption.findMany({
        where: { category: "function_type" },
        select: { label: true, sortOrder: true },
        orderBy: { sortOrder: "asc" },
      }),
    ]);

    const groups = new Map<string, { headerLabel: string; entries: { id: string; label: string }[] }>();
    for (const r of rows) {
      const key = r.type || "";
      const headerLabel = key ? resolveOptionLabel(key, typeOptions) : "Other";
      const group = groups.get(key) ?? { headerLabel, entries: [] };
      group.entries.push({ id: r.id, label: r.name || "Unnamed Function" });
      groups.set(key, group);
    }

    const sortOrderByLabel = new Map<string, number>(
      typeOptions.map((o) => [o.label, o.sortOrder])
    );
    const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
      const aOrder = sortOrderByLabel.get(a) ?? Number.MAX_SAFE_INTEGER;
      const bOrder = sortOrderByLabel.get(b) ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return groups.get(a)!.headerLabel.localeCompare(groups.get(b)!.headerLabel);
    });

    const items: SidebarItem[] = [];
    for (const key of sortedKeys) {
      const group = groups.get(key)!;
      items.push({ kind: "header", id: `fn-group-${key || "untyped"}`, label: group.headerLabel });
      const entries = group.entries.sort((a, b) => a.label.localeCompare(b.label));
      for (const e of entries) {
        items.push({
          kind: "link",
          id: e.id,
          label: e.label,
          href: `${base}/functions/${e.id}`,
        });
      }
    }
    return items;
  }

  if (section === "av-orders") {
    const rows = await prisma.aVOrder.findMany({
      where: { eventId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return rows.map((r) => ({
      kind: "link",
      id: r.id,
      label: r.name || "Unnamed AV Order",
      href: `${base}/av-orders/${r.id}`,
    }));
  }

  if (section === "catering-orders") {
    const rows = await prisma.cateringOrder.findMany({
      where: { eventId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return rows.map((r) => ({
      kind: "link",
      id: r.id,
      label: r.name || "Unnamed Catering Order",
      href: `${base}/catering-orders/${r.id}`,
    }));
  }

  if (section === "print-orders") {
    const rows = await prisma.printOrder.findMany({
      where: { eventId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return rows.map((r) => ({
      kind: "link",
      id: r.id,
      label: r.name || "Unnamed Print Order",
      href: `${base}/print-orders/${r.id}`,
    }));
  }

  if (section === "setup-orders") {
    const rows = await prisma.setupOrder.findMany({
      where: { eventId },
      select: { id: true, name: true, setupType: true, room: { select: { name: true } } },
    });
    return rows
      .map((r) => ({
        kind: "link" as const,
        id: r.id,
        label: getSetupOrderDisplayName(r),
        href: `${base}/setup-orders/${r.id}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  if (section === "supply-orders") {
    const rows = await prisma.supplyOrder.findMany({
      where: { eventId },
      select: { id: true, name: true, room: { select: { name: true } } },
    });
    return rows
      .map((r) => ({
        kind: "link" as const,
        id: r.id,
        label: r.room?.name
          ? `${r.name || "Unnamed Supply Order"} → ${r.room.name}`
          : r.name || "Unnamed Supply Order",
        href: `${base}/supply-orders/${r.id}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  if (section === "media-deliverables") {
    const rows = await prisma.mediaDeliverable.findMany({
      where: { eventId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return rows.map((r) => ({
      kind: "link",
      id: r.id,
      label: r.name || "Unnamed Media Deliverable",
      href: `${base}/media-deliverables/${r.id}`,
    }));
  }

  if (section === "presentations") {
    const rows = await prisma.presentation.findMany({
      where: { eventId },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    });
    return rows.map((r) => ({
      kind: "link",
      id: r.id,
      label: r.title || "Untitled Presentation",
      href: `${base}/presentations/${r.id}`,
    }));
  }

  return [];
}
