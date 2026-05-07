"use server";

import { prisma } from "@/lib/prisma";
import type { ModelType } from "@/app/vendors/actions";

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

export type ResponsiblePartyGroup = {
  partyType: "vendor" | "contact" | "unassigned";
  partyId: string | null;
  partyName: string;
  rows: EquipmentReportRow[];
};

/** @deprecated use ResponsiblePartyGroup */
export type VendorEquipmentGroup = ResponsiblePartyGroup;


type NormalizedItem = {
  equipmentId: string | null;
  equipmentKey: string;
  itemName: string;
  category: string | null;
  attributionVendorId: string | null;
  attributionVendorName: string | null;
  attributionContactId: string | null;
  attributionContactName: string | null;
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
        providerContact: { select: { id: true, firstName: true, lastName: true } },
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
        providerContact: { select: { id: true, firstName: true, lastName: true } },
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
        providerContact: { select: { id: true, firstName: true, lastName: true } },
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
    const attrVendor = item.providerVendor;
    const attrContact = item.providerContact;
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
      attributionVendorId: attrVendor?.id ?? null,
      attributionVendorName: attrVendor?.name ?? null,
      attributionContactId: attrVendor ? null : (attrContact?.id ?? null),
      attributionContactName: attrVendor ? null : (attrContact ? `${attrContact.firstName} ${attrContact.lastName}` : null),
      quantity: item.quantity ?? 1,
      orderId,
      orderName,
      modelType,
      scheduleWindows,
    });
  }

  for (const item of inputItems) {
    const avOrder = item.inputGroup.audioSection.avOrder;
    const attrVendor = item.providerVendor;
    const attrContact = item.providerContact;
    normalized.push({
      equipmentId: item.equipmentId,
      equipmentKey: item.equipmentId ?? `item:${item.description.toLowerCase()}`,
      itemName: item.equipment?.name ?? item.description,
      category: item.equipment?.category ?? null,
      attributionVendorId: attrVendor?.id ?? null,
      attributionVendorName: attrVendor?.name ?? null,
      attributionContactId: attrVendor ? null : (attrContact?.id ?? null),
      attributionContactName: attrVendor ? null : (attrContact ? `${attrContact.firstName} ${attrContact.lastName}` : null),
      quantity: item.quantity,
      orderId: avOrder.id,
      orderName: avOrder.name,
      modelType: "AV_ORDER",
      scheduleWindows: extractWindows(avOrder.functions),
    });
  }

  for (const item of monitorMixes) {
    const avOrder = item.audioSection.avOrder;
    const attrVendor = item.providerVendor;
    const attrContact = item.providerContact;
    normalized.push({
      equipmentId: item.equipmentId,
      equipmentKey: item.equipmentId ?? `item:${item.description.toLowerCase()}`,
      itemName: item.equipment?.name ?? item.description,
      category: item.equipment?.category ?? null,
      attributionVendorId: attrVendor?.id ?? null,
      attributionVendorName: attrVendor?.name ?? null,
      attributionContactId: attrVendor ? null : (attrContact?.id ?? null),
      attributionContactName: attrVendor ? null : (attrContact ? `${attrContact.firstName} ${attrContact.lastName}` : null),
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

  type PartyBucket = {
    partyType: "vendor" | "contact" | "unassigned";
    partyId: string | null;
    partyName: string;
    equipmentMap: Map<
      string,
      {
        equipmentId: string | null;
        itemName: string;
        category: string | null;
        sources: { quantity: number; windows: { start: Date; end: Date }[]; source: EquipmentSourceRef }[];
      }
    >;
  };

  const partyMap = new Map<string, PartyBucket>();

  for (const item of filtered) {
    let partyKey: string;
    let bucket: Omit<PartyBucket, "equipmentMap">;

    if (item.attributionVendorId) {
      partyKey = `vendor:${item.attributionVendorId}`;
      bucket = { partyType: "vendor", partyId: item.attributionVendorId, partyName: item.attributionVendorName! };
    } else if (item.attributionContactId) {
      partyKey = `contact:${item.attributionContactId}`;
      bucket = { partyType: "contact", partyId: item.attributionContactId, partyName: item.attributionContactName! };
    } else {
      partyKey = "__unassigned__";
      bucket = { partyType: "unassigned", partyId: null, partyName: "Unassigned" };
    }

    let party = partyMap.get(partyKey);
    if (!party) {
      party = { ...bucket, equipmentMap: new Map() };
      partyMap.set(partyKey, party);
    }

    if (!party.equipmentMap.has(item.equipmentKey)) {
      party.equipmentMap.set(item.equipmentKey, {
        equipmentId: item.equipmentId,
        itemName: item.itemName,
        category: item.category,
        sources: [],
      });
    }
    party.equipmentMap.get(item.equipmentKey)!.sources.push({
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

  const groups: ResponsiblePartyGroup[] = [];
  for (const partyData of Array.from(partyMap.values())) {
    const rows: EquipmentReportRow[] = [];

    for (const eqData of Array.from(partyData.equipmentMap.values())) {
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

    groups.push({ partyType: partyData.partyType, partyId: partyData.partyId, partyName: partyData.partyName, rows });
  }

  // Named vendors alphabetically → named contacts alphabetically → Unassigned last
  groups.sort((a, b) => {
    if (a.partyType === "unassigned") return 1;
    if (b.partyType === "unassigned") return -1;
    if (a.partyType !== b.partyType) {
      return a.partyType === "vendor" ? -1 : 1;
    }
    return a.partyName.localeCompare(b.partyName);
  });

  return groups;
}

export async function getOrderAssignedVendors(eventId: string) {
  const vendors = await prisma.vendor.findMany({
    where: {
      OR: [
        { cateringOrderVendors: { some: { cateringOrder: { eventId } } } },
        { avOrderVendors: { some: { avOrder: { eventId } } } },
        { setupOrderVendors: { some: { setupOrder: { eventId } } } },
      ],
    },
    select: { id: true, name: true },
    distinct: ["id"],
    orderBy: { name: "asc" },
  });
  return vendors;
}

const partySelect = {
  providerVendor: { select: { id: true, name: true } },
  providerContact: { select: { id: true, firstName: true, lastName: true } },
  operatorVendor: { select: { id: true, name: true } },
  operatorContact: { select: { id: true, firstName: true, lastName: true } },
} as const;

const equipmentItemInclude = {
  equipment: { select: { id: true, name: true, category: true } },
  ...partySelect,
} as const;

const functionInclude = {
  schedules: { orderBy: { sortOrder: "asc" as const } },
  rooms: { include: { room: { select: { id: true, name: true } } } },
} as const;

export async function getVendorHandoffData(eventId: string, vendorId: string) {
  const [vendor, cateringOrders, avOrders, setupOrders] = await Promise.all([
    prisma.vendor.findUnique({
      where: { id: vendorId },
      include: {
        contacts: {
          include: {
            contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
          },
          orderBy: [{ isPrimary: "desc" }, { id: "asc" }],
        },
      },
    }),
    prisma.cateringOrder.findMany({
      where: { eventId, vendors: { some: { vendorId } } },
      include: {
        function: { include: functionInclude },
        timelineItems: { orderBy: { sortOrder: "asc" } },
        menuSections: {
          include: { responsiblePartyVendor: { select: { id: true, name: true } } },
          orderBy: { sortOrder: "asc" },
        },
        equipmentItems: { include: equipmentItemInclude, orderBy: { sortOrder: "asc" } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.aVOrder.findMany({
      where: { eventId, vendors: { some: { vendorId } } },
      include: {
        functions: { include: functionInclude },
        audioSection: {
          include: {
            inputGroups: {
              include: {
                ...partySelect,
                inputItems: {
                  include: {
                    equipment: { select: { id: true, name: true } },
                    ...partySelect,
                  },
                  orderBy: { sortOrder: "asc" },
                },
              },
              orderBy: { sortOrder: "asc" },
            },
            monitorMixes: {
              include: {
                equipment: { select: { id: true, name: true } },
                ...partySelect,
              },
              orderBy: { sortOrder: "asc" },
            },
          },
        },
        videoSection: {
          include: {
            equipmentItems: { include: equipmentItemInclude, orderBy: { sortOrder: "asc" } },
          },
        },
        equipmentItems: { include: equipmentItemInclude, orderBy: { sortOrder: "asc" } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.setupOrder.findMany({
      where: { eventId, vendors: { some: { vendorId } } },
      include: {
        room: { select: { id: true, name: true } },
        functions: { include: functionInclude },
        tables: { orderBy: { sortOrder: "asc" } },
        equipmentItems: { include: equipmentItemInclude, orderBy: { sortOrder: "asc" } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  if (!vendor) return null;

  const relevantModelTypes: ModelType[] = [
    ...(cateringOrders.length > 0 ? (["CATERING_ORDER"] as const) : []),
    ...(avOrders.length > 0 ? (["AV_ORDER"] as const) : []),
    ...(setupOrders.length > 0 ? (["SETUP_ORDER"] as const) : []),
  ];

  const keyStaff =
    relevantModelTypes.length > 0
      ? await prisma.eventKeyStaff.findMany({
          where: { eventId, models: { hasSome: relevantModelTypes } },
          include: {
            contact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
          },
          orderBy: { sortOrder: "asc" },
        })
      : [];

  return { vendor, cateringOrders, avOrders, setupOrders, keyStaff };
}
