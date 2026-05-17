"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { ModelType } from "@/app/vendors/actions";
import { resolveOptionLabel } from "@/lib/optionUtils";
import { getDateKeyInTimezone } from "@/lib/agendaUtils";
import { compareRoomsByGroup } from "@/lib/roomGroups";
import { formatBreakoutSessionName } from "@/lib/breakoutLabels";

export type EquipmentReportFilters = {
  vendorIds?: string[];
  modelTypes?: string[];
};

export type EquipmentSourceRef = {
  orderId: string;
  orderName: string;
  functionType: string;
  functionTypeLabel: string | null;
  functionGroupName: string | null;
  functionNames: string[];
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
  functionType: string;
  functionGroupName: string | null;
  functionNames: string[];
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

type FunctionRef = {
  name: string;
  type: string;
  breakoutGroup: { name: string } | null;
  schedules: { startTime: Date; endTime: Date }[];
};

type OrderRef = {
  functionLinks: Array<{ function: FunctionRef }>;
  presentationLinks?: Array<{ presentation: { slots: Array<{ function: FunctionRef }> } }>;
};

function getOrderFns(order: OrderRef): FunctionRef[] {
  const fromLinks = order.functionLinks.map((l) => l.function);
  if (fromLinks.length > 0) return fromLinks;
  return order.presentationLinks?.flatMap((pl) => pl.presentation.slots.map((s) => s.function)) ?? [];
}

// Expands one item into one NormalizedItem per linked function.
// When the same order is applied to N functions, each function is an independent
// use of the equipment — contributing to both total qty and peak scheduling.
// If no functions are linked, falls back to one unscheduled item.
function expandByFunction(
  base: Omit<NormalizedItem, "functionType" | "functionGroupName" | "functionNames" | "scheduleWindows">,
  fns: FunctionRef[]
): NormalizedItem[] {
  if (fns.length === 0) return [{ ...base, functionType: "", functionGroupName: null, functionNames: [], scheduleWindows: [] }];
  return fns.map((fn) => ({
    ...base,
    functionType: fn.type,
    functionGroupName: fn.breakoutGroup?.name ?? null,
    functionNames: [fn.name],
    scheduleWindows: extractWindows([fn]),
  }));
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
  const [equipmentItems, inputItems, monitorMixes, setupTables, functionTypeOptions] = await Promise.all([
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
            function: { select: { name: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } },
          },
        },
        setupOrder: {
          select: {
            id: true,
            name: true,
            functionLinks: { select: { function: { select: { name: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } } } },
            presentationLinks: { select: { presentation: { select: { slots: { select: { function: { select: { name: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } } } } } } } },
          },
        },
        avOrder: {
          select: {
            id: true,
            name: true,
            functionLinks: { select: { function: { select: { name: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } } } },
            presentationLinks: { select: { presentation: { select: { slots: { select: { function: { select: { name: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } } } } } } } },
          },
        },
        videoSection: {
          select: {
            avOrder: {
              select: {
                id: true,
                name: true,
                functionLinks: { select: { function: { select: { name: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } } } },
                presentationLinks: { select: { presentation: { select: { slots: { select: { function: { select: { name: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } } } } } } } },
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
                    functionLinks: { select: { function: { select: { name: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } } } },
                    presentationLinks: { select: { presentation: { select: { slots: { select: { function: { select: { name: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } } } } } } } },
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
                functionLinks: { select: { function: { select: { name: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } } } },
                presentationLinks: { select: { presentation: { select: { slots: { select: { function: { select: { name: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } } } } } } } },
              },
            },
          },
        },
      },
    }),
    prisma.setupTable.findMany({
      where: { setupOrder: { eventId } },
      include: {
        providerVendor: { select: { id: true, name: true } },
        setupOrder: {
          select: {
            id: true,
            name: true,
            functionLinks: { select: { function: { select: { name: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } } } },
            presentationLinks: { select: { presentation: { select: { slots: { select: { function: { select: { name: true, type: true, breakoutGroup: { select: { name: true } }, schedules: { select: { startTime: true, endTime: true } } } } } } } } } },
          },
        },
      },
    }),
    prisma.customOption.findMany({ where: { category: "function_type" }, select: { label: true } }),
  ]);

  const normalized: NormalizedItem[] = [];

  for (const item of equipmentItems) {
    const attrVendor = item.providerVendor;
    const attrContact = item.providerContact;
    let orderId: string;
    let orderName: string;
    let modelType: "AV_ORDER" | "CATERING_ORDER" | "SETUP_ORDER";
    let fns: FunctionRef[];

    if (item.cateringOrder) {
      orderId = item.cateringOrder.id;
      orderName = item.cateringOrder.name;
      modelType = "CATERING_ORDER";
      fns = item.cateringOrder.function ? [item.cateringOrder.function] : [];
    } else if (item.setupOrder) {
      orderId = item.setupOrder.id;
      orderName = item.setupOrder.name ?? "";
      modelType = "SETUP_ORDER";
      fns = getOrderFns(item.setupOrder);
    } else if (item.avOrder) {
      orderId = item.avOrder.id;
      orderName = item.avOrder.name ?? "";
      modelType = "AV_ORDER";
      fns = getOrderFns(item.avOrder);
    } else if (item.videoSection?.avOrder) {
      orderId = item.videoSection.avOrder.id;
      orderName = item.videoSection.avOrder.name ?? "";
      modelType = "AV_ORDER";
      fns = getOrderFns(item.videoSection.avOrder);
    } else {
      continue;
    }

    const base = {
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
    };
    normalized.push(...expandByFunction(base, fns));
  }

  for (const item of inputItems) {
    const avOrder = item.inputGroup.audioSection.avOrder;
    const attrVendor = item.providerVendor;
    const attrContact = item.providerContact;
    const base = {
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
      orderName: avOrder.name ?? "",
      modelType: "AV_ORDER" as const,
    };
    normalized.push(...expandByFunction(base, getOrderFns(avOrder)));
  }

  for (const item of monitorMixes) {
    const avOrder = item.audioSection.avOrder;
    const attrVendor = item.providerVendor;
    const attrContact = item.providerContact;
    const base = {
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
      orderName: avOrder.name ?? "",
      modelType: "AV_ORDER" as const,
    };
    normalized.push(...expandByFunction(base, getOrderFns(avOrder)));
  }

  for (const table of setupTables) {
    const attrVendor = table.providerVendor;
    const fns = getOrderFns(table.setupOrder);
    const baseAttrs = {
      attributionVendorId: attrVendor?.id ?? null,
      attributionVendorName: attrVendor?.name ?? null,
      attributionContactId: null,
      attributionContactName: null,
      orderId: table.setupOrderId,
      orderName: table.setupOrder.name ?? "",
      modelType: "SETUP_ORDER" as const,
    };

    if (table.tableType && table.quantity > 0) {
      const key = `table:${table.tableType.toLowerCase()}`;
      normalized.push(...expandByFunction({
        equipmentId: null,
        equipmentKey: key,
        itemName: table.tableType,
        category: "Tables",
        ...baseAttrs,
        quantity: table.quantity,
      }, fns));
    }

    if (table.chairCount && table.chairCount > 0) {
      const chairLabel = table.chairType || "Chairs";
      const key = `chair:${chairLabel.toLowerCase()}`;
      const totalChairs = table.quantity > 0 ? table.quantity * table.chairCount : table.chairCount;
      normalized.push(...expandByFunction({
        equipmentId: null,
        equipmentKey: key,
        itemName: chairLabel,
        category: "Chairs",
        ...baseAttrs,
        quantity: totalChairs,
      }, fns));
    }
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
        functionType: item.functionType,
        functionTypeLabel: null,
        functionGroupName: item.functionGroupName,
        functionNames: item.functionNames,
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
      // Two groupings from the same pass:
      // - displayMap (by function type+group): sum qty per type/track for display
      // - peakMap (by orderId+functionSlot): sum concurrent items within the same
      //   order+function (e.g. Secretary Mic + Bishop Mic both active at Plenary 1),
      //   then sweep-line across slots for true peak
      const displayMap = new Map<string, {
        displayQty: number;
        isScheduled: boolean;
        source: EquipmentSourceRef;
      }>();
      const peakMap = new Map<string, {
        peakQty: number;
        windowKeys: Set<string>;
        windows: { start: Date; end: Date }[];
      }>();
      let totalQuantity = 0;

      for (const s of eqData.sources) {
        totalQuantity += s.quantity;

        // Display grouping by function type + breakout group; fall back to orderId for untyped functions
        const displayKey = s.source.functionType === "BREAKOUT_BLOCK"
          ? `breakout::${s.source.functionGroupName ?? ""}`
          : s.source.functionType
            ? `type::${s.source.functionType}`
            : `order::${s.source.orderId}`;
        const disp = displayMap.get(displayKey);
        if (!disp) {
          displayMap.set(displayKey, {
            displayQty: s.quantity,
            isScheduled: s.source.isScheduled,
            source: { ...s.source },
          });
        } else {
          disp.displayQty += s.quantity;
          disp.isScheduled = disp.isScheduled || s.source.isScheduled;
        }

        // Peak grouping by (orderId, functionSlot): items from the same order running
        // at the same function are concurrent and must be summed, not maxed
        const fnSlot = s.source.functionNames[0] ?? "__none__";
        const peakKey = `${s.source.orderId}::${fnSlot}`;
        const pk = peakMap.get(peakKey);
        if (!pk) {
          const windowKeys = new Set(s.windows.map((w) => `${w.start.getTime()},${w.end.getTime()}`));
          peakMap.set(peakKey, { peakQty: s.quantity, windowKeys, windows: [...s.windows] });
        } else {
          pk.peakQty += s.quantity;
          for (const w of s.windows) {
            const wKey = `${w.start.getTime()},${w.end.getTime()}`;
            if (!pk.windowKeys.has(wKey)) {
              pk.windowKeys.add(wKey);
              pk.windows.push(w);
            }
          }
        }
      }

      const { peak, isExact } = calculatePeak(
        Array.from(peakMap.values()).map((e) => ({ quantity: e.peakQty, windows: e.windows }))
      );

      rows.push({
        equipmentId: eqData.equipmentId,
        itemName: eqData.itemName,
        category: eqData.category,
        totalQuantity,
        peakNeeded: peak,
        peakIsExact: isExact,
        sources: Array.from(displayMap.values()).map((d) => ({
          ...d.source,
          quantity: d.displayQty,
          isScheduled: d.isScheduled,
          functionTypeLabel: d.source.functionType === "BREAKOUT_BLOCK"
            ? null
            : (resolveOptionLabel(d.source.functionType, functionTypeOptions) || null),
        })),
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

// ─── Event Profile Report ─────────────────────────────────────────────────────

export type EventProfileFilters = {
  days?: string[]; // YYYY-MM-DD keys in event timezone
  types?: string[]; // FunctionSchedule.type labels to keep
};

function functionMatchesDays(
  schedules: { startTime: Date }[],
  dayKeys: Set<string>,
  timezone: string
): boolean {
  if (schedules.length === 0) return false;
  return schedules.some((s) => dayKeys.has(getDateKeyInTimezone(s.startTime, timezone)));
}

export async function getEventProfileData(
  eventId: string,
  opts: EventProfileFilters = {}
) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      venue: {
        include: {
          contacts: {
            include: {
              contact: {
                select: { id: true, firstName: true, lastName: true, email: true, phone: true, organization: true },
              },
            },
            orderBy: { id: "asc" },
          },
        },
      },
    },
  });
  if (!event) return null;

  const timezone = event.timezone;
  const dayKeys = opts.days && opts.days.length > 0 ? new Set(opts.days) : null;
  const typeKeys = opts.types && opts.types.length > 0 ? new Set(opts.types) : null;

  const functionScheduleInclude = {
    schedules: { orderBy: { sortOrder: "asc" as const } },
    rooms: { include: { room: { select: { id: true, name: true } } } },
    contacts: {
      include: {
        contact: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true, organization: true },
        },
      },
      orderBy: { id: "asc" as const },
    },
  };

  const [keyStaff, allFunctions, breakoutGroups, cateringOrders, printOrders, allScheduleItems] = await Promise.all([
    prisma.eventKeyStaff.findMany({
      where: { eventId },
      include: {
        contact: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true, organization: true },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    }),
    prisma.function.findMany({
      where: { eventId, type: { not: "BREAKOUT_BLOCK" } },
      include: functionScheduleInclude,
    }),
    prisma.breakoutGroup.findMany({
      where: { eventId },
      include: {
        rooms: { include: { room: { select: { id: true, name: true } } } },
        functions: {
          where: { type: "BREAKOUT_BLOCK" },
          include: {
            schedules: { orderBy: { sortOrder: "asc" } },
            sessionRoomOverrides: true,
            presentationSlots: {
              include: {
                presentation: {
                  include: {
                    speakers: {
                      include: {
                        contact: {
                          select: { id: true, firstName: true, lastName: true },
                        },
                      },
                      orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
                    },
                  },
                },
                room: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.cateringOrder.findMany({
      where: { eventId },
      include: {
        function: { include: functionScheduleInclude },
        menuSections: {
          include: { responsiblePartyVendor: { select: { id: true, name: true } } },
          orderBy: { sortOrder: "asc" },
        },
        vendors: {
          include: { vendor: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.printOrder.findMany({
      where: { eventId },
      include: {
        vendors: { include: { vendor: { select: { id: true, name: true } } } },
        functions: { include: { function: { select: { id: true, name: true } } } },
        presentation: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.functionSchedule.findMany({
      where: { function: { eventId, type: { not: "BREAKOUT_BLOCK" } } },
      include: {
        function: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
            substatus: true,
            offSiteLocation: true,
            rooms: { include: { room: { select: { id: true, name: true } } } },
          },
        },
      },
      orderBy: { startTime: "asc" },
    }),
  ]);

  const filteredFunctions = dayKeys
    ? allFunctions.filter((fn) => functionMatchesDays(fn.schedules, dayKeys, timezone))
    : allFunctions;

  const filteredBreakoutGroups = dayKeys
    ? breakoutGroups
        .map((g) => ({
          ...g,
          functions: g.functions.filter((fn) => functionMatchesDays(fn.schedules, dayKeys, timezone)),
        }))
        .filter((g) => g.functions.length > 0)
    : breakoutGroups.filter((g) => g.functions.length > 0);

  const filteredCateringOrders = dayKeys
    ? cateringOrders.filter((c) =>
        c.function ? functionMatchesDays(c.function.schedules, dayKeys, timezone) : false
      )
    : cateringOrders;

  const filteredScheduleItems = allScheduleItems.filter((item) => {
    if (dayKeys && !dayKeys.has(getDateKeyInTimezone(item.startTime, timezone))) return false;
    if (typeKeys && !typeKeys.has(item.type)) return false;
    return true;
  });

  return {
    event,
    venue: event.venue,
    keyStaff,
    functions: filteredFunctions,
    breakoutGroups: filteredBreakoutGroups,
    cateringOrders: filteredCateringOrders,
    printOrders,
    scheduleItems: filteredScheduleItems,
    timezone,
  };
}

export type EventProfileData = NonNullable<Awaited<ReturnType<typeof getEventProfileData>>>;

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
  breakoutGroup: { select: { name: true } },
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
        functionLinks: { include: { function: { include: functionInclude } } },
        presentationLinks: {
          include: {
            presentation: {
              select: {
                id: true,
                title: true,
                slots: {
                  include: {
                    function: { include: functionInclude },
                    room: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
        audioSection: {
          include: {
            inputGroups: {
              include: {
                ...partySelect,
                inputItems: {
                  include: {
                    equipment: { select: { id: true, name: true, category: true } },
                    ...partySelect,
                  },
                  orderBy: { sortOrder: "asc" },
                },
              },
              orderBy: { sortOrder: "asc" },
            },
            monitorMixes: {
              include: {
                equipment: { select: { id: true, name: true, category: true } },
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
        functionLinks: { include: { function: { include: functionInclude } } },
        presentationLinks: {
          include: {
            presentation: {
              select: {
                id: true,
                title: true,
                slots: {
                  include: {
                    function: { include: functionInclude },
                    room: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        },
        tables: {
          include: { providerVendor: { select: { id: true, name: true } } },
          orderBy: { sortOrder: "asc" },
        },
        details: {
          include: { responsiblePartyVendor: { select: { id: true, name: true } } },
          orderBy: { sortOrder: "asc" },
        },
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

  const avOrdersShaped = avOrders.map((o) => ({
    ...o,
    functions: o.functionLinks.map((l) => l.function),
    presentations: o.presentationLinks.map((l) => l.presentation),
  }));
  const setupOrdersShaped = setupOrders.map((o) => ({
    ...o,
    functions: o.functionLinks.map((l) => l.function),
    presentations: o.presentationLinks.map((l) => l.presentation),
  }));

  return {
    vendor,
    cateringOrders,
    avOrders: avOrdersShaped,
    setupOrders: setupOrdersShaped,
    keyStaff,
  };
}

// ── Room Schedule report ──────────────────────────────────────────────────────

export type RoomScheduleFilters = {
  roomIds?: string[];
  days?: string[];
};

export async function getRoomScheduleData(eventId: string, opts: RoomScheduleFilters = {}) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, timezone: true },
  });
  if (!event) return null;

  const timezone = event.timezone;
  const dayKeys = opts.days && opts.days.length > 0 ? new Set(opts.days) : null;
  const roomIdFilter = opts.roomIds && opts.roomIds.length > 0 ? new Set(opts.roomIds) : null;

  const [rooms, allFunctions] = await Promise.all([
    prisma.room.findMany({
      where: {
        OR: [
          { functions: { some: { function: { eventId } } } },
          { presentationSlots: { some: { function: { eventId } } } },
        ],
      },
      include: {
        venue: { select: { id: true, name: true } },
        group: { select: { id: true, name: true, sortOrder: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.function.findMany({
      where: { eventId },
      include: {
        schedules: { orderBy: { sortOrder: "asc" } },
        rooms: { include: { room: { select: { id: true, name: true } } } },
        breakoutGroup: { select: { name: true } },
        contacts: {
          include: {
            contact: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { id: "asc" },
        },
        presentationSlots: {
          include: {
            presentation: {
              include: {
                speakers: {
                  include: {
                    contact: { select: { id: true, firstName: true, lastName: true } },
                  },
                  orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
                },
              },
            },
            room: { select: { id: true, name: true } },
          },
        },
      },
    }),
  ]);

  const functions = dayKeys
    ? allFunctions.filter((fn) => functionMatchesDays(fn.schedules, dayKeys, timezone))
    : allFunctions;

  rooms.sort((a, b) => {
    const va = a.venue?.name ?? "";
    const vb = b.venue?.name ?? "";
    if (va !== vb) return va.localeCompare(vb);
    return compareRoomsByGroup(a, b);
  });

  const filteredRooms = roomIdFilter ? rooms.filter((r) => roomIdFilter.has(r.id)) : rooms;

  const roomBuckets = filteredRooms.map((room) => {
    const regularFunctions = functions.filter(
      (fn) => fn.type !== "BREAKOUT_BLOCK" && fn.rooms.some((r) => r.roomId === room.id)
    );

    const breakoutEntries = functions
      .filter((fn) => fn.type === "BREAKOUT_BLOCK")
      .flatMap((block) =>
        block.presentationSlots
          .filter((slot) => slot.roomId === room.id)
          .map((slot) => ({ block, slot }))
      );

    return { room, regularFunctions, breakoutEntries };
  });

  return {
    timezone,
    rooms,
    roomBuckets,
  };
}

export type RoomScheduleData = NonNullable<Awaited<ReturnType<typeof getRoomScheduleData>>>;

// ── Function Detail report ───────────────────────────────────────────────────

export type FunctionDetailFilters = {
  functionIds?: string[];
};

const fdVendorSelect = { select: { id: true, name: true } } satisfies Prisma.VendorDefaultArgs;
const fdContactSelect = { select: { id: true, firstName: true, lastName: true } } satisfies Prisma.ContactDefaultArgs;

const fdPartyInclude = {
  providerVendor: fdVendorSelect,
  providerContact: fdContactSelect,
  operatorVendor: fdVendorSelect,
  operatorContact: fdContactSelect,
};

const fdEquipmentItemInclude = {
  equipment: { select: { id: true, name: true, category: true } },
  ...fdPartyInclude,
} satisfies Prisma.EquipmentItemInclude;

const fdAVOrderInclude = {
  vendors: { include: { vendor: fdVendorSelect } },
  audioSection: {
    include: {
      inputGroups: {
        include: {
          ...fdPartyInclude,
          inputItems: {
            include: {
              equipment: { select: { id: true, name: true, category: true } },
              ...fdPartyInclude,
            },
            orderBy: { sortOrder: "asc" },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
      monitorMixes: {
        include: {
          equipment: { select: { id: true, name: true, category: true } },
          ...fdPartyInclude,
          monitorOutputs: {
            include: {
              equipment: { select: { id: true, name: true, category: true } },
              ...fdPartyInclude,
            },
            orderBy: { sortOrder: "asc" },
          },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  },
  videoSection: {
    include: {
      equipmentItems: { include: fdEquipmentItemInclude, orderBy: { sortOrder: "asc" } },
    },
  },
  equipmentItems: { include: fdEquipmentItemInclude, orderBy: { sortOrder: "asc" } },
} satisfies Prisma.AVOrderInclude;

const fdSetupOrderInclude = {
  room: { select: { id: true, name: true } },
  vendors: { include: { vendor: fdVendorSelect } },
  tables: {
    include: { providerVendor: fdVendorSelect },
    orderBy: { sortOrder: "asc" },
  },
  details: {
    include: { responsiblePartyVendor: fdVendorSelect },
    orderBy: { sortOrder: "asc" },
  },
  equipmentItems: { include: fdEquipmentItemInclude, orderBy: { sortOrder: "asc" } },
} satisfies Prisma.SetupOrderInclude;

const fdPrintOrderInclude = {
  vendors: { include: { vendor: fdVendorSelect } },
  items: {
    include: {
      designerVendor: fdVendorSelect,
      designerContact: fdContactSelect,
      printerVendor: fdVendorSelect,
      printerContact: fdContactSelect,
    },
    orderBy: { sortOrder: "asc" },
  },
} satisfies Prisma.PrintOrderInclude;

const fdMediaOrderInclude = {
  vendors: { include: { vendor: fdVendorSelect } },
  items: {
    include: {
      advancerVendor: fdVendorSelect,
      advancerContact: fdContactSelect,
    },
    orderBy: { sortOrder: "asc" },
  },
} satisfies Prisma.MediaOrderInclude;

const fdCateringOrderInclude = {
  vendors: { include: { vendor: fdVendorSelect } },
  lineItems: { orderBy: { sortOrder: "asc" } },
  menuSections: {
    include: { responsiblePartyVendor: fdVendorSelect },
    orderBy: { sortOrder: "asc" },
  },
  equipmentItems: { include: fdEquipmentItemInclude, orderBy: { sortOrder: "asc" } },
  timelineItems: { orderBy: { sortOrder: "asc" } },
  contacts: {
    include: {
      contact: {
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, organization: true },
      },
    },
    orderBy: { id: "asc" },
  },
} satisfies Prisma.CateringOrderInclude;

const fdFunctionInclude = {
  breakoutGroup: { select: { id: true, name: true } },
  rooms: {
    include: {
      room: {
        select: {
          id: true,
          name: true,
          group: { select: { id: true, name: true, sortOrder: true } },
        },
      },
    },
  },
  schedules: { orderBy: { sortOrder: "asc" } },
  contacts: {
    include: {
      contact: {
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, organization: true },
      },
    },
    orderBy: { id: "asc" },
  },
  cateringOrder: { include: fdCateringOrderInclude },
  avOrderFunctions: { include: { avOrder: { include: fdAVOrderInclude } } },
  setupOrderFunctions: { include: { setupOrder: { include: fdSetupOrderInclude } } },
  printOrderFunctions: { include: { printOrder: { include: fdPrintOrderInclude } } },
  mediaOrderFunctions: { include: { mediaOrder: { include: fdMediaOrderInclude } } },
  presentationSlots: {
    include: {
      room: { select: { id: true, name: true } },
      presentation: {
        include: {
          track: { select: { id: true, name: true, color: true } },
          speakers: {
            include: {
              contact: {
                select: { id: true, firstName: true, lastName: true, email: true, phone: true, organization: true },
              },
            },
            orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
          },
          avOrderLinks: { include: { avOrder: { include: fdAVOrderInclude } } },
          setupOrderLinks: { include: { setupOrder: { include: fdSetupOrderInclude } } },
          printOrder: { include: fdPrintOrderInclude },
          mediaOrderLinks: { include: { mediaOrder: { include: fdMediaOrderInclude } } },
        },
      },
    },
    orderBy: { id: "asc" },
  },
} satisfies Prisma.FunctionInclude;

function earliestScheduleTime(schedules: { startTime: Date }[]): number {
  if (schedules.length === 0) return Number.MAX_SAFE_INTEGER;
  return Math.min(...schedules.map((s) => s.startTime.getTime()));
}

export async function getFunctionDetailData(
  eventId: string,
  filters?: FunctionDetailFilters
) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, name: true, timezone: true },
  });
  if (!event) return null;

  const idFilter = filters?.functionIds?.length ? { id: { in: filters.functionIds } } : {};

  const functions = await prisma.function.findMany({
    where: { eventId, ...idFilter },
    include: fdFunctionInclude,
  });

  functions.sort((a, b) => {
    const ea = earliestScheduleTime(a.schedules);
    const eb = earliestScheduleTime(b.schedules);
    if (ea !== eb) return ea - eb;
    return a.name.localeCompare(b.name);
  });

  const functionIds = functions.map((f) => f.id);
  const workflowInstances =
    functionIds.length > 0
      ? await prisma.workflowInstance.findMany({
          where: { entityType: "function", entityId: { in: functionIds } },
          include: {
            template: {
              include: { steps: { orderBy: { sortOrder: "asc" } } },
            },
            stepCompletions: { include: { step: true } },
            itemCompletions: { include: { item: true } },
          },
        })
      : [];

  const workflowsByFunctionId = new Map<string, typeof workflowInstances>();
  for (const wi of workflowInstances) {
    const list = workflowsByFunctionId.get(wi.entityId) ?? [];
    list.push(wi);
    workflowsByFunctionId.set(wi.entityId, list);
  }

  type FunctionWithWorkflows = (typeof functions)[number] & {
    workflowInstances: typeof workflowInstances;
  };

  const functionsWithWorkflows: FunctionWithWorkflows[] = functions.map((fn) => ({
    ...fn,
    workflowInstances: workflowsByFunctionId.get(fn.id) ?? [],
  }));

  return { event, functions: functionsWithWorkflows };
}

export type FunctionDetailData = NonNullable<Awaited<ReturnType<typeof getFunctionDetailData>>>;
export type FunctionDetailFunction = FunctionDetailData["functions"][number];

export type FunctionPickerOption = {
  value: string;
  label: string;
  typeValue: string | null;
  typeLabel: string;
  typeSortOrder: number;
  firstStart: Date | null;
};

export async function getFunctionPickerOptions(eventId: string): Promise<FunctionPickerOption[]> {
  const [functions, typeOptions] = await Promise.all([
    prisma.function.findMany({
      where: { eventId },
      select: {
        id: true,
        name: true,
        type: true,
        breakoutGroup: { select: { name: true } },
        schedules: { select: { startTime: true }, orderBy: { startTime: "asc" }, take: 1 },
      },
    }),
    prisma.customOption.findMany({
      where: { category: "function_type" },
      select: { label: true, sortOrder: true },
    }),
  ]);

  const typeMap = new Map(typeOptions.map((o) => [o.label, o]));

  const options = functions.map((fn) => {
    const typeValue = fn.type || null;
    const typeMeta = typeValue ? typeMap.get(typeValue) : null;
    const typeLabel = typeValue ? resolveOptionLabel(typeValue, typeOptions) || typeValue : "Untyped";
    return {
      value: fn.id,
      label: formatBreakoutSessionName(fn.name, fn.breakoutGroup?.name),
      typeValue,
      typeLabel,
      typeSortOrder: typeMeta?.sortOrder ?? Number.MAX_SAFE_INTEGER,
      firstStart: fn.schedules[0]?.startTime ?? null,
    };
  });

  options.sort((a, b) => {
    const sa = a.firstStart?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const sb = b.firstStart?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    return a.label.localeCompare(b.label);
  });

  return options;
}

// ── Breakout Schedule reports (Grid + Assignments) ────────────────────────────

export type BreakoutScheduleFilters = {
  groupIds?: string[];
};

export async function getBreakoutScheduleData(
  eventId: string,
  opts: BreakoutScheduleFilters = {}
) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, timezone: true },
  });
  if (!event) return null;

  const groupIdFilter =
    opts.groupIds && opts.groupIds.length > 0 ? { in: opts.groupIds } : undefined;

  const groups = await prisma.breakoutGroup.findMany({
    where: { eventId, ...(groupIdFilter ? { id: groupIdFilter } : {}) },
    include: {
      rooms: { include: { room: true }, orderBy: { id: "asc" } },
      functions: {
        where: { type: "BREAKOUT_BLOCK" },
        include: {
          schedules: { orderBy: { startTime: "asc" } },
          rooms: { include: { room: true }, orderBy: { id: "asc" } },
          sessionRoomOverrides: true,
          presentationSlots: {
            include: {
              presentation: {
                include: {
                  speakers: {
                    include: {
                      contact: { select: { id: true, firstName: true, lastName: true } },
                    },
                    orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
                  },
                },
              },
              room: true,
            },
          },
        },
      },
      presentations: {
        include: {
          slots: { include: { room: true } },
          track: true,
          speakers: {
            include: {
              contact: { select: { id: true, firstName: true, lastName: true } },
            },
            orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
          },
        },
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  for (const group of groups) {
    group.functions.sort((a, b) => {
      const aTime = a.schedules[0]?.startTime.getTime() ?? Infinity;
      const bTime = b.schedules[0]?.startTime.getTime() ?? Infinity;
      return aTime - bTime;
    });
    group.presentations.sort((a, b) => a.title.localeCompare(b.title));
  }

  return {
    timezone: event.timezone,
    groups,
  };
}

export type BreakoutScheduleData = NonNullable<
  Awaited<ReturnType<typeof getBreakoutScheduleData>>
>;
export type BreakoutScheduleGroup = BreakoutScheduleData["groups"][number];

export async function getBreakoutGroupOptions(eventId: string) {
  return prisma.breakoutGroup.findMany({
    where: { eventId },
    select: { id: true, name: true },
    orderBy: { sortOrder: "asc" },
  });
}
