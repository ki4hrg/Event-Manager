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

export type SidebarItem = { id: string; label: string; href: string };

export async function getSidebarItems(
  eventId: string,
  section: SidebarSection
): Promise<SidebarItem[]> {
  const base = `/events/${eventId}`;

  if (section === "functions") {
    const rows = await prisma.function.findMany({
      where: { eventId },
      select: {
        id: true,
        name: true,
        type: true,
        schedules: { select: { startTime: true }, orderBy: { startTime: "asc" }, take: 1 },
      },
    });
    rows.sort((a, b) => {
      const aTime = a.schedules[0]?.startTime?.getTime() ?? Infinity;
      const bTime = b.schedules[0]?.startTime?.getTime() ?? Infinity;
      return aTime - bTime;
    });
    return rows.map((r) => ({
      id: r.id,
      label: r.name || r.type || "Unnamed Function",
      href: `${base}/functions/${r.id}`,
    }));
  }

  if (section === "av-orders") {
    const rows = await prisma.aVOrder.findMany({
      where: { eventId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return rows.map((r) => ({
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
      id: r.id,
      label: r.name || "Unnamed Print Order",
      href: `${base}/print-orders/${r.id}`,
    }));
  }

  if (section === "setup-orders") {
    const rows = await prisma.setupOrder.findMany({
      where: { eventId },
      select: { id: true, name: true, setupType: true, room: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      label: getSetupOrderDisplayName(r),
      href: `${base}/setup-orders/${r.id}`,
    }));
  }

  if (section === "presentations") {
    const rows = await prisma.presentation.findMany({
      where: { eventId },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      label: r.title || "Untitled Presentation",
      href: `${base}/presentations/${r.id}`,
    }));
  }

  return [];
}
