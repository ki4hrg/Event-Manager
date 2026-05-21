import type { getVendorHandoffData } from "@/app/events/reports/actions";
import type { getEvent } from "@/app/events/actions";
import { formatTime, formatDateHeading } from "@/lib/agendaUtils";
import { resolveOptionLabel } from "@/lib/optionUtils";
import { formatBreakoutSessionName } from "@/lib/breakoutLabels";
import { cateringRelationshipLabel, computeServiceLocationCounts, type CateringRelationship } from "@/lib/cateringServiceLocations";
import { firmestGuestCount } from "@/lib/cateringGuestCount";
import { formatPhone } from "@/lib/format-phone";
import {
  reportTh as th,
  reportTd as td,
  reportSectionCard as sectionCard,
  reportOrderCard as orderCard,
} from "@/lib/reportStyles";
import { ReportNav } from "@/components/ReportNav";
import { SectionDivider } from "@/components/SectionDivider";
import { LastUpdated } from "@/components/LastUpdated";

type HandoffData = NonNullable<Awaited<ReturnType<typeof getVendorHandoffData>>>;
type Event = NonNullable<Awaited<ReturnType<typeof getEvent>>>;
type AudioInputItem = NonNullable<HandoffData["avOrders"][number]["audioSection"]>["inputGroups"][number]["inputItems"][number];

type EquipmentItem = {
  id: string;
  item: string;
  quantity: number | null;
  equipment: { id: string; name: string; category: string | null } | null;
  providerVendor: { id: string; name: string } | null;
  providerContact: { id: string; firstName: string; lastName: string } | null;
  operatorVendor: { id: string; name: string } | null;
  operatorContact: { id: string; firstName: string; lastName: string } | null;
  notes: string | null;
};

type CateringOrder = HandoffData["cateringOrders"][number];
type AVOrder = HandoffData["avOrders"][number];
type SetupOrder = HandoffData["setupOrders"][number];
type AnyFn = NonNullable<CateringOrder["function"]> | AVOrder["functions"][number];

type CateringEntry = {
  order: CateringOrder;
  relationship: CateringRelationship;
};

type FunctionGroup = {
  fn: AnyFn;
  cateringOrders: CateringEntry[];
  avOrders: AVOrder[];
  setupOrders: SetupOrder[];
  earliestStart: number;
};

type PresentationGroup = {
  presentation: {
    id: string;
    title: string;
    slots: {
      id: string;
      function: AnyFn;
      room: { id: string; name: string } | null;
    }[];
  };
  avOrders: AVOrder[];
  setupOrders: SetupOrder[];
  earliestStart: number;
};

type UnscheduledGroup = {
  cateringOrders: CateringEntry[];
  avOrders: AVOrder[];
  setupOrders: SetupOrder[];
};

function partyName(
  vendor: { name: string } | null | undefined,
  contact: { firstName: string; lastName: string } | null | undefined
): string {
  if (vendor) return vendor.name;
  if (contact) return `${contact.firstName} ${contact.lastName}`;
  return "—";
}

function vendorRole(
  providerVendor: { id: string } | null | undefined,
  operatorVendor: { id: string } | null | undefined,
  vendorId: string
): string {
  const isProvider = providerVendor?.id === vendorId;
  const isOperator = operatorVendor?.id === vendorId;
  if (isProvider && isOperator) return "Provider & Operator";
  if (isProvider) return "Provider";
  if (isOperator) return "Operator";
  return "—";
}

