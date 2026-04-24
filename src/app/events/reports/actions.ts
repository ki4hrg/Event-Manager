"use server";

import { prisma } from "@/lib/prisma";

export type EquipmentReportFilters = {
  vendorIds?: string[];
  modelTypes?: string[];
};

export type EquipmentSourceRef = {
  orderId: string;
  orderName: string;
  modelType: "AV_ORDER" | "CATERING_ORDER" | "SETUP_ORDER";
  quantity: number;
  isScheduled: boolean;
};

export type EquipmentReportRow = {
  equipmentId: string | null;
  itemName: string;
  category: string | null;
  totalQuantity: number;
  peakNeeded: number;
  peakIsExact: boolean;
  sources: EquipmentSourceRef[];
};

export type VendorEquipmentGroup = {
  vendorId: string | null;
  vendorName: string;
  rows: EquipmentReportRow[];
};

type NormalizedItem = {
  equipmentId: string | null;
  equipmentKey: string;
  itemName: string;
  category: string | null;
  attributionVendorId: string | null;
  attributionVendorName: string | null;
  quantity: number;
  orderId: string;
  orderName: string;
  modelType: "AV_ORDER" | "CATERING_ORDER" | "SETUP_ORDER";
  scheduleWindows: { start: Date; end: Date }[];
};

function extractWindows(
  functions: { schedules: { startTime: Date; endTime: Date }[] }[]
): { start: Date; end: Date }[] {
  return functions.flatMap((fn) =>
    fn.schedules.map((s) => ({ start: s.startTime, end: s.endTime }))
  );
}

function calculatePeak(
  sources: { quantity: number; windows: { start: Date; end: Date }[] }[]
): { peak: number; isExact: boolean } {
  const unscheduledQty = sources
    .filter((s) => s.windows.length === 0)
    .reduce((sum, s) => sum + s.quantity, 0);
  const scheduled = sources.filter((s) => s.windows.length > 0);

  if (scheduled.length === 0) {
    return { peak: sources.reduce((sum, s) => sum + s.quantity, 0), isExact: false };
  }

  const events: { time: number; delta: number }[] = [];
  for (const s of scheduled) {
    for (const w of s.windows) {
      events.push({ time: w.start.getTime(), delta: s.quantity });
      events.push({ time: w.end.getTime(), delta: -s.quantity });
    }
  }
  // Process end events before start events at the same timestamp (non-overlapping = no double-count)
  events.sort((a, b) => a.time - b.time || a.delta - b.delta);

  let current = 0;
  let peak = 0;
  for (const e of events) {
    current += e.delta;
    peak = Math.max(peak, current);
  }

  return { peak: peak + unscheduledQty, isExact: unscheduledQty === 0 };
}

