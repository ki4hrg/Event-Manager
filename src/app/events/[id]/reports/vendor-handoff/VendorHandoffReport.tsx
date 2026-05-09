import type { getVendorHandoffData } from "@/app/events/reports/actions";
import type { getEvent } from "@/app/events/actions";
import { formatTime, formatDateHeading } from "@/lib/agendaUtils";
import { resolveOptionLabel } from "@/lib/optionUtils";
import {
  reportTh as th,
  reportTd as td,
  reportSectionCard as sectionCard,
  reportOrderCard as orderCard,
} from "@/lib/reportStyles";

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

type FunctionGroup = {
  fn: AnyFn;
  cateringOrders: CateringOrder[];
  avOrders: AVOrder[];
  setupOrders: SetupOrder[];
  earliestStart: number;
};

type UnscheduledGroup = {
  cateringOrders: CateringOrder[];
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

function EquipmentTable({ items, vendorId }: { items: EquipmentItem[]; vendorId: string }) {
  const relevant = items.filter(
    (item) => item.providerVendor?.id === vendorId || item.operatorVendor?.id === vendorId
  );
  if (relevant.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className={th}>Item</th>
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
              <td className={td}>{item.equipment?.name ?? item.item}</td>
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
  );
}

function buildFunctionGroups(data: HandoffData): { groups: FunctionGroup[]; unscheduled: UnscheduledGroup } {
  const groupMap = new Map<string, FunctionGroup>();
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

  for (const order of data.cateringOrders) {
    if (order.function) getOrCreateGroup(order.function).cateringOrders.push(order);
    else unscheduled.cateringOrders.push(order);
  }
  for (const order of data.avOrders) {
    if (order.functions.length === 0) unscheduled.avOrders.push(order);
    else for (const fn of order.functions) getOrCreateGroup(fn).avOrders.push(order);
  }
  for (const order of data.setupOrders) {
    if (order.functions.length === 0) unscheduled.setupOrders.push(order);
    else for (const fn of order.functions) getOrCreateGroup(fn).setupOrders.push(order);
  }

  const groups = Array.from(groupMap.values()).sort((a, b) => a.earliestStart - b.earliestStart);
  return { groups, unscheduled };
}

type EquipmentSummaryRow = { itemName: string; quantity: number; providerName: string; role: string };

function buildEquipmentSummary(data: HandoffData, vendorId: string): EquipmentSummaryRow[] {
  type Bucket = { itemName: string; quantity: number; providers: Set<string>; isProvider: boolean; isOperator: boolean };
  const map = new Map<string, Bucket>();

  const addRow = (
    itemName: string,
    qty: number,
    providerVendor: { id: string; name: string } | null | undefined,
    providerContact: { id: string; firstName: string; lastName: string } | null | undefined,
    operatorVendor: { id: string; name: string } | null | undefined,
  ) => {
    const isProvider = providerVendor?.id === vendorId;
    const isOperator = operatorVendor?.id === vendorId;
    if (!isProvider && !isOperator) return;
    const key = itemName.toLowerCase();
    const provider = providerVendor?.name
      ?? (providerContact ? `${providerContact.firstName} ${providerContact.lastName}` : null);
    const existing = map.get(key);
    if (existing) {
      existing.quantity += qty;
      if (provider) existing.providers.add(provider);
      if (isProvider) existing.isProvider = true;
      if (isOperator) existing.isOperator = true;
    } else {
      const providers = new Set<string>();
      if (provider) providers.add(provider);
      map.set(key, { itemName, quantity: qty, providers, isProvider, isOperator });
    }
  };

  const addItems = (items: EquipmentItem[]) => {
    for (const item of items) {
      addRow(item.equipment?.name ?? item.item, item.quantity ?? 1, item.providerVendor, item.providerContact, item.operatorVendor);
    }
  };

  for (const order of data.cateringOrders) addItems(order.equipmentItems);
  for (const order of data.avOrders) {
    addItems(order.equipmentItems);
    if (order.videoSection) addItems(order.videoSection.equipmentItems);
    if (order.audioSection) {
      for (const group of order.audioSection.inputGroups) {
        for (const inputItem of group.inputItems) {
          addRow(inputItem.equipment?.name ?? inputItem.description, inputItem.quantity, inputItem.providerVendor, inputItem.providerContact, inputItem.operatorVendor);
        }
      }
      for (const mix of order.audioSection.monitorMixes) {
        addRow(mix.equipment?.name ?? mix.description, 1, mix.providerVendor, mix.providerContact, mix.operatorVendor);
      }
    }
  }
  for (const order of data.setupOrders) addItems(order.equipmentItems);

  return Array.from(map.values())
    .map(({ itemName, quantity, providers, isProvider, isOperator }) => ({
      itemName,
      quantity,
      providerName: providers.size === 0 ? "—" : providers.size === 1 ? Array.from(providers)[0] : "Multiple",
      role: isProvider && isOperator ? "Provider & Operator" : isProvider ? "Provider" : "Operator",
    }))
    .sort((a, b) => a.itemName.localeCompare(b.itemName));
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

  for (const order of data.cateringOrders) addFn(order.function);
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
        return (
          <div key={dateKey} className="mb-4">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 print:text-gray-800 mb-1">{dateLabel}</p>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className={th}>Type</th>
                  <th className={th}>Time</th>
                  <th className={th}>Function</th>
                  <th className={th}>Room(s)</th>
                  <th className={th}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ fn, schedule }) => {
                  const timeStr = `${formatTime(schedule.startTime, timezone)} – ${formatTime(schedule.endTime, timezone)}`;
                  const rooms = fn.rooms.map((r) => r.room.name).join(", ") || "—";
                  return (
                    <tr key={`${fn.id}-${schedule.startTime.getTime()}`}>
                      <td className={`${td} whitespace-nowrap`}>{schedule.type}</td>
                      <td className={`${td} whitespace-nowrap`}>{timeStr}</td>
                      <td className={td}>{fn.name}</td>
                      <td className={td}>{rooms}</td>
                      <td className={td}>{schedule.notes ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
      {unscheduled.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 print:text-gray-800 mb-1">Unscheduled</p>
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
                  <td className={td}>{fn.name}</td>
                  <td className={td}>{fn.rooms.map((r) => r.room.name).join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CateringOrderSection({
  order,
  timezone,
  vendorId,
}: {
  order: CateringOrder;
  timezone: string;
  vendorId: string;
}) {
  const hasGuestCounts = order.expectedCount != null || order.confirmedCount != null || order.guaranteeCount != null;

  return (
    <div className={orderCard}>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 print:text-black">{order.name}</h3>
        <div className="flex gap-3 mt-0.5 text-xs text-gray-500 dark:text-gray-400 print:text-gray-600">
          <span>Catering Order</span>
          {order.serviceStyle && <span>Service: {order.serviceStyle}</span>}
        </div>
      </div>

      {hasGuestCounts && (
        <>
          <SectionHeading>Guest Counts</SectionHeading>
          <div className="flex gap-6 mb-4 text-xs text-gray-700 dark:text-gray-300 print:text-gray-900">
            {order.expectedCount != null && (
              <span><span className="font-medium">Expected:</span> {order.expectedCount}</span>
            )}
            {order.confirmedCount != null && (
              <span><span className="font-medium">Confirmed:</span> {order.confirmedCount}</span>
            )}
            {order.guaranteeCount != null && (
              <span><span className="font-medium">Guarantee:</span> {order.guaranteeCount}</span>
            )}
            {order.guaranteeDeadline && (
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

      {order.menuSections.length > 0 && (
        <>
          <SectionHeading>Menu / Responsibility</SectionHeading>
          <table className="w-full text-sm border-collapse mb-4">
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
        </>
      )}

      {order.timelineItems.length > 0 && (
        <>
          <SectionHeading>Day-of Timeline</SectionHeading>
          <table className="w-full text-sm border-collapse mb-4">
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
            );
          })}

          {relevantMixes.length > 0 && (
            <>
              <SubHeading>Monitor Mixes</SubHeading>
              <table className="w-full text-sm border-collapse mb-4">
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
      </div>

      {order.tables.length > 0 && (
        <>
          <SectionHeading>Table Configuration</SectionHeading>
          <table className="w-full text-sm border-collapse mb-4">
            <thead>
              <tr>
                <th className={th}>Table Type</th>
                <th className={th}>Qty</th>
                <th className={th}>Chairs</th>
                <th className={th}>Chair Type</th>
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
                  <td className={td}>{table.notes ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
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

function FunctionSection({
  group,
  functionTypes,
  timezone,
  vendorId,
}: {
  group: FunctionGroup;
  functionTypes: { label: string }[];
  timezone: string;
  vendorId: string;
}) {
  const { fn, cateringOrders, avOrders, setupOrders } = group;
  const typeLabel = fn.type ? resolveOptionLabel(fn.type, functionTypes) : null;
  const rooms = fn.rooms.map((r) => r.room.name).join(", ") || "—";
  const sortedSchedules = [...fn.schedules].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  const dateFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
  const typeCount = [cateringOrders.length > 0, avOrders.length > 0, setupOrders.length > 0].filter(Boolean).length;

  return (
    <div className={sectionCard}>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white print:text-black break-after-avoid">
          {fn.name}
        </h2>
        <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400 print:text-gray-600">
          {typeLabel && <span>{typeLabel}</span>}
          <span>{rooms}</span>
        </div>
      </div>

      {sortedSchedules.length > 0 && (
        <div className="mb-4">
          <SectionHeading>Schedule</SectionHeading>
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
      )}

      {cateringOrders.length > 0 && (
        <>
          {typeCount > 1 && <SubHeading>Catering</SubHeading>}
          {cateringOrders.map((order) => (
            <CateringOrderSection key={order.id} order={order} timezone={timezone} vendorId={vendorId} />
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

type VendorHandoffReportProps = {
  data: HandoffData;
  event: Event;
  functionTypes: { label: string }[];
};

export function VendorHandoffReport({ data, event, functionTypes }: VendorHandoffReportProps) {
  const { vendor, keyStaff } = data;
  const vendorId = vendor.id;
  const timezone = event.timezone ?? "America/Chicago";
  const { groups, unscheduled } = buildFunctionGroups(data);
  const equipmentSummary = buildEquipmentSummary(data, vendorId);

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

  return (
    <div className="space-y-6 print:space-y-0">
      {/* Header: event details + vendor */}
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
                    <td className={td}>{contact.phone ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Key event contacts */}
      {keyStaff.length > 0 && (
        <div className={sectionCard}>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white print:text-black mb-4 break-after-avoid">
            Key Event Contacts
          </h2>
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
                  <td className={td}>{staff.contact.phone ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Function schedule overview */}
      {groups.length > 0 && (
        <div className={sectionCard}>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white print:text-black mb-4 break-after-avoid">
            Function Schedule
          </h2>
          <FunctionScheduleSection data={data} timezone={timezone} />
        </div>
      )}

      {/* Master equipment summary */}
      {equipmentSummary.length > 0 && (
        <div className={sectionCard}>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white print:text-black mb-4 break-after-avoid">
            Equipment Summary
          </h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className={th}>Item</th>
                <th className={th}>Qty</th>
                <th className={th}>Role</th>
                <th className={th}>Provider</th>
              </tr>
            </thead>
            <tbody>
              {equipmentSummary.map((row) => (
                <tr key={row.itemName}>
                  <td className={td}>{row.itemName}</td>
                  <td className={td}>{row.quantity}</td>
                  <td className={td}>{row.role}</td>
                  <td className={td}>{row.providerName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Per-function detail sections */}
      {groups.map((group) => (
        <FunctionSection
          key={group.fn.id}
          group={group}
          functionTypes={functionTypes}
          timezone={timezone}
          vendorId={vendorId}
        />
      ))}

      {/* Unscheduled orders */}
      {hasUnscheduled && (
        <div className={sectionCard}>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white print:text-black mb-4 break-after-avoid">
            Unscheduled Orders
          </h2>
          {unscheduled.cateringOrders.length > 0 && (
            <>
              {unscheduledTypeCount > 1 && <SubHeading>Catering</SubHeading>}
              {unscheduled.cateringOrders.map((order) => (
                <CateringOrderSection key={order.id} order={order} timezone={timezone} vendorId={vendorId} />
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
      )}
    </div>
  );
}