function rollUpInputItems(items: AudioInputItem[]) {
  const map = new Map<string, {
    displayName: string;
    quantity: number;
    providerVendor: AudioInputItem["providerVendor"];
    providerContact: AudioInputItem["providerContact"];
    operatorVendor: AudioInputItem["operatorVendor"];
    operatorContact: AudioInputItem["operatorContact"];
    notes: Set<string>;
  }>();

  for (const item of items) {
    const displayName = item.equipment?.name ?? item.description;
    const providerKey = item.providerVendor?.id ?? item.providerContact?.id ?? "";
    const operatorKey = item.operatorVendor?.id ?? item.operatorContact?.id ?? "";
    const key = `${displayName}\0${providerKey}\0${operatorKey}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += item.quantity;
      if (item.notes) existing.notes.add(item.notes);
    } else {
      map.set(key, {
        displayName,
        quantity: item.quantity,
        providerVendor: item.providerVendor,
        providerContact: item.providerContact,
        operatorVendor: item.operatorVendor,
        operatorContact: item.operatorContact,
        notes: new Set(item.notes ? [item.notes] : []),
      });
    }
  }

  return Array.from(map.values()).map((row) => ({ ...row, notes: Array.from(row.notes).join("; ") }));
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 print:text-gray-900 uppercase tracking-wide mb-2 mt-6 first:mt-0">
      {children}
    </h3>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 print:text-gray-700 uppercase tracking-wide mb-1 mt-4">
      {children}
    </h4>
  );
}

function EquipmentTable({ items, vendorId, filterByVendor = true }: { items: EquipmentItem[]; vendorId: string; filterByVendor?: boolean }) {
  const relevant = filterByVendor
    ? items.filter((item) => item.providerVendor?.id === vendorId || item.operatorVendor?.id === vendorId)
    : items;
  if (relevant.length === 0) return null;
  return (
    <>
      <div className="sm:hidden print:hidden border border-gray-200 dark:border-gray-700 rounded divide-y divide-gray-200 dark:divide-gray-700 text-xs">
        {relevant.map((item) => (
          <div key={item.id} className="p-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-gray-900 dark:text-white">{item.item}</span>
              <span className="shrink-0 text-gray-500 dark:text-gray-400">Qty {item.quantity ?? 1}</span>
            </div>
            {item.equipment?.name && (
              <p className="text-gray-600 dark:text-gray-400 mt-0.5">{item.equipment.name}</p>
            )}
            <p className="text-gray-600 dark:text-gray-400 mt-0.5">{vendorRole(item.providerVendor, item.operatorVendor, vendorId)}</p>
            <div className="mt-1 text-gray-500 dark:text-gray-400 space-y-0.5">
              <p>Provider: <span className="text-gray-700 dark:text-gray-300">{partyName(item.providerVendor, item.providerContact)}</span></p>
              <p>Operator: <span className="text-gray-700 dark:text-gray-300">{partyName(item.operatorVendor, item.operatorContact)}</span></p>
            </div>
            {item.notes && <p className="text-gray-500 dark:text-gray-500 italic mt-1">{item.notes}</p>}
          </div>
        ))}
      </div>
      <div className="hidden sm:block print:block overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className={th}>Item</th>
              <th className={th}>Equipment</th>
              <th className={th}>Qty</th>
              <th className={th}>Role</th>
              <th className={th}>Provider</th>
              <th className={th}>Operator</th>
              <th className={th}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {relevant.map((item) => (
              <tr key={item.id}>
                <td className={td}>{item.item}</td>
                <td className={td}>{item.equipment?.name ?? "—"}</td>
                <td className={td}>{item.quantity ?? 1}</td>
                <td className={td}>{vendorRole(item.providerVendor, item.operatorVendor, vendorId)}</td>
                <td className={td}>{partyName(item.providerVendor, item.providerContact)}</td>
                <td className={td}>{partyName(item.operatorVendor, item.operatorContact)}</td>
                <td className={td}>{item.notes ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function buildFunctionGroups(data: HandoffData): { groups: FunctionGroup[]; presentationGroups: PresentationGroup[]; unscheduled: UnscheduledGroup } {
  const groupMap = new Map<string, FunctionGroup>();
  const presentationGroupMap = new Map<string, PresentationGroup>();
  const unscheduled: UnscheduledGroup = { cateringOrders: [], avOrders: [], setupOrders: [] };

  function getOrCreateGroup(fn: AnyFn): FunctionGroup {
    let group = groupMap.get(fn.id);
    if (!group) {
      const earliest = fn.schedules.length > 0
        ? Math.min(...fn.schedules.map((s) => s.startTime.getTime()))
        : Infinity;
      group = { fn, cateringOrders: [], avOrders: [], setupOrders: [], earliestStart: earliest };
      groupMap.set(fn.id, group);
    }
    return group;
  }

  function getOrCreatePresentationGroup(presentation: PresentationGroup["presentation"]): PresentationGroup {
    let pg = presentationGroupMap.get(presentation.id);
    if (!pg) {
      const earliest = presentation.slots.length > 0
        ? Math.min(...presentation.slots.flatMap((slot) =>
            slot.function.schedules.map((s) => s.startTime.getTime())
          ))
        : Infinity;
      pg = { presentation, avOrders: [], setupOrders: [], earliestStart: earliest };
      presentationGroupMap.set(presentation.id, pg);
    }
    return pg;
  }

  for (const order of data.cateringOrders) {
    const placedFunctionIds = new Set<string>();
    if (order.function) {
      getOrCreateGroup(order.function).cateringOrders.push({ order, relationship: { via: "PRIMARY" } });
      placedFunctionIds.add(order.function.id);
    }
    for (const loc of order.additionalServiceLocations) {
      if (!loc.function || placedFunctionIds.has(loc.function.id)) continue;
      getOrCreateGroup(loc.function).cateringOrders.push({
        order,
        relationship: { via: "ADDITIONAL_LOCATION", locationName: loc.name },
      });
      placedFunctionIds.add(loc.function.id);
    }
    if (placedFunctionIds.size === 0) {
      unscheduled.cateringOrders.push({ order, relationship: { via: "PRIMARY" } });
    }
  }
  for (const order of data.avOrders) {
    if (order.functions.length > 0) {
      for (const fn of order.functions) getOrCreateGroup(fn).avOrders.push(order);
    } else if (order.presentations.length > 0) {
      for (const p of order.presentations) getOrCreatePresentationGroup(p).avOrders.push(order);
    } else {
      unscheduled.avOrders.push(order);
    }
  }
  for (const order of data.setupOrders) {
    if (order.functions.length > 0) {
      for (const fn of order.functions) getOrCreateGroup(fn).setupOrders.push(order);
    } else if (order.presentations.length > 0) {
      for (const p of order.presentations) getOrCreatePresentationGroup(p).setupOrders.push(order);
    } else {
      unscheduled.setupOrders.push(order);
    }
  }

  const groups = Array.from(groupMap.values()).sort((a, b) => a.earliestStart - b.earliestStart);
  const presentationGroups = Array.from(presentationGroupMap.values()).sort((a, b) => a.earliestStart - b.earliestStart);
  return { groups, presentationGroups, unscheduled };
}

type EquipmentSummaryRow = { itemName: string; category: string | null; quantity: number; providerName: string; role: string };

function buildEquipmentSummary(data: HandoffData, vendorId: string): EquipmentSummaryRow[] {
  const map = new Map<string, EquipmentSummaryRow>();

  const addRow = (
    itemName: string,
    category: string | null,
    qty: number,
    providerVendor: { id: string; name: string } | null | undefined,
    providerContact: { id: string; firstName: string; lastName: string } | null | undefined,
    operatorVendor: { id: string; name: string } | null | undefined,
  ) => {
    const isProvider = providerVendor?.id === vendorId;
    const isOperator = operatorVendor?.id === vendorId;
    if (!isProvider && !isOperator) return;
    const role = isProvider && isOperator ? "Provider & Operator" : isProvider ? "Provider" : "Operator";
    const providerName = providerVendor?.name
      ?? (providerContact ? `${providerContact.firstName} ${providerContact.lastName}` : "—");
    const key = `${itemName.toLowerCase()}\0${role}\0${providerName.toLowerCase()}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity += qty;
      if (category !== null && existing.category === null) existing.category = category;
    } else {
      map.set(key, { itemName, category, quantity: qty, providerName, role });
    }
  };

  const orderVendor = { id: vendorId, name: data.vendor.name };

  const addItems = (items: EquipmentItem[], fallbackVendor?: { id: string; name: string }) => {
    for (const item of items) {
      const providerVendor = item.providerVendor ?? fallbackVendor ?? null;
      addRow(item.equipment?.name ?? item.item, item.equipment?.category ?? null, item.quantity ?? 1, providerVendor, item.providerContact, item.operatorVendor);
    }
  };

  for (const order of data.cateringOrders) addItems(order.equipmentItems, orderVendor);
  for (const order of data.avOrders) {
    addItems(order.equipmentItems);
    if (order.videoSection) addItems(order.videoSection.equipmentItems);
    if (order.audioSection) {
      for (const group of order.audioSection.inputGroups) {
        for (const inputItem of group.inputItems) {
          addRow(inputItem.equipment?.name ?? inputItem.description, inputItem.equipment?.category ?? null, inputItem.quantity, inputItem.providerVendor, inputItem.providerContact, inputItem.operatorVendor);
        }
      }
      for (const mix of order.audioSection.monitorMixes) {
        addRow(mix.equipment?.name ?? mix.description, mix.equipment?.category ?? null, 1, mix.providerVendor, mix.providerContact, mix.operatorVendor);
      }
    }
  }
  for (const order of data.setupOrders) {
    addItems(order.equipmentItems, orderVendor);
    for (const table of order.tables) {
      const tableVendor = table.providerVendor ?? orderVendor;
      if (table.tableType && table.quantity > 0) {
        addRow(table.tableType, "Tables", table.quantity, tableVendor, null, null);
      }
      if (table.chairCount && table.chairCount > 0) {
        const chairLabel = table.chairType || "Chairs";
        const totalChairs = table.quantity > 0 ? table.quantity * table.chairCount : table.chairCount;
        addRow(chairLabel, "Chairs", totalChairs, tableVendor, null, null);
      }
    }
  }

  const SORT_LAST = "￿";
  const ROLE_ORDER: Record<string, number> = { "Provider & Operator": 0, "Provider": 1, "Operator": 2 };
  return Array.from(map.values()).sort((a, b) => {
    const catA = a.category ?? SORT_LAST;
    const catB = b.category ?? SORT_LAST;
    if (catA !== catB) return catA.localeCompare(catB);
    if (a.itemName !== b.itemName) return a.itemName.localeCompare(b.itemName);
    if (a.role !== b.role) return ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
    return a.providerName.localeCompare(b.providerName);
  });
}