export async function getEquipmentResponsibilityData(
  eventId: string,
  filters?: EquipmentReportFilters
): Promise<VendorEquipmentGroup[]> {
  const [equipmentItems, inputItems, monitorMixes] = await Promise.all([
    prisma.equipmentItem.findMany({
      where: {
        OR: [
          { cateringOrder: { eventId } },
          { setupOrder: { eventId } },
          { avOrder: { eventId } },
          { videoSection: { avOrder: { eventId } } },
        ],
      },
      include: {
        equipment: { select: { id: true, name: true, category: true } },
        providerVendor: { select: { id: true, name: true } },
        cateringOrder: {
          select: {
            id: true,
            name: true,
            function: { select: { schedules: { select: { startTime: true, endTime: true } } } },
          },
        },
        setupOrder: {
          select: {
            id: true,
            name: true,
            functions: { select: { schedules: { select: { startTime: true, endTime: true } } } },
          },
        },
        avOrder: {
          select: {
            id: true,
            name: true,
            functions: { select: { schedules: { select: { startTime: true, endTime: true } } } },
          },
        },
        videoSection: {
          select: {
            avOrder: {
              select: {
                id: true,
                name: true,
                functions: { select: { schedules: { select: { startTime: true, endTime: true } } } },
              },
            },
          },
        },
      },
    }),
    prisma.inputItem.findMany({
      where: { inputGroup: { audioSection: { avOrder: { eventId } } } },
      include: {
        equipment: { select: { id: true, name: true, category: true } },
        providerVendor: { select: { id: true, name: true } },
        inputGroup: {
          select: {
            audioSection: {
              select: {
                avOrder: {
                  select: {
                    id: true,
                    name: true,
                    functions: { select: { schedules: { select: { startTime: true, endTime: true } } } },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.monitorMix.findMany({
      where: { audioSection: { avOrder: { eventId } } },
      include: {
        equipment: { select: { id: true, name: true, category: true } },
        providerVendor: { select: { id: true, name: true } },
        audioSection: {
          select: {
            avOrder: {
              select: {
                id: true,
                name: true,
                functions: { select: { schedules: { select: { startTime: true, endTime: true } } } },
              },
            },
          },
        },
      },
    }),
  ]);

  const normalized: NormalizedItem[] = [];

  for (const item of equipmentItems) {
    const attribution = item.providerVendor;
    let orderId: string;
    let orderName: string;
    let modelType: "AV_ORDER" | "CATERING_ORDER" | "SETUP_ORDER";
    let scheduleWindows: { start: Date; end: Date }[];

    if (item.cateringOrder) {
      orderId = item.cateringOrder.id;
      orderName = item.cateringOrder.name;
      modelType = "CATERING_ORDER";
      scheduleWindows = item.cateringOrder.function
        ? extractWindows([item.cateringOrder.function])
        : [];
    } else if (item.setupOrder) {
      orderId = item.setupOrder.id;
      orderName = item.setupOrder.name ?? item.setupOrder.id;
      modelType = "SETUP_ORDER";
      scheduleWindows = extractWindows(item.setupOrder.functions);
    } else if (item.avOrder) {
      orderId = item.avOrder.id;
      orderName = item.avOrder.name;
      modelType = "AV_ORDER";
      scheduleWindows = extractWindows(item.avOrder.functions);
    } else if (item.videoSection?.avOrder) {
      orderId = item.videoSection.avOrder.id;
      orderName = item.videoSection.avOrder.name;
      modelType = "AV_ORDER";
      scheduleWindows = extractWindows(item.videoSection.avOrder.functions);
    } else {
      continue;
    }

    normalized.push({
      equipmentId: item.equipmentId,
      equipmentKey: item.equipmentId ?? `item:${item.item.toLowerCase()}`,
      itemName: item.equipment?.name ?? item.item,
      category: item.equipment?.category ?? null,
      attributionVendorId: attribution?.id ?? null,
      attributionVendorName: attribution?.name ?? null,
      quantity: item.quantity ?? 1,
      orderId,
      orderName,
      modelType,
      scheduleWindows,
    });
  }

  for (const item of inputItems) {
    const avOrder = item.inputGroup.audioSection.avOrder;
    normalized.push({
      equipmentId: item.equipmentId,
      equipmentKey: item.equipmentId ?? `item:${item.description.toLowerCase()}`,
      itemName: item.equipment?.name ?? item.description,
      category: item.equipment?.category ?? null,
      attributionVendorId: item.providerVendor?.id ?? null,
      attributionVendorName: item.providerVendor?.name ?? null,
      quantity: item.quantity,
      orderId: avOrder.id,
      orderName: avOrder.name,
      modelType: "AV_ORDER",
      scheduleWindows: extractWindows(avOrder.functions),
    });
  }

  for (const item of monitorMixes) {
    const avOrder = item.audioSection.avOrder;
    normalized.push({
      equipmentId: item.equipmentId,
      equipmentKey: item.equipmentId ?? `item:${item.description.toLowerCase()}`,
      itemName: item.equipment?.name ?? item.description,
      category: item.equipment?.category ?? null,
      attributionVendorId: item.providerVendor?.id ?? null,
      attributionVendorName: item.providerVendor?.name ?? null,
      quantity: 1,
      orderId: avOrder.id,
      orderName: avOrder.name,
      modelType: "AV_ORDER",
      scheduleWindows: extractWindows(avOrder.functions),
    });
  }

  let filtered = normalized;
  if (filters?.vendorIds?.length) {
    filtered = filtered.filter((item) =>
      filters.vendorIds!.includes(item.attributionVendorId ?? "__unassigned__")
    );
  }
  if (filters?.modelTypes?.length) {
    filtered = filtered.filter((item) => filters.modelTypes!.includes(item.modelType));
  }

  // Group by vendor, then by equipment key within each vendor
  const vendorMap = new Map<
    string,
    {
      vendorId: string | null;
      vendorName: string;
      equipmentMap: Map<
        string,
        {
          equipmentId: string | null;
          itemName: string;
          category: string | null;
          sources: { quantity: number; windows: { start: Date; end: Date }[]; source: EquipmentSourceRef }[];
        }
      >;
    }
  >();

  for (const item of filtered) {
    const vendorKey = item.attributionVendorId ?? "__unassigned__";
    if (!vendorMap.has(vendorKey)) {
      vendorMap.set(vendorKey, {
        vendorId: item.attributionVendorId,
        vendorName: item.attributionVendorName ?? "Unassigned",
        equipmentMap: new Map(),
      });
    }
    const vendor = vendorMap.get(vendorKey)!;

    if (!vendor.equipmentMap.has(item.equipmentKey)) {
      vendor.equipmentMap.set(item.equipmentKey, {
        equipmentId: item.equipmentId,
        itemName: item.itemName,
        category: item.category,
        sources: [],
      });
    }
    vendor.equipmentMap.get(item.equipmentKey)!.sources.push({
      quantity: item.quantity,
      windows: item.scheduleWindows,
      source: {
        orderId: item.orderId,
        orderName: item.orderName,
        modelType: item.modelType,
        quantity: item.quantity,
        isScheduled: item.scheduleWindows.length > 0,
      },
    });
  }

  const groups: VendorEquipmentGroup[] = [];
  for (const vendorData of Array.from(vendorMap.values())) {
    const rows: EquipmentReportRow[] = [];

    for (const eqData of Array.from(vendorData.equipmentMap.values())) {
      const totalQuantity = eqData.sources.reduce((sum, s) => sum + s.quantity, 0);
      const { peak, isExact } = calculatePeak(
        eqData.sources.map((s) => ({ quantity: s.quantity, windows: s.windows }))
      );

      rows.push({
        equipmentId: eqData.equipmentId,
        itemName: eqData.itemName,
        category: eqData.category,
        totalQuantity,
        peakNeeded: peak,
        peakIsExact: isExact,
        sources: eqData.sources.map((s) => s.source),
      });
    }

    // ￿ sorts after all normal Unicode text, pushing null-category rows last
    const SORT_LAST = "￿";
    rows.sort((a, b) => {
      const catA = a.category ?? SORT_LAST;
      const catB = b.category ?? SORT_LAST;
      if (catA !== catB) return catA.localeCompare(catB);
      return a.itemName.localeCompare(b.itemName);
    });

    groups.push({ vendorId: vendorData.vendorId, vendorName: vendorData.vendorName, rows });
  }

  // Named vendors sorted alphabetically; Unassigned last
  groups.sort((a, b) => {
    if (a.vendorId === null) return 1;
    if (b.vendorId === null) return -1;
    return a.vendorName.localeCompare(b.vendorName);
  });

  return groups;
}
