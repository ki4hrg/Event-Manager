import type { CustomOption } from "@prisma/client";
import type { EventProfileData } from "@/app/events/reports/actions";
import { getDateKeyInTimezone, formatDateHeading, formatTime } from "@/lib/agendaUtils";
import { resolveOptionLabel, resolveOptionColor } from "@/lib/optionUtils";
import { colorClasses } from "@/lib/colors";
import { formatPhone } from "@/lib/format-phone";
import { ReportNav } from "@/components/ReportNav";
import { SectionDivider } from "@/components/SectionDivider";
import { EntityStatusBadge } from "@/components/EntityStatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { reportTh as th, reportTd as td, reportSectionCard as sectionCard } from "@/lib/reportStyles";

export const PROFILE_SECTIONS = [
  { value: "contacts", label: "Key Contacts" },
  { value: "schedule", label: "Schedule" },
  { value: "breakouts", label: "Breakouts" },
  { value: "catering", label: "Catering" },
  { value: "print", label: "Print Orders" },
] as const;

export type ProfileSection = (typeof PROFILE_SECTIONS)[number]["value"];

type Props = {
  data: EventProfileData;
  serviceStyles: CustomOption[];
  scheduleTypes: CustomOption[];
  selectedSections?: ProfileSection[];
};

type BreakoutGroupRow = EventProfileData["breakoutGroups"][number];
type BreakoutBlockRow = BreakoutGroupRow["functions"][number];
type CateringOrderRow = EventProfileData["cateringOrders"][number];
type PrintOrderRow = EventProfileData["printOrders"][number];
type KeyStaffRow = EventProfileData["keyStaff"][number];
type ScheduleItemRow = EventProfileData["scheduleItems"][number];

function earliestStart(fn: { schedules: { startTime: Date }[] }): Date | null {
  if (fn.schedules.length === 0) return null;
  return fn.schedules.reduce((min, s) => (s.startTime < min ? s.startTime : min), fn.schedules[0].startTime);
}

function latestEnd(fn: { schedules: { endTime: Date }[] }): Date | null {
  if (fn.schedules.length === 0) return null;
  return fn.schedules.reduce((max, s) => (s.endTime > max ? s.endTime : max), fn.schedules[0].endTime);
}

function formatTimeRange(start: Date | null, end: Date | null, timezone: string): string {
  if (!start) return "Unscheduled";
  const startStr = formatTime(start, timezone);
  const endStr = end ? formatTime(end, timezone) : "";
  return endStr ? `${startStr} – ${endStr}` : startStr;
}

function fnRoomsLabel(fn: {
  rooms: { room: { name: string } }[];
  offSiteLocation: string | null;
}): string {
  if (fn.rooms.length > 0) return fn.rooms.map((r) => r.room.name).join(", ");
  if (fn.offSiteLocation) return `Off-site: ${fn.offSiteLocation}`;
  return "—";
}

function contactDisplayName(c: { firstName: string; lastName: string }): string {
  return `${c.firstName} ${c.lastName}`.trim();
}

function groupScheduleItemsByDay(
  items: ScheduleItemRow[],
  timezone: string
): Map<string, ScheduleItemRow[]> {
  const dated = new Map<string, ScheduleItemRow[]>();
  for (const item of items) {
    const key = getDateKeyInTimezone(item.startTime, timezone);
    if (!dated.has(key)) dated.set(key, []);
    dated.get(key)!.push(item);
  }
  dated.forEach((items) => {
    items.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  });
  return dated;
}

function effectiveRoomsForBlock(
  block: BreakoutBlockRow,
  group: BreakoutGroupRow
): { id: string; name: string }[] {
  const byId = new Map(group.rooms.map((r) => [r.room.id, r.room]));
  for (const ovr of block.sessionRoomOverrides) {
    if (ovr.type === "exclude") byId.delete(ovr.roomId);
  }
  // Includes pulled from presentationSlots room or override rooms not in group
  for (const ovr of block.sessionRoomOverrides) {
    if (ovr.type === "include" && !byId.has(ovr.roomId)) {
      // We don't have the room name here, fall back to slot data
      const slot = block.presentationSlots.find((s) => s.room?.id === ovr.roomId);
      if (slot?.room) byId.set(slot.room.id, slot.room);
    }
  }
  return Array.from(byId.values());
}

