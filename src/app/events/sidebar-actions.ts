"use server";

import { prisma } from "@/lib/prisma";
import { getSetupOrderDisplayName } from "./setup-orders/utils";

export type SidebarSection =
  | "functions"
  | "av-orders"
  | "catering-orders"
  | "print-orders"
  | "setup-orders"
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
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      }),
    ]);

    const typeOrder = new Map<string, number>();
    typeOptions.forEach((t, i) => typeOrder.set(t.label, i));

    const groups = new Map<string, { id: string; label: string }[]>();
    for (const r of rows) {
      const key = r.type || "(No type)";
      const arr = groups.get(key) ?? [];
      arr.push({ id: r.id, label: r.name || "Unnamed Function" });
      groups.set(key, arr);
    }

    const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
      const aIdx = typeOrder.get(a) ?? Number.POSITIVE_INFINITY;
      const bIdx = typeOrder.get(b) ?? Number.POSITIVE_INFINITY;
      if (aIdx !== bIdx) return aIdx - bIdx;
      return a.localeCompare(b);
    });

    const items: SidebarItem[] = [];
    for (const key of sortedKeys) {
      items.push({ kind: "header", id: `fn-group-${key}`, label: key });
      const entries = groups.get(key)!.sort((a, b) => a.label.localeCompare(b.label));
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