function FunctionScheduleSection({
  data,
  timezone,
}: {
  data: HandoffData;
  timezone: string;
}) {
  type ScheduleRow = { fn: AnyFn; schedule: AnyFn["schedules"][number] };

  const allFunctions: AnyFn[] = [];
  const seen = new Set<string>();

  const addFn = (fn: AnyFn | null | undefined) => {
    if (!fn || seen.has(fn.id)) return;
    seen.add(fn.id);
    allFunctions.push(fn);
  };

  for (const order of data.cateringOrders) {
    addFn(order.function);
    for (const loc of order.additionalServiceLocations) addFn(loc.function);
  }
  for (const order of data.avOrders) for (const fn of order.functions) addFn(fn);
  for (const order of data.setupOrders) for (const fn of order.functions) addFn(fn);

  if (allFunctions.length === 0) return null;

  const byDate = new Map<string, ScheduleRow[]>();
  const unscheduled: AnyFn[] = [];
  const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone });

  for (const fn of allFunctions) {
    if (fn.schedules.length === 0) {
      unscheduled.push(fn);
      continue;
    }
    for (const schedule of fn.schedules) {
      const dateKey = dateFormatter.format(schedule.startTime);
      if (!byDate.has(dateKey)) byDate.set(dateKey, []);
      byDate.get(dateKey)!.push({ fn, schedule });
    }
  }

  for (const rows of Array.from(byDate.values())) {
    rows.sort((a, b) => a.schedule.startTime.getTime() - b.schedule.startTime.getTime());
  }

  const sortedDates = Array.from(byDate.keys()).sort();

  return (
    <div className="print:break-inside-avoid">
      {sortedDates.map((dateKey) => {
        const rows = byDate.get(dateKey)!;
        const dateLabel = new Date(dateKey + "T12:00:00Z").toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        });
        const rowData = rows.map(({ fn, schedule }) => ({
          key: `${fn.id}-${schedule.startTime.getTime()}`,
          fnId: fn.id,
          type: schedule.type,
          timeStr: `${formatTime(schedule.startTime, timezone)} – ${formatTime(schedule.endTime, timezone)}`,
          name: formatBreakoutSessionName(fn.name, fn.breakoutGroup?.name),
          rooms: fn.rooms.map((r) => r.room.name).join(", ") || "—",
          notes: schedule.notes ?? "",
        }));
        return (
          <div key={dateKey} className="mb-4">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 print:text-gray-800 mb-1">{dateLabel}</p>
            <div className="sm:hidden border border-gray-200 dark:border-gray-700 rounded divide-y divide-gray-200 dark:divide-gray-700">
              {rowData.map((row) => (
                <div key={row.key} className="p-2 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <a href={`#function-${row.fnId}`} className="font-medium text-blue-600 dark:text-blue-400 hover:underline print:text-gray-900 print:no-underline">{row.name}</a>
                    <span className="shrink-0 text-[10px] font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{row.type}</span>
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 mt-0.5">{row.timeStr}</p>
                  <p className="text-gray-500 dark:text-gray-500">{row.rooms}</p>
                  {row.notes && <p className="text-gray-500 dark:text-gray-500 italic mt-0.5">{row.notes}</p>}
                </div>
              ))}
            </div>
            <div className="hidden sm:block print:block overflow-x-auto">
              <table className="w-full table-fixed text-sm border-collapse">
                <thead>
                  <tr>
                    <th className={`${th} w-[14%]`}>Type</th>
                    <th className={`${th} w-[20%]`}>Time</th>
                    <th className={`${th} w-[28%]`}>Function</th>
                    <th className={`${th} w-[26%]`}>Room(s)</th>
                    <th className={`${th} w-[12%]`}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rowData.map((row) => (
                    <tr key={row.key}>
                      <td className={td}>{row.type}</td>
                      <td className={`${td} whitespace-nowrap`}>{row.timeStr}</td>
                      <td className={td}><a href={`#function-${row.fnId}`} className="text-blue-600 dark:text-blue-400 hover:underline print:text-gray-900 print:no-underline">{row.name}</a></td>
                      <td className={td}>{row.rooms}</td>
                      <td className={td}>{row.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      {unscheduled.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 print:text-gray-800 mb-1">Unscheduled</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className={th}>Function</th>
                  <th className={th}>Room(s)</th>
                </tr>
              </thead>
              <tbody>
                {unscheduled.map((fn) => (
                  <tr key={fn.id}>
                    <td className={td}><a href={`#function-${fn.id}`} className="text-blue-600 dark:text-blue-400 hover:underline print:text-gray-900 print:no-underline">{formatBreakoutSessionName(fn.name, fn.breakoutGroup?.name)}</a></td>
                    <td className={td}>{fn.rooms.map((r) => r.room.name).join(", ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function CateringOrderSection({
  order,
  timezone,
  vendorId,
  relationship,
}: {
  order: CateringOrder;
  timezone: string;
  vendorId: string;
  relationship?: CateringRelationship;
}) {
  const firmestCount = firmestGuestCount(order);
  const showGuaranteeDeadline = order.guaranteeDeadline != null && firmestCount?.label !== "Confirmed";

  return (
    <div className={orderCard}>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 print:text-black">{order.name}</h3>
        <div className="flex flex-wrap gap-3 mt-0.5 text-xs text-gray-500 dark:text-gray-400 print:text-gray-600">
          <span>Catering Order</span>
          {relationship && (
            <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 print:bg-transparent print:px-0">
              {cateringRelationshipLabel(relationship)}
            </span>
          )}
          {order.serviceStyle && <span>Service: {order.serviceStyle}</span>}
        </div>
        <LastUpdated
          updatedAt={order.updatedAt}
          updatedBy={order.updatedBy}
          timezone={timezone}
          className="mt-1 print:hidden"
        />
      </div>

      {firmestCount && (
        <>
          <SectionHeading>Guest Count</SectionHeading>
          <div className="flex gap-6 items-center mb-4 text-xs text-gray-700 dark:text-gray-300 print:text-gray-900">
            <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-200 print:bg-transparent print:text-black print:font-semibold">
              <span className="font-medium">{firmestCount.label}:</span> {firmestCount.value}
            </span>
            {showGuaranteeDeadline && order.guaranteeDeadline && (
              <span>
                <span className="font-medium">Guarantee Deadline:</span>{" "}
                {new Date(order.guaranteeDeadline).toLocaleDateString("en-US", {
                  timeZone: timezone,
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            )}
          </div>
        </>
      )}

      {(order.function || order.additionalServiceLocations.length > 0) && (() => {
        const primaryFunctionName = order.function?.name ?? null;
        const primaryRoom = order.function?.rooms[0]?.room.name ?? null;
        const { sumKnown, uncountedCount, primaryRemaining, exceedsExpected, exceedsConfirmed } =
          computeServiceLocationCounts(
            order.additionalServiceLocations,
            order.expectedCount,
            order.confirmedCount,
          );
        const primaryDisplay = primaryFunctionName ?? "Main Service";
        const primaryLocation = `${primaryDisplay}${primaryRoom ? ` (${primaryRoom})` : ""}`;
        const primaryCount =
          order.expectedCount != null && primaryRemaining != null
            ? `${primaryRemaining} of ${order.expectedCount}`
            : "—";

        return (
          <>
            <SectionHeading>Service Locations</SectionHeading>
            {uncountedCount > 0 && (
              <div className="text-xs text-gray-500 dark:text-gray-400 print:text-gray-600 mb-1">
                ({uncountedCount} location count{uncountedCount === 1 ? "" : "s"} not yet set)
              </div>
            )}
            {exceedsExpected && order.expectedCount != null && (
              <div className="text-xs text-amber-700 dark:text-amber-400 print:text-black mb-1">
                ⚠ Additional location counts ({sumKnown}) exceed order expected count ({order.expectedCount}).
              </div>
            )}
            {exceedsConfirmed && order.confirmedCount != null && (
              <div className="text-xs text-amber-700 dark:text-amber-400 print:text-black mb-1">
                ⚠ Additional location counts ({sumKnown}) also exceed confirmed count ({order.confirmedCount}).
              </div>
            )}
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th className={th}>Location</th>
                    <th className={th}>Expected</th>
                    <th className={th}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className={td}>
                      {primaryLocation}
                      <span className="ml-1 text-xs text-gray-500 dark:text-gray-400 print:text-gray-600">[Primary]</span>
                    </td>
                    <td className={td}>{primaryCount}</td>
                    <td className={td}></td>
                  </tr>
                  {order.additionalServiceLocations.map((loc) => {
                    const derivedRoom = loc.function?.rooms[0]?.room.name ?? null;
                    const functionName = loc.function?.name ?? null;
                    const baseName = loc.name ?? functionName ?? "Unnamed location";
                    const roomAside = derivedRoom ? ` (${derivedRoom})` : "";
                    const functionAside = loc.name && functionName ? ` · ${functionName}${roomAside}` : (!loc.name ? roomAside : "");
                    return (
                      <tr key={loc.id}>
                        <td className={td}>
                          {baseName}
                          <span className="text-gray-500 dark:text-gray-400 print:text-gray-600">{functionAside}</span>
                        </td>
                        <td className={td}>{loc.expectedCount ?? "—"}</td>
                        <td className={td}>{loc.notes ?? ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        );
      })()}

      {order.menuSections.length > 0 && (
        <>
          <SectionHeading>Menu / Responsibility</SectionHeading>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className={th}>Menu Content</th>
                  <th className={th}>Responsible Party</th>
                  <th className={th}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {order.menuSections.map((section) => (
                  <tr key={section.id}>
                    <td className={td}>
                      <div
                        className="[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                        dangerouslySetInnerHTML={{ __html: section.menuContent }}
                      />
                    </td>
                    <td className={td}>{section.responsiblePartyVendor?.name ?? "—"}</td>
                    <td className={td}>{section.notes ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {order.timelineItems.length > 0 && (
        <>
          <SectionHeading>Day-of Timeline</SectionHeading>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className={th}>Time</th>
                  <th className={th}>Activity</th>
                  <th className={th}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {order.timelineItems.map((item) => {
                  const start = formatTime(item.startTime, timezone);
                  const end = item.endTime ? ` – ${formatTime(item.endTime, timezone)}` : "";
                  return (
                    <tr key={item.id}>
                      <td className={`${td} whitespace-nowrap`}>{start}{end}</td>
                      <td className={td}>{item.label}</td>
                      <td className={td}>{item.notes ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {order.equipmentItems.length > 0 && (
        <>
          <SectionHeading>Equipment</SectionHeading>
          <div className="mb-4">
            <EquipmentTable items={order.equipmentItems} vendorId={vendorId} filterByVendor={false} />
          </div>
        </>
      )}

      {(order.dietaryNotes || order.staffingNotes || order.notes) && (
        <>
          <SectionHeading>Notes</SectionHeading>
          <div className="space-y-2 text-xs text-gray-700 dark:text-gray-300 print:text-gray-900">
            {order.dietaryNotes && (
              <div><span className="font-medium">Dietary:</span> {order.dietaryNotes}</div>
            )}
            {order.staffingNotes && (
              <div><span className="font-medium">Staffing:</span> {order.staffingNotes}</div>
            )}
            {order.notes && (
              <div><span className="font-medium">Notes:</span> {order.notes}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function AVOrderSection({ order, vendorId }: { order: AVOrder; vendorId: string }) {
  const audio = order.audioSection;
  const video = order.videoSection;
  const relevantMixes = audio?.monitorMixes.filter(
    (mix) => mix.providerVendor?.id === vendorId || mix.operatorVendor?.id === vendorId
  ) ?? [];

  return (
    <div className={orderCard}>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 print:text-black">{order.name}</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 print:text-gray-600 mt-0.5">AV Order</p>
        <LastUpdated
          updatedAt={order.updatedAt}
          updatedBy={order.updatedBy}
          className="mt-1 print:hidden"
        />
      </div>

      {audio && (audio.inputGroups.length > 0 || audio.monitorMixes.length > 0) && (
        <>
          <SectionHeading>Audio</SectionHeading>
          {audio.notes && (
            <p className="text-xs text-gray-600 dark:text-gray-400 print:text-gray-800 mb-2">{audio.notes}</p>
          )}

          {audio.inputGroups.map((group) => {
            const relevantItems = group.inputItems.filter(
              (item) => item.providerVendor?.id === vendorId || item.operatorVendor?.id === vendorId
            );
            const rolledUp = rollUpInputItems(relevantItems);
            if (rolledUp.length === 0) return null;
            return (
              <div key={group.id} className="mb-4">
                <SubHeading>Input Group: {group.name}</SubHeading>
                {(group.providerVendor || group.operatorVendor) && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 print:text-gray-800 mb-1">
                    {group.providerVendor && <span>Provider: {group.providerVendor.name}</span>}
                    {group.providerVendor && group.operatorVendor && " · "}
                    {group.operatorVendor && <span>Operator: {group.operatorVendor.name}</span>}
                  </p>
                )}
                {group.notes && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 print:text-gray-600 mb-1">{group.notes}</p>
                )}
                <div className="sm:hidden print:hidden border border-gray-200 dark:border-gray-700 rounded divide-y divide-gray-200 dark:divide-gray-700 text-xs">
                  {rolledUp.map((row, i) => (
                    <div key={i} className="p-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium text-gray-900 dark:text-white">{row.displayName}</span>
                        <span className="shrink-0 text-gray-500 dark:text-gray-400">Qty {row.quantity}</span>
                      </div>
                      <p className="text-gray-600 dark:text-gray-400 mt-0.5">{vendorRole(row.providerVendor, row.operatorVendor, vendorId)}</p>
                      <div className="mt-1 text-gray-500 dark:text-gray-400 space-y-0.5">
                        <p>Provider: <span className="text-gray-700 dark:text-gray-300">{partyName(row.providerVendor, row.providerContact)}</span></p>
                        <p>Operator: <span className="text-gray-700 dark:text-gray-300">{partyName(row.operatorVendor, row.operatorContact)}</span></p>
                      </div>
                      {row.notes && <p className="text-gray-500 dark:text-gray-500 italic mt-1">{row.notes}</p>}
                    </div>
                  ))}
                </div>
                <div className="hidden sm:block print:block overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr>
                        <th className={th}>Input</th>
                        <th className={th}>Qty</th>
                        <th className={th}>Role</th>
                        <th className={th}>Provider</th>
                        <th className={th}>Operator</th>
                        <th className={th}>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rolledUp.map((row, i) => (
                        <tr key={i}>
                          <td className={td}>{row.displayName}</td>
                          <td className={td}>{row.quantity}</td>
                          <td className={td}>{vendorRole(row.providerVendor, row.operatorVendor, vendorId)}</td>
                          <td className={td}>{partyName(row.providerVendor, row.providerContact)}</td>
                          <td className={td}>{partyName(row.operatorVendor, row.operatorContact)}</td>
                          <td className={td}>{row.notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {relevantMixes.length > 0 && (
            <>
              <SubHeading>Monitor Mixes</SubHeading>
              <div className="sm:hidden print:hidden border border-gray-200 dark:border-gray-700 rounded divide-y divide-gray-200 dark:divide-gray-700 text-xs mb-4">
                {relevantMixes.map((mix) => (
                  <div key={mix.id} className="p-2">
                    <p className="font-medium text-gray-900 dark:text-white">{mix.description}</p>
                    {mix.equipment?.name && (
                      <p className="text-gray-600 dark:text-gray-400 mt-0.5">{mix.equipment.name}</p>
                    )}
                    <p className="text-gray-600 dark:text-gray-400 mt-0.5">{vendorRole(mix.providerVendor, mix.operatorVendor, vendorId)}</p>
                    <div className="mt-1 text-gray-500 dark:text-gray-400 space-y-0.5">
                      <p>Provider: <span className="text-gray-700 dark:text-gray-300">{partyName(mix.providerVendor, mix.providerContact)}</span></p>
                      <p>Operator: <span className="text-gray-700 dark:text-gray-300">{partyName(mix.operatorVendor, mix.operatorContact)}</span></p>
                    </div>
                    {mix.notes && <p className="text-gray-500 dark:text-gray-500 italic mt-1">{mix.notes}</p>}
                  </div>
                ))}
              </div>
              <div className="hidden sm:block print:block overflow-x-auto mb-4">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className={th}>Description</th>
                      <th className={th}>Equipment</th>
                      <th className={th}>Role</th>
                      <th className={th}>Provider</th>
                      <th className={th}>Operator</th>
                      <th className={th}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relevantMixes.map((mix) => (
                      <tr key={mix.id}>
                        <td className={td}>{mix.description}</td>
                        <td className={td}>{mix.equipment?.name ?? "—"}</td>
                        <td className={td}>{vendorRole(mix.providerVendor, mix.operatorVendor, vendorId)}</td>
                        <td className={td}>{partyName(mix.providerVendor, mix.providerContact)}</td>
                        <td className={td}>{partyName(mix.operatorVendor, mix.operatorContact)}</td>
                        <td className={td}>{mix.notes ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {video && video.equipmentItems.length > 0 && (
        <>
          <SectionHeading>Video</SectionHeading>
          {video.notes && (
            <p className="text-xs text-gray-600 dark:text-gray-400 print:text-gray-800 mb-2">{video.notes}</p>
          )}
          <div className="mb-4">
            <EquipmentTable items={video.equipmentItems} vendorId={vendorId} />
          </div>
        </>
      )}

      {order.equipmentItems.length > 0 && (
        <>
          <SectionHeading>Equipment</SectionHeading>
          <div className="mb-4">
            <EquipmentTable items={order.equipmentItems} vendorId={vendorId} />
          </div>
        </>
      )}

      {order.notes && (
        <>
          <SectionHeading>Notes</SectionHeading>
          <p className="text-xs text-gray-700 dark:text-gray-300 print:text-gray-900">{order.notes}</p>
        </>
      )}
    </div>
  );
}

function SetupOrderSection({ order, vendorId }: { order: SetupOrder; vendorId: string }) {
  return (
    <div className={orderCard}>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 print:text-black">
          {order.name ?? "Setup Order"}
        </h3>
        <div className="flex gap-3 mt-0.5 text-xs text-gray-500 dark:text-gray-400 print:text-gray-600">
          <span>Setup Order</span>
          {order.setupType && <span>Type: {order.setupType}</span>}
          {order.room && <span>Room: {order.room.name}</span>}
        </div>
        <LastUpdated
          updatedAt={order.updatedAt}
          updatedBy={order.updatedBy}
          className="mt-1 print:hidden"
        />
      </div>

      {order.details.length > 0 && (
        <>
          <SectionHeading>Setup Details</SectionHeading>
          <div className="space-y-3 mb-4">
            {order.details.map((detail) => (
              <div key={detail.id}>
                {(detail.headline || detail.responsiblePartyVendor) && (
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    {detail.headline && (
                      <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 print:text-black uppercase tracking-wide">
                        {detail.headline}
                      </p>
                    )}
                    {detail.responsiblePartyVendor && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 print:text-gray-600">
                        By: {detail.responsiblePartyVendor.name}
                      </p>
                    )}
                  </div>
                )}
                {/* RichTextEditor output — chain: SetupOrderDetailTable → RichTextEditor */}
                <div
                  className="text-xs text-gray-700 dark:text-gray-300 print:text-gray-900 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                  dangerouslySetInnerHTML={{ __html: detail.description }}
                />
              </div>
            ))}
          </div>
        </>
      )}

      {order.tables.length > 0 && (
        <>
          <SectionHeading>Table Configuration</SectionHeading>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className={th}>Table Type</th>
                  <th className={th}>Qty</th>
                  <th className={th}>Chairs</th>
                  <th className={th}>Chair Type</th>
                  <th className={th}>Provider</th>
                  <th className={th}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {order.tables.map((table) => (
                  <tr key={table.id}>
                    <td className={td}>{table.tableType ?? "—"}</td>
                    <td className={td}>{table.quantity}</td>
                    <td className={td}>{table.chairCount ?? "—"}</td>
                    <td className={td}>{table.chairType ?? "—"}</td>
                    <td className={td}>{table.providerVendor?.name ?? "—"}</td>
                    <td className={td}>{table.notes ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {order.equipmentItems.length > 0 && (
        <>
          <SectionHeading>Equipment</SectionHeading>
          <div className="mb-4">
            <EquipmentTable items={order.equipmentItems} vendorId={vendorId} filterByVendor={false} />
          </div>
        </>
      )}

      {order.notes && (
        <>
          <SectionHeading>Notes</SectionHeading>
          <p className="text-xs text-gray-700 dark:text-gray-300 print:text-gray-900">{order.notes}</p>
        </>
      )}
    </div>
  );
}

function FunctionSection({
  group,
  functionTypes,
  timezone,
  vendorId,
  anchorId,
}: {
  group: FunctionGroup;
  functionTypes: { label: string }[];
  timezone: string;
  vendorId: string;
  anchorId?: string;
}) {
  const { fn, cateringOrders, avOrders, setupOrders } = group;
  const typeLabel = fn.type ? resolveOptionLabel(fn.type, functionTypes) : null;
  const rooms = fn.rooms.map((r) => r.room.name).join(", ") || "—";
  const sortedSchedules = [...fn.schedules].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
  const typeCount = [cateringOrders.length > 0, avOrders.length > 0, setupOrders.length > 0].filter(Boolean).length;

  return (
    <div id={anchorId} className={`${sectionCard} print:break-inside-avoid scroll-mt-24`}>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white print:text-black break-after-avoid">
          {formatBreakoutSessionName(fn.name, fn.breakoutGroup?.name)}
        </h2>
        <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400 print:text-gray-600">
          {typeLabel && <span>{typeLabel}</span>}
          <span>{rooms}</span>
        </div>
      </div>

      {sortedSchedules.length > 0 && (
        <div className="mb-4">
          <SectionHeading>Schedule</SectionHeading>
          <div className="sm:hidden print:hidden border border-gray-200 dark:border-gray-700 rounded divide-y divide-gray-200 dark:divide-gray-700 text-xs">
            {sortedSchedules.map((schedule) => {
              const dateKey = dateFormatter.format(schedule.startTime);
              return (
                <div key={`${fn.id}-${schedule.startTime.getTime()}`} className="p-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">{formatDateHeading(dateKey, timezone)}</span>
                    {schedule.type && (
                      <span className="shrink-0 text-[10px] font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{schedule.type}</span>
                    )}
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 mt-0.5">
                    {`${formatTime(schedule.startTime, timezone)} – ${formatTime(schedule.endTime, timezone)}`}
                  </p>
                  {schedule.notes && <p className="text-gray-500 dark:text-gray-500 italic mt-0.5">{schedule.notes}</p>}
                </div>
              );
            })}
          </div>
          <div className="hidden sm:block print:block overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className={th}>Date</th>
                  <th className={th}>Time</th>
                  <th className={th}>Type</th>
                  <th className={th}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {sortedSchedules.map((schedule) => {
                  const dateKey = dateFormatter.format(schedule.startTime);
                  return (
                    <tr key={`${fn.id}-${schedule.startTime.getTime()}`}>
                      <td className={`${td} whitespace-nowrap`}>{formatDateHeading(dateKey, timezone)}</td>
                      <td className={`${td} whitespace-nowrap`}>{`${formatTime(schedule.startTime, timezone)} – ${formatTime(schedule.endTime, timezone)}`}</td>
                      <td className={td}>{schedule.type ?? ""}</td>
                      <td className={td}>{schedule.notes ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {cateringOrders.length > 0 && (
        <>
          {typeCount > 1 && <SubHeading>Catering</SubHeading>}
          {cateringOrders.map((entry, idx) => (
            <CateringOrderSection
              key={`${entry.order.id}-${idx}`}
              order={entry.order}
              timezone={timezone}
              vendorId={vendorId}
              relationship={entry.relationship}
            />
          ))}
        </>
      )}

      {avOrders.length > 0 && (
        <>
          {typeCount > 1 && <SubHeading>Audio / Visual</SubHeading>}
          {avOrders.map((order) => (
            <AVOrderSection key={order.id} order={order} vendorId={vendorId} />
          ))}
        </>
      )}

      {setupOrders.length > 0 && (
        <>
          {typeCount > 1 && <SubHeading>Setup</SubHeading>}
          {setupOrders.map((order) => (
            <SetupOrderSection key={order.id} order={order} vendorId={vendorId} />
          ))}
        </>
      )}
    </div>
  );
}

function PresentationSection({
  group,
  timezone,
  vendorId,
  anchorId,
}: {
  group: PresentationGroup;
  timezone: string;
  vendorId: string;
  anchorId?: string;
}) {
  const { presentation, avOrders, setupOrders } = group;
  const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
  const typeCount = [avOrders.length > 0, setupOrders.length > 0].filter(Boolean).length;

  const slotsByDate = new Map<string, { slot: PresentationGroup["presentation"]["slots"][number]; schedule: AnyFn["schedules"][number] }[]>();
  for (const slot of presentation.slots) {
    for (const schedule of slot.function.schedules) {
      const dateKey = dateFormatter.format(schedule.startTime);
      if (!slotsByDate.has(dateKey)) slotsByDate.set(dateKey, []);
      slotsByDate.get(dateKey)!.push({ slot, schedule });
    }
  }
  for (const rows of Array.from(slotsByDate.values())) {
    rows.sort((a, b) => a.schedule.startTime.getTime() - b.schedule.startTime.getTime());
  }
  const sortedDates = Array.from(slotsByDate.keys()).sort();
  const hasSchedule = sortedDates.length > 0;

  return (
    <div id={anchorId} className={`${sectionCard} print:break-inside-avoid scroll-mt-24`}>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white print:text-black break-after-avoid">
          {presentation.title}
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 print:text-gray-600 mt-0.5">Presentation</p>
      </div>

      {hasSchedule && (
        <div className="mb-4">
          <SectionHeading>Schedule</SectionHeading>
          {sortedDates.map((dateKey) => {
            const rows = slotsByDate.get(dateKey)!;
            return (
              <div key={dateKey} className="mb-3">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 print:text-gray-800 mb-1">
                  {formatDateHeading(dateKey, timezone)}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed text-sm border-collapse">
                    <thead>
                      <tr>
                        <th className={`${th} w-[35%]`}>Time</th>
                        <th className={`${th} w-[65%]`}>Room</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ slot, schedule }) => {
                        const timeStr = `${formatTime(schedule.startTime, timezone)} – ${formatTime(schedule.endTime, timezone)}`;
                        const roomName = slot.room?.name ?? (slot.function.rooms.map((r) => r.room.name).join(", ") || "—");
                        return (
                          <tr key={`${slot.id}-${schedule.startTime.getTime()}`}>
                            <td className={`${td} whitespace-nowrap`}>{timeStr}</td>
                            <td className={td}>{roomName}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {avOrders.length > 0 && (
        <>
          {typeCount > 1 && <SubHeading>Audio / Visual</SubHeading>}
          {avOrders.map((order) => (
            <AVOrderSection key={order.id} order={order} vendorId={vendorId} />
          ))}
        </>
      )}

      {setupOrders.length > 0 && (
        <>
          {typeCount > 1 && <SubHeading>Setup</SubHeading>}
          {setupOrders.map((order) => (
            <SetupOrderSection key={order.id} order={order} vendorId={vendorId} />
          ))}
        </>
      )}
    </div>
  );
}

type VendorHandoffReportProps = {
  data: HandoffData;
  event: Event;
  functionTypes: { label: string }[];
};

export function VendorHandoffReport({ data, event, functionTypes }: VendorHandoffReportProps) {
  const { vendor, keyStaff } = data;
  const vendorId = vendor.id;
  const timezone = event.timezone ?? "America/Chicago";
  const { groups, presentationGroups, unscheduled } = buildFunctionGroups(data);

  type AnyGroup = { type: "function"; group: FunctionGroup } | { type: "presentation"; group: PresentationGroup };
  const allGroups: AnyGroup[] = [
    ...groups.map((g) => ({ type: "function" as const, group: g })),
    ...presentationGroups.map((g) => ({ type: "presentation" as const, group: g })),
  ].sort((a, b) => a.group.earliestStart - b.group.earliestStart);
  const equipmentSummary = buildEquipmentSummary(data, vendorId);
  const equipmentByCategory: [string, EquipmentSummaryRow[]][] = (() => {
    const grouped = new Map<string, EquipmentSummaryRow[]>();
    for (const row of equipmentSummary) {
      const cat = row.category ?? "Uncategorized";
      const existing = grouped.get(cat);
      if (existing) existing.push(row);
      else grouped.set(cat, [row]);
    }
    return Array.from(grouped.entries());
  })();

  const multiCategory = equipmentByCategory.length > 1;

  const hasUnscheduled =
    unscheduled.cateringOrders.length > 0 ||
    unscheduled.avOrders.length > 0 ||
    unscheduled.setupOrders.length > 0;

  const unscheduledTypeCount = [
    unscheduled.cateringOrders.length > 0,
    unscheduled.avOrders.length > 0,
    unscheduled.setupOrders.length > 0,
  ].filter(Boolean).length;

  const dateOpts: Intl.DateTimeFormatOptions = { timeZone: timezone, month: "long", day: "numeric", year: "numeric" };
  const startDateStr = event.startDate ? new Date(event.startDate).toLocaleDateString("en-US", dateOpts) : null;
  const endDateStr = event.endDate ? new Date(event.endDate).toLocaleDateString("en-US", dateOpts) : null;
  const dateRange = startDateStr && endDateStr
    ? `${startDateStr} – ${endDateStr}`
    : (startDateStr ?? endDateStr ?? null);

  const venue = event.venue;
  const addressParts = venue ? [venue.city, venue.state].filter(Boolean) : [];
  const addressLine = venue?.address
    ? [venue.address, ...addressParts].join(", ")
    : addressParts.join(", ");

  const sectionLinks: { id: string; label: string }[] = [];
  if (keyStaff.length > 0) sectionLinks.push({ id: "key-contacts", label: "Key Contacts" });
  if (allGroups.length > 0) sectionLinks.push({ id: "function-schedule", label: "Schedule" });
  if (equipmentByCategory.length > 0) sectionLinks.push({ id: "equipment-summary", label: "Equipment" });
  if (hasUnscheduled) sectionLinks.push({ id: "unscheduled", label: "Unscheduled" });

  const functionLinks = groups.map((g) => ({ id: `function-${g.fn.id}`, label: formatBreakoutSessionName(g.fn.name, g.fn.breakoutGroup?.name) }));
  const presentationLinks = presentationGroups.map((g) => ({ id: `presentation-${g.presentation.id}`, label: g.presentation.title }));

  return (
    <div className="space-y-6 print:space-y-0">
      <ReportNav
        sections={sectionLinks}
        itemGroups={[
          { label: "Functions", links: functionLinks },
          { label: "Presentations", links: presentationLinks },
        ]}
      />

      <div className={sectionCard}>
        <div className="mb-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white print:text-black">
            {event.name}
          </h2>
          {dateRange && (
            <p className="text-xs text-gray-500 dark:text-gray-400 print:text-gray-600 mt-0.5">{dateRange}</p>
          )}
          {venue && (
            <p className="text-xs text-gray-500 dark:text-gray-400 print:text-gray-600 mt-0.5">
              {venue.name}{addressLine ? ` · ${addressLine}` : ""}
            </p>
          )}
          <div className="mt-3">
            <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 print:text-gray-600 uppercase tracking-wide">Vendor</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white print:text-black">{vendor.name}</p>
          </div>
        </div>

        {vendor.contacts.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 print:text-gray-700 uppercase tracking-wide mb-2">
              Vendor Contacts
            </p>
            <div className="sm:hidden divide-y divide-gray-200 dark:divide-gray-700">
              {vendor.contacts.map(({ id, contact, contactType, isPrimary }) => (
                <div key={id} className="py-2 first:pt-0 last:pb-0 text-xs">
                  <p className="font-medium text-gray-900 dark:text-white">
                    {contact.firstName} {contact.lastName}
                    {isPrimary && <span className="ml-1 font-normal text-gray-400 dark:text-gray-500">(Primary)</span>}
                  </p>
                  {contactType && <p className="text-gray-600 dark:text-gray-400">{contactType}</p>}
                  {contact.email && <p className="text-gray-600 dark:text-gray-400">{contact.email}</p>}
                  {contact.phone && <p className="text-gray-600 dark:text-gray-400">{formatPhone(contact.phone)}</p>}
                </div>
              ))}
            </div>
            <div className="hidden sm:block print:block overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th className={th}>Name</th>
                    <th className={th}>Role</th>
                    <th className={th}>Email</th>
                    <th className={th}>Phone</th>
                  </tr>
                </thead>
                <tbody>
                  {vendor.contacts.map(({ id, contact, contactType, isPrimary }) => (
                    <tr key={id}>
                      <td className={td}>
                        {contact.firstName} {contact.lastName}
                        {isPrimary && <span className="ml-1 text-gray-400 dark:text-gray-500 print:text-gray-500">(Primary)</span>}
                      </td>
                      <td className={td}>{contactType ?? "—"}</td>
                      <td className={td}>{contact.email ?? "—"}</td>
                      <td className={td}>{contact.phone ? formatPhone(contact.phone) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {(keyStaff.length > 0 || allGroups.length > 0 || equipmentByCategory.length > 0) && (
        <SectionDivider id="summary" title="Summary" />
      )}

      {keyStaff.length > 0 && (
        <div id="key-contacts" className={`${sectionCard} scroll-mt-24`}>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white print:text-black mb-4 break-after-avoid">
            Key Event Contacts
          </h2>
          <div className="sm:hidden divide-y divide-gray-200 dark:divide-gray-700">
            {keyStaff.map((staff) => (
              <div key={staff.id} className="py-2 first:pt-0 last:pb-0 text-xs">
                <p className="font-medium text-gray-900 dark:text-white">
                  {staff.contact.firstName} {staff.contact.lastName}
                </p>
                {staff.title && <p className="text-gray-600 dark:text-gray-400">{staff.title}</p>}
                {staff.contact.email && <p className="text-gray-600 dark:text-gray-400">{staff.contact.email}</p>}
                {staff.contact.phone && <p className="text-gray-600 dark:text-gray-400">{formatPhone(staff.contact.phone)}</p>}
              </div>
            ))}
          </div>
          <div className="hidden sm:block print:block overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className={th}>Name</th>
                  <th className={th}>Title</th>
                  <th className={th}>Email</th>
                  <th className={th}>Phone</th>
                </tr>
              </thead>
              <tbody>
                {keyStaff.map((staff) => (
                  <tr key={staff.id}>
                    <td className={td}>
                      {staff.contact.firstName} {staff.contact.lastName}
                    </td>
                    <td className={td}>{staff.title ?? "—"}</td>
                    <td className={td}>{staff.contact.email ?? "—"}</td>
                    <td className={td}>{staff.contact.phone ? formatPhone(staff.contact.phone) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {allGroups.length > 0 && (
        <div id="function-schedule" className={`${sectionCard} scroll-mt-24`}>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white print:text-black mb-4 break-after-avoid">
            Function Schedule
          </h2>
          <FunctionScheduleSection data={data} timezone={timezone} />
        </div>
      )}

      {equipmentByCategory.length > 0 && (
        <div id="equipment-summary" className={`${sectionCard} scroll-mt-24`}>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white print:text-black mb-4 break-after-avoid">
            Equipment Summary
          </h2>
          {equipmentByCategory.map(([cat, rows]) => (
            <div key={cat}>
              {multiCategory && <SubHeading>{cat}</SubHeading>}
              <div className="sm:hidden print:hidden mb-4 divide-y divide-gray-200 dark:divide-gray-700">
                {rows.map((row) => (
                  <div key={`${row.itemName}\0${row.role}\0${row.providerName}`} className="py-2 text-xs">
                    <p className="font-medium text-gray-900 dark:text-white">{row.itemName}</p>
                    <p className="text-gray-600 dark:text-gray-400 mt-0.5">
                      {row.role}: <span className="text-gray-900 dark:text-white">{row.quantity}</span>
                    </p>
                    {row.role === "Operator" && row.providerName !== "—" && (
                      <p className="text-gray-500 dark:text-gray-500 mt-0.5">via {row.providerName}</p>
                    )}
                  </div>
                ))}
              </div>
              <div className="hidden sm:block print:block overflow-x-auto mb-4">
                <table className="w-full table-fixed text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className={`${th} w-[35%]`}>Item</th>
                      <th className={`${th} w-[10%]`}>Qty</th>
                      <th className={`${th} w-[25%]`}>Role</th>
                      <th className={`${th} w-[30%]`}>Provider</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={`${row.itemName}\0${row.role}\0${row.providerName}`}>
                        <td className={td}>{row.itemName}</td>
                        <td className={td}>{row.quantity}</td>
                        <td className={td}>{row.role}</td>
                        <td className={td}>{row.providerName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {allGroups.length > 0 && (
        <SectionDivider id="details" title="Function & Presentation Details" />
      )}
      {allGroups.map((item) =>
        item.type === "function" ? (
          <FunctionSection
            key={item.group.fn.id}
            anchorId={`function-${item.group.fn.id}`}
            group={item.group}
            functionTypes={functionTypes}
            timezone={timezone}
            vendorId={vendorId}
          />
        ) : (
          <PresentationSection
            key={item.group.presentation.id}
            anchorId={`presentation-${item.group.presentation.id}`}
            group={item.group}
            timezone={timezone}
            vendorId={vendorId}
          />
        )
      )}

      {hasUnscheduled && (
        <>
          <SectionDivider id="unscheduled" title="Unscheduled Orders" />
          <div className={`${sectionCard} scroll-mt-24`}>
            {unscheduled.cateringOrders.length > 0 && (
              <>
                {unscheduledTypeCount > 1 && <SubHeading>Catering</SubHeading>}
                {unscheduled.cateringOrders.map((entry, idx) => (
                  <CateringOrderSection
                    key={`${entry.order.id}-${idx}`}
                    order={entry.order}
                    timezone={timezone}
                    vendorId={vendorId}
                    relationship={entry.relationship}
                  />
                ))}
              </>
            )}
            {unscheduled.avOrders.length > 0 && (
              <>
                {unscheduledTypeCount > 1 && <SubHeading>Audio / Visual</SubHeading>}
                {unscheduled.avOrders.map((order) => (
                  <AVOrderSection key={order.id} order={order} vendorId={vendorId} />
                ))}
              </>
            )}
            {unscheduled.setupOrders.length > 0 && (
              <>
                {unscheduledTypeCount > 1 && <SubHeading>Setup</SubHeading>}
                {unscheduled.setupOrders.map((order) => (
                  <SetupOrderSection key={order.id} order={order} vendorId={vendorId} />
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