function ScheduleItemCard({
  item,
  timezone,
  scheduleTypes,
  attachFunctionAnchor,
}: {
  item: ScheduleItemRow;
  timezone: string;
  scheduleTypes: CustomOption[];
  attachFunctionAnchor: boolean;
}) {
  const fn = item.function;
  const typeLabel = resolveOptionLabel(item.type, scheduleTypes) || item.type;
  const typeColor = resolveOptionColor(item.type, scheduleTypes);
  const badgeClass = colorClasses[typeColor] ?? colorClasses.gray;
  const fnName = fn.name || fn.type || "Unnamed Function";
  return (
    <>
      {attachFunctionAnchor && (
        <div id={`function-${fn.id}`} className="scroll-mt-24" aria-hidden />
      )}
      <div
        id={`schedule-item-${item.id}`}
        className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 scroll-mt-24 print:break-inside-avoid"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{fnName}</p>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              {item.type && (
                <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${badgeClass}`}>
                  {typeLabel}
                </span>
              )}
              <span className="text-xs text-gray-700 dark:text-gray-300">
                {formatTimeRange(item.startTime, item.endTime, timezone)}
              </span>
              {item.isPublic && (
                <span className="text-xs text-gray-500 dark:text-gray-400">Public</span>
              )}
            </div>
          </div>
          <div className="shrink-0">
            <EntityStatusBadge status={fn.status} substatus={fn.substatus} />
          </div>
        </div>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-gray-500 dark:text-gray-400">Room</dt>
          <dd className="text-gray-900 dark:text-gray-100">{fnRoomsLabel(fn)}</dd>
          {item.notes && (
            <>
              <dt className="text-gray-500 dark:text-gray-400">Notes</dt>
              <dd className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{item.notes}</dd>
            </>
          )}
        </dl>
      </div>
    </>
  );
}

function KeyContactsSection({ keyStaff, venueContacts }: {
  keyStaff: KeyStaffRow[];
  venueContacts: { contact: { id: string; firstName: string; lastName: string; email: string | null; phone: string | null; organization: string | null }; role: string | null }[];
}) {
  const rows: { title: string; name: string; organization: string | null; phone: string | null; email: string | null }[] = [];
  for (const ks of keyStaff) {
    rows.push({
      title: ks.title ?? "Key staff",
      name: contactDisplayName(ks.contact),
      organization: ks.contact.organization,
      phone: ks.contact.phone,
      email: ks.contact.email,
    });
  }
  for (const vc of venueContacts) {
    rows.push({
      title: vc.role ?? "Venue contact",
      name: contactDisplayName(vc.contact),
      organization: vc.contact.organization,
      phone: vc.contact.phone,
      email: vc.contact.email,
    });
  }

  if (rows.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No key contacts.</p>;
  }

  return (
    <>
      <div className="sm:hidden print:hidden border border-gray-200 dark:border-gray-700 rounded divide-y divide-gray-200 dark:divide-gray-700 text-xs">
        {rows.map((r, i) => (
          <div key={i} className="p-2">
            <p className="font-medium text-gray-900 dark:text-white">{r.name}</p>
            <p className="text-gray-500 dark:text-gray-400">{r.title}</p>
            {r.organization && <p className="text-gray-500 dark:text-gray-400">{r.organization}</p>}
            <div className="mt-1 space-y-0.5">
              {r.phone && <p className="text-gray-700 dark:text-gray-300">{formatPhone(r.phone)}</p>}
              {r.email && <p className="text-gray-700 dark:text-gray-300 break-all">{r.email}</p>}
            </div>
          </div>
        ))}
      </div>
      <div className="hidden sm:block print:block overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className={th}>Role</th>
              <th className={th}>Name</th>
              <th className={th}>Organization</th>
              <th className={th}>Phone</th>
              <th className={th}>Email</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className={td}>{r.title}</td>
                <td className={`${td} font-medium`}>{r.name}</td>
                <td className={td}>{r.organization ?? ""}</td>
                <td className={`${td} whitespace-nowrap`}>{r.phone ? formatPhone(r.phone) : ""}</td>
                <td className={td}>{r.email ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function BreakoutGroupCard({
  group,
  timezone,
}: {
  group: BreakoutGroupRow;
  timezone: string;
}) {
  const blocks = [...group.functions].sort((a, b) => {
    const aT = earliestStart(a)?.getTime() ?? 0;
    const bT = earliestStart(b)?.getTime() ?? 0;
    return aT - bT;
  });

  // Build a stable room list across all blocks in the group
  const roomMap = new Map<string, { id: string; name: string }>();
  for (const r of group.rooms) roomMap.set(r.room.id, r.room);
  for (const b of blocks) {
    for (const room of effectiveRoomsForBlock(b, group)) roomMap.set(room.id, room);
    for (const slot of b.presentationSlots) {
      if (slot.room) roomMap.set(slot.room.id, slot.room);
    }
  }
  const rooms = Array.from(roomMap.values());

  return (
    <div
      id={`breakout-group-${group.id}`}
      className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 scroll-mt-24 print:break-inside-avoid"
    >
      <h3 className="text-base font-semibold text-gray-900 dark:text-white">{group.name}</h3>
      {rooms.length > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Rooms: {rooms.map((r) => r.name).join(", ")}
        </p>
      )}

      {blocks.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No sessions scheduled.</p>
      ) : rooms.length === 0 ? (
        // Fallback: flat list when no rooms are known
        <ul className="mt-3 space-y-2 text-sm">
          {blocks.map((b) => (
            <li key={b.id} className="border-l-2 border-gray-300 dark:border-gray-600 pl-3">
              <p className="font-medium">{formatTimeRange(earliestStart(b), latestEnd(b), timezone)}</p>
              {b.presentationSlots.map((s) => (
                <p key={s.id} className="text-xs">
                  {s.presentation.title}
                  {s.presentation.speakers[0] &&
                    <span className="text-gray-500 dark:text-gray-400"> — {contactDisplayName(s.presentation.speakers[0].contact)}</span>}
                </p>
              ))}
            </li>
          ))}
        </ul>
      ) : (
        <>
          {/* Mobile: stacked block list */}
          <div className="sm:hidden print:hidden mt-3 space-y-3 text-xs">
            {blocks.map((b) => {
              const blockRooms = effectiveRoomsForBlock(b, group);
              const slotByRoom = new Map(b.presentationSlots.filter((s) => s.room).map((s) => [s.room!.id, s]));
              return (
                <div key={b.id} className="border border-gray-200 dark:border-gray-700 rounded p-2">
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {formatTimeRange(earliestStart(b), latestEnd(b), timezone)}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {blockRooms.map((room) => {
                      const slot = slotByRoom.get(room.id);
                      return (
                        <li key={room.id}>
                          <span className="text-gray-500 dark:text-gray-400">{room.name}:</span>{" "}
                          {slot ? (
                            <>
                              {slot.presentation.title}
                              {slot.presentation.speakers[0] && (
                                <span className="text-gray-500 dark:text-gray-400"> — {contactDisplayName(slot.presentation.speakers[0].contact)}</span>
                              )}
                            </>
                          ) : (
                            <span className="text-gray-400 dark:text-gray-500 italic">—</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* Desktop / print: time × room grid */}
          <div className="hidden sm:block print:block overflow-x-auto mt-3">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className={th}>Time</th>
                  {rooms.map((r) => (
                    <th key={r.id} className={th}>{r.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {blocks.map((b) => {
                  const blockRooms = new Set(effectiveRoomsForBlock(b, group).map((r) => r.id));
                  const slotByRoom = new Map(b.presentationSlots.filter((s) => s.room).map((s) => [s.room!.id, s]));
                  return (
                    <tr key={b.id}>
                      <td className={`${td} whitespace-nowrap font-medium`}>
                        {formatTimeRange(earliestStart(b), latestEnd(b), timezone)}
                      </td>
                      {rooms.map((room) => {
                        const slot = slotByRoom.get(room.id);
                        const isEffective = blockRooms.has(room.id);
                        return (
                          <td key={room.id} className={td}>
                            {!isEffective ? (
                              <span className="text-gray-300 dark:text-gray-600">—</span>
                            ) : slot ? (
                              <div>
                                <p className="font-medium">{slot.presentation.title}</p>
                                {slot.presentation.speakers[0] && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {contactDisplayName(slot.presentation.speakers[0].contact)}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400 dark:text-gray-500 italic">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function CateringCard({
  order,
  timezone,
  serviceStyles,
}: {
  order: CateringOrderRow;
  timezone: string;
  serviceStyles: CustomOption[];
}) {
  const fn = order.function;
  const styleLabel = order.serviceStyle ? resolveOptionLabel(order.serviceStyle, serviceStyles) : "";
  const vendorName = order.vendors.map((v) => v.vendor.name).join(", ");
  return (
    <div
      id={`catering-${order.id}`}
      className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 scroll-mt-24 print:break-inside-avoid"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-gray-900 dark:text-white">{order.name}</p>
          {fn && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              <a href={`#function-${fn.id}`} className="text-blue-600 dark:text-blue-400 hover:underline print:text-gray-700 print:no-underline">
                {fn.name}
              </a>
              {" · "}
              {formatTimeRange(earliestStart(fn), latestEnd(fn), timezone)}
              {" · "}
              {fnRoomsLabel(fn)}
            </p>
          )}
        </div>
        <div className="shrink-0">
          <EntityStatusBadge status={order.status} substatus={order.substatus} />
        </div>
      </div>

      <dl className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 text-xs">
        {order.expectedCount != null && (
          <>
            <dt className="text-gray-500 dark:text-gray-400">Expected</dt>
            <dd className="text-gray-900 dark:text-gray-100">{order.expectedCount}</dd>
          </>
        )}
        {order.guaranteeCount != null && (
          <>
            <dt className="text-gray-500 dark:text-gray-400">Guarantee</dt>
            <dd className="text-gray-900 dark:text-gray-100">{order.guaranteeCount}</dd>
          </>
        )}
        {styleLabel && (
          <>
            <dt className="text-gray-500 dark:text-gray-400">Service</dt>
            <dd className="text-gray-900 dark:text-gray-100">{styleLabel}</dd>
          </>
        )}
        {vendorName && (
          <>
            <dt className="text-gray-500 dark:text-gray-400">Vendor</dt>
            <dd className="text-gray-900 dark:text-gray-100">{vendorName}</dd>
          </>
        )}
      </dl>

      {order.menuSections.length > 0 && (
        <div className="mt-3 space-y-3">
          {order.menuSections.map((section) => (
            <div key={section.id} className="border-t border-gray-200 dark:border-gray-700 pt-3 first:border-t-0 first:pt-0">
              {section.responsiblePartyVendor && (
                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                  {section.responsiblePartyVendor.name}
                </p>
              )}
              <div
                className="text-sm text-gray-800 dark:text-gray-200 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1"
                dangerouslySetInnerHTML={{ __html: section.menuContent }}
              />
              {section.notes && (
                <p className="mt-1 text-xs italic text-gray-500 dark:text-gray-400">{section.notes}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {order.dietaryNotes && (
        <div className="mt-3 border-l-4 border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20 print:bg-transparent px-3 py-2 text-xs text-amber-900 dark:text-amber-100 print:text-gray-900">
          <p className="font-semibold mb-0.5">Dietary notes</p>
          <p className="whitespace-pre-wrap">{order.dietaryNotes}</p>
        </div>
      )}
    </div>
  );
}

function PrintOrdersTable({ orders }: { orders: PrintOrderRow[] }) {
  if (orders.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No print orders.</p>;
  }

  return (
    <>
      <div className="sm:hidden print:hidden border border-gray-200 dark:border-gray-700 rounded divide-y divide-gray-200 dark:divide-gray-700 text-xs">
        {orders.map((o) => (
          <div key={o.id} className="p-2">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-gray-900 dark:text-white">{o.name}</p>
              <EntityStatusBadge status={o.status} substatus={o.substatus} />
            </div>
            {o.vendors.length > 0 && (
              <p className="text-gray-500 dark:text-gray-400 mt-0.5">{o.vendors.map((v) => v.vendor.name).join(", ")}</p>
            )}
            {(o.presentation || o.functions.length > 0) && (
              <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                {o.presentation
                  ? `Presentation: ${o.presentation.title}`
                  : `Function: ${o.functions.map((f) => f.function.name).join(", ")}`}
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="hidden sm:block print:block overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className={th}>Title</th>
              <th className={th}>Vendor</th>
              <th className={th}>Linked to</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td className={`${td} font-medium`}>{o.name}</td>
                <td className={td}>{o.vendors.map((v) => v.vendor.name).join(", ")}</td>
                <td className={td}>
                  {o.presentation
                    ? o.presentation.title
                    : o.functions.length > 0
                      ? o.functions.map((f) => f.function.name).join(", ")
                      : ""}
                </td>
                <td className={td}>
                  <EntityStatusBadge status={o.status} substatus={o.substatus} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function EventProfileReport({ data, serviceStyles, scheduleTypes, selectedSections }: Props) {
  const { event, venue, keyStaff, breakoutGroups, cateringOrders, printOrders, scheduleItems, timezone } = data;
  const active = new Set<ProfileSection>(
    selectedSections && selectedSections.length > 0
      ? selectedSections
      : (PROFILE_SECTIONS.map((s) => s.value) as ProfileSection[])
  );

  const scheduleByDay = groupScheduleItemsByDay(scheduleItems, timezone);
  const sortedDateKeys = Array.from(scheduleByDay.keys()).sort();

  const navSections: { id: string; label: string }[] = [{ id: "summary", label: "Summary" }];
  if (active.has("contacts")) navSections.push({ id: "key-contacts", label: "Key Contacts" });
  if (active.has("schedule") && scheduleItems.length > 0) navSections.push({ id: "function-schedule", label: "Schedule" });
  if (active.has("breakouts") && breakoutGroups.length > 0) navSections.push({ id: "breakout-schedule", label: "Breakouts" });
  if (active.has("catering") && cateringOrders.length > 0) navSections.push({ id: "catering", label: "Catering" });
  if (active.has("print") && printOrders.length > 0) navSections.push({ id: "print-orders", label: "Print" });

  const itemGroups = [];
  if (active.has("breakouts") && breakoutGroups.length > 0) {
    itemGroups.push({
      label: "Breakout groups",
      links: breakoutGroups.map((g) => ({ id: `breakout-group-${g.id}`, label: g.name })),
    });
  }
  if (active.has("catering") && cateringOrders.length > 0) {
    itemGroups.push({
      label: "Catering",
      links: cateringOrders.map((c) => ({ id: `catering-${c.id}`, label: c.name })),
    });
  }

  const eventDateRange = (() => {
    const start = new Date(event.startDate).toLocaleDateString("en-US", {
      timeZone: timezone,
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const end = new Date(event.endDate).toLocaleDateString("en-US", {
      timeZone: timezone,
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return start === end ? start : `${start} – ${end}`;
  })();

  const hasAny =
    keyStaff.length > 0 ||
    venue ||
    scheduleItems.length > 0 ||
    breakoutGroups.length > 0 ||
    cateringOrders.length > 0 ||
    printOrders.length > 0;

  if (!hasAny) {
    return <EmptyState message="No profile data available for the selected filters." />;
  }

  return (
    <div className="space-y-6">
      <ReportNav sections={navSections} itemGroups={itemGroups} />

      <div id="summary" className={`${sectionCard} scroll-mt-24`}>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white print:text-black">{event.name}</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 print:text-gray-700 mt-0.5">{eventDateRange}</p>
        {event.description && (
          <p className="text-sm text-gray-700 dark:text-gray-300 print:text-gray-800 mt-2 whitespace-pre-wrap">{event.description}</p>
        )}
        {venue && (
          <div className="mt-3 text-sm text-gray-700 dark:text-gray-300 print:text-gray-800">
            <p className="font-medium">{venue.name}</p>
            {(venue.address || venue.city || venue.state || venue.zip) && (
              <p className="text-xs text-gray-500 dark:text-gray-400 print:text-gray-700">
                {[venue.address, [venue.city, venue.state].filter(Boolean).join(", "), venue.zip].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        )}
      </div>

      {active.has("contacts") && (
        <section>
          <SectionDivider id="key-contacts" title="Key Contacts" />
          <div className="mt-3">
            <KeyContactsSection keyStaff={keyStaff} venueContacts={venue?.contacts ?? []} />
          </div>
        </section>
      )}

      {active.has("schedule") && scheduleItems.length > 0 && (
        <section>
          <SectionDivider id="function-schedule" title="Schedule" />
          <div className="mt-3 space-y-5">
            {sortedDateKeys.map((dateKey) => {
              const seenFunctionIds = new Set<string>();
              return (
                <div key={dateKey}>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 print:text-gray-800 mb-2">
                    {formatDateHeading(dateKey, timezone)}
                  </h3>
                  <div className="space-y-2">
                    {scheduleByDay.get(dateKey)!.map((item) => {
                      const attachAnchor = !seenFunctionIds.has(item.function.id);
                      seenFunctionIds.add(item.function.id);
                      return (
                        <ScheduleItemCard
                          key={item.id}
                          item={item}
                          timezone={timezone}
                          scheduleTypes={scheduleTypes}
                          attachFunctionAnchor={attachAnchor}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {active.has("breakouts") && breakoutGroups.length > 0 && (
        <section>
          <SectionDivider id="breakout-schedule" title="Breakouts" />
          <div className="mt-3 space-y-4">
            {breakoutGroups.map((group) => (
              <BreakoutGroupCard key={group.id} group={group} timezone={timezone} />
            ))}
          </div>
        </section>
      )}

      {active.has("catering") && cateringOrders.length > 0 && (
        <section>
          <SectionDivider id="catering" title="Catering" />
          <div className="mt-3 space-y-4">
            {cateringOrders.map((order) => (
              <CateringCard key={order.id} order={order} timezone={timezone} serviceStyles={serviceStyles} />
            ))}
          </div>
        </section>
      )}

      {active.has("print") && printOrders.length > 0 && (
        <section>
          <SectionDivider id="print-orders" title="Print Orders" />
          <div className="mt-3">
            <PrintOrdersTable orders={printOrders} />
          </div>
        </section>
      )}
    </div>
  );
}
