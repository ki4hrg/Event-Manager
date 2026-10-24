import type { CustomOption } from "@prisma/client";
import type { RoomScheduleData } from "@/app/events/reports/data";
import {
  getDateKeyInTimezone,
  groupByDay,
  formatDateHeading,
  formatTime,
  getStartOfDayInTimezone,
  getNextDateKey,
} from "@/lib/agendaUtils";
import { resolveOptionLabel } from "@/lib/optionUtils";
import { formatFunctionLabel } from "@/lib/functionNumbers";
import { ReportNav } from "@/components/ReportNav";
import { SectionDivider } from "@/components/SectionDivider";
import { EmptyState } from "@/components/EmptyState";
import { formatRoomCapacities } from "@/lib/roomCapacity";
import {
  reportTh as th,
  reportTd as td,
  reportSectionCard as sectionCard,
} from "@/lib/reportStyles";

type Props = {
  data: RoomScheduleData;
  functionTypes: CustomOption[];
  scheduleTypes: CustomOption[];
  usedOnly?: boolean;
};

type RoomBucket = RoomScheduleData["roomBuckets"][number];
type RegularFn = RoomBucket["regularFunctions"][number];
type BreakoutEntry = RoomBucket["breakoutEntries"][number];

type ScheduleRow = RegularFn["schedules"][number];

type AgendaItem = (
  | { kind: "function"; fn: RegularFn }
  | { kind: "breakout"; entry: BreakoutEntry }
) & {
  mainRow: ScheduleRow;
  subRows: ScheduleRow[];
  start: Date;
  end: Date;
  dayKey: string;
  segmentPosition: "single" | "first" | "middle" | "last";
};

function pickMainsAndSubs(
  schedules: ScheduleRow[]
): { main: ScheduleRow; subs: ScheduleRow[] }[] {
  if (schedules.length === 0) return [];
  const publicRows = schedules.filter((s) => s.isPublic);
  let mains: ScheduleRow[];
  let others: ScheduleRow[];
  if (publicRows.length > 0) {
    mains = [...publicRows].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    others = schedules.filter((s) => !s.isPublic);
  } else {
    const longest = schedules.reduce((longest, s) => {
      const dur = s.endTime.getTime() - s.startTime.getTime();
      const longestDur = longest.endTime.getTime() - longest.startTime.getTime();
      return dur > longestDur ? s : longest;
    }, schedules[0]);
    mains = [longest];
    others = schedules.filter((s) => s.id !== longest.id);
  }

  const subsByMain = new Map<string, ScheduleRow[]>(mains.map((m) => [m.id, []]));
  for (const sub of others) {
    const nearest = mains.reduce((best, m) => {
      const dBest = Math.abs(sub.startTime.getTime() - best.startTime.getTime());
      const dM = Math.abs(sub.startTime.getTime() - m.startTime.getTime());
      return dM < dBest ? m : best;
    }, mains[0]);
    subsByMain.get(nearest.id)!.push(sub);
  }

  return mains.map((main) => ({
    main,
    subs: subsByMain
      .get(main.id)!
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime()),
  }));
}

function enumerateDayKeys(start: Date, end: Date, timezone: string): string[] {
  const startKey = getDateKeyInTimezone(start, timezone);
  const endKey = getDateKeyInTimezone(end, timezone);
  if (startKey >= endKey) return [startKey];
  const keys: string[] = [startKey];
  let cursor = startKey;
  for (let i = 0; i < 60 && cursor < endKey; i++) {
    const d = new Date(`${cursor}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    cursor = d.toISOString().slice(0, 10);
    keys.push(cursor);
  }
  return keys;
}


function buildAgendaItems(bucket: RoomBucket, timezone: string): AgendaItem[] {
  const items: AgendaItem[] = [];

  const emit = (
    base: { kind: "function"; fn: RegularFn } | { kind: "breakout"; entry: BreakoutEntry },
    schedules: ScheduleRow[]
  ) => {
    for (const { main, subs } of pickMainsAndSubs(schedules)) {
      const dayKeys = enumerateDayKeys(main.startTime, main.endTime, timezone);
      const multiDay = dayKeys.length > 1;
      for (const dayKey of dayKeys) {
        const subsForDay = multiDay
          ? subs.filter((s) => getDateKeyInTimezone(s.startTime, timezone) === dayKey)
          : subs;
        const dayStart = getStartOfDayInTimezone(dayKey, timezone);
        const dayEnd = getStartOfDayInTimezone(getNextDateKey(dayKey), timezone);
        const segStart = main.startTime > dayStart ? main.startTime : dayStart;
        const segEnd = main.endTime < dayEnd ? main.endTime : dayEnd;
        const isFirst = dayKey === dayKeys[0];
        const isLast = dayKey === dayKeys[dayKeys.length - 1];
        const segmentPosition: AgendaItem["segmentPosition"] = !multiDay
          ? "single"
          : isFirst
            ? "first"
            : isLast
              ? "last"
              : "middle";
        items.push({
          ...base,
          mainRow: main,
          subRows: subsForDay,
          start: segStart,
          end: segEnd,
          dayKey,
          segmentPosition,
        });
      }
    }
  };

  for (const fn of bucket.regularFunctions) emit({ kind: "function", fn }, fn.schedules);
  for (const entry of bucket.breakoutEntries) emit({ kind: "breakout", entry }, entry.block.schedules);

  return items;
}

function timeLabel(item: AgendaItem, timezone: string): string {
  const range = timeRange(item.start, item.end, timezone);
  switch (item.segmentPosition) {
    case "first":
      return `${range} →`;
    case "middle":
      return "Continues all day";
    case "last":
      return `→ ${range}`;
    default:
      return range;
  }
}

function speakerNames(entry: BreakoutEntry): string {
  return entry.slot.presentation.speakers
    .map((s) => `${s.contact.firstName} ${s.contact.lastName}`.trim())
    .filter(Boolean)
    .join(", ");
}

function itemContacts(item: AgendaItem): string[] {
  if (item.kind === "function") {
    return item.fn.contacts
      .map((c) => {
        const name = `${c.contact.firstName} ${c.contact.lastName}`.trim();
        return c.role ? `${name} (${c.role})` : name;
      })
      .filter(Boolean);
  }
  const speakers = speakerNames(item.entry);
  return speakers ? [speakers] : [];
}

function timeRange(start: Date, end: Date, timezone: string): string {
  return `${formatTime(start, timezone)} – ${formatTime(end, timezone)}`;
}

function itemTitle(item: AgendaItem): string {
  if (item.kind === "function") return formatFunctionLabel({ name: item.fn.name, functionNumber: item.fn.functionNumber });
  return item.entry.slot.presentation.title;
}

function itemContext(item: AgendaItem, functionTypes: CustomOption[]): string {
  if (item.kind === "function") {
    return resolveOptionLabel(item.fn.type, functionTypes) || item.fn.type || "";
  }
  // breakout: show block name + presentation type (or "Breakout")
  const blockName = formatFunctionLabel(item.entry.block);
  const presType = resolveOptionLabel(item.entry.slot.presentation.type, []) || "Breakout";
  return `${presType} · in ${blockName}`;
}

function itemNotes(item: AgendaItem): string[] {
  const notes: string[] = [];
  if (item.kind === "function") {
    if (item.fn.description) notes.push(item.fn.description);
    if (item.fn.notes) notes.push(item.fn.notes);
  } else if (item.entry.slot.presentation.description) {
    notes.push(item.entry.slot.presentation.description);
  }
  if (item.mainRow.notes) notes.push(item.mainRow.notes);
  return notes;
}

function subRowLabel(row: ScheduleRow, scheduleTypes: CustomOption[], timezone: string): string {
  const type = resolveOptionLabel(row.type, scheduleTypes) || row.type;
  const time = timeRange(row.startTime, row.endTime, timezone);
  const base = `${type}: ${time}`;
  return row.notes ? `${base} · ${row.notes}` : base;
}

function rowKey(item: AgendaItem): string {
  const base =
    item.kind === "function"
      ? `function-${item.fn.id}`
      : `presentation-${item.entry.slot.presentation.id}-${item.entry.block.id}`;
  return `${base}-${item.mainRow.id}-${item.dayKey}`;
}

function RoomDayTable({
  items,
  timezone,
  functionTypes,
  scheduleTypes,
}: {
  items: AgendaItem[];
  timezone: string;
  functionTypes: CustomOption[];
  scheduleTypes: CustomOption[];
}) {
  return (
    <>
      <div className="sm:hidden print:hidden border border-gray-200 dark:border-gray-700 rounded divide-y divide-gray-200 dark:divide-gray-700 text-xs">
        {items.map((item) => {
          const notes = itemNotes(item);
          const contacts = itemContacts(item);
          return (
            <div key={rowKey(item)} className="p-2">
              <div className="flex justify-between gap-2">
                <p className="min-w-0 break-words font-semibold text-gray-900 dark:text-white">{itemTitle(item)}</p>
                <p className="shrink-0 text-gray-700 dark:text-gray-300">
                  {timeLabel(item, timezone)}
                </p>
              </div>
              <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                {itemContext(item, functionTypes)}
              </p>
              {contacts.length > 0 && (
                <p className="text-gray-700 dark:text-gray-300 mt-1 break-words">
                  {contacts.join(", ")}
                </p>
              )}
              {notes.map((n, i) => (
                <p key={i} className="text-gray-600 dark:text-gray-300 mt-1 italic break-words">
                  {n}
                </p>
              ))}
              {item.subRows.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-gray-500 dark:text-gray-400 break-words">
                  {item.subRows.map((row) => (
                    <li key={row.id}>{subRowLabel(row, scheduleTypes, timezone)}</li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      <div className="hidden sm:block print:block overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className={`${th} w-44`}>Time</th>
              <th className={th}>Title</th>
              <th className={th}>Type</th>
              <th className={th}>Contacts</th>
              <th className={th}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const notes = itemNotes(item);
              const contacts = itemContacts(item);
              return (
                <tr key={rowKey(item)}>
                  <td className={`${td} whitespace-nowrap font-medium`}>
                    {timeLabel(item, timezone)}
                    {item.subRows.length > 0 && (
                      <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 print:text-gray-600 font-normal">
                        {item.subRows.map((row) => (
                          <div key={row.id}>{subRowLabel(row, scheduleTypes, timezone)}</div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className={`${td} font-semibold text-gray-900 dark:text-white print:text-black`}>
                    {itemTitle(item)}
                  </td>
                  <td className={td}>{itemContext(item, functionTypes)}</td>
                  <td className={td}>
                    {contacts.length === 0 ? (
                      <span className="text-gray-400 dark:text-gray-500">—</span>
                    ) : (
                      <div className="space-y-0.5">
                        {contacts.map((c, i) => (
                          <div key={i}>{c}</div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className={td}>
                    {notes.length === 0 ? (
                      <span className="text-gray-400 dark:text-gray-500">—</span>
                    ) : (
                      <div className="space-y-0.5">
                        {notes.map((n, i) => (
                          <div key={i}>{n}</div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function RoomSection({
  bucket,
  timezone,
  functionTypes,
  scheduleTypes,
}: {
  bucket: RoomBucket;
  timezone: string;
  functionTypes: CustomOption[];
  scheduleTypes: CustomOption[];
}) {
  const items = buildAgendaItems(bucket, timezone);
  const dayGroups = groupByDay(items, (i) => i.dayKey, (i) => i.start);
  const venueName = bucket.room.venue?.name;
  const capacity = bucket.room.capacity;
  const setupCapacities = formatRoomCapacities(bucket.room.capacities ?? []);

  return (
    <section className="print:break-after-page last:print:break-after-auto">
      <div
        id={`room-${bucket.room.id}`}
        className={`${sectionCard} scroll-mt-24`}
      >
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white print:text-black break-words">
              {bucket.room.name}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 print:text-gray-700 mt-0.5">
              {[venueName, capacity ? `Capacity ${capacity}` : null, setupCapacities]
                .filter(Boolean)
                .join(" · ") || "—"}
            </p>
          </div>
        </div>

        {items.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400 print:text-gray-700">
            Nothing scheduled for this room.
          </p>
        ) : (
          <div className="mt-4 space-y-5">
            {dayGroups.map(({ dateKey, items }) => (
              <div key={dateKey}>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 print:text-gray-800 mb-2">
                  {formatDateHeading(dateKey, timezone)}
                </h3>
                <RoomDayTable
                  items={items}
                  timezone={timezone}
                  functionTypes={functionTypes}
                  scheduleTypes={scheduleTypes}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

type GroupedRoomBuckets = {
  groupId: string | null;
  label: string;
  sortOrder: number;
  buckets: RoomBucket[];
};

function bucketsByGroup(roomBuckets: RoomBucket[]): GroupedRoomBuckets[] {
  const out = new Map<string, GroupedRoomBuckets>();
  for (const bucket of roomBuckets) {
    const group = bucket.room.group ?? null;
    const key = group?.id ?? "__ungrouped__";
    if (!out.has(key)) {
      out.set(key, {
        groupId: group?.id ?? null,
        label: group?.name ?? "Ungrouped",
        sortOrder: group?.sortOrder ?? Number.MAX_SAFE_INTEGER,
        buckets: [],
      });
    }
    out.get(key)!.buckets.push(bucket);
  }
  return Array.from(out.values()).sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.label.localeCompare(b.label);
  });
}

export function RoomScheduleReport({ data, functionTypes, scheduleTypes, usedOnly = false }: Props) {
  const { roomBuckets, timezone } = data;

  const visibleBuckets = usedOnly
    ? roomBuckets.filter(
        (b) => b.regularFunctions.length > 0 || b.breakoutEntries.length > 0
      )
    : roomBuckets;

  if (visibleBuckets.length === 0) {
    return <EmptyState message="No rooms." />;
  }

  const grouped = bucketsByGroup(visibleBuckets);
  const hasGroups = grouped.some((g) => g.groupId !== null);

  const navSections = [{ id: "top", label: "Top" }];
  const itemGroups = hasGroups
    ? grouped.map((g) => ({
        label: g.label,
        links: g.buckets.map((b) => ({ id: `room-${b.room.id}`, label: b.room.name })),
      }))
    : [
        {
          label: "Rooms",
          links: visibleBuckets.map((b) => ({ id: `room-${b.room.id}`, label: b.room.name })),
        },
      ];

  return (
    <div className="space-y-6">
      <ReportNav sections={navSections} itemGroups={itemGroups} />
      <div className="print:hidden">
        <SectionDivider id="rooms" title="Room Schedules" />
      </div>
      {hasGroups ? (
        <div className="space-y-8">
          {grouped.map((g) => (
            <div key={g.groupId ?? "__ungrouped__"} className="space-y-4">
              <h2
                id={`room-group-${g.groupId ?? "ungrouped"}`}
                className="scroll-mt-24 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide border-b border-gray-200 dark:border-gray-700 pb-1 print:hidden"
              >
                {g.label}
              </h2>
              <div className="space-y-6">
                {g.buckets.map((bucket) => (
                  <RoomSection
                    key={bucket.room.id}
                    bucket={bucket}
                    timezone={timezone}
                    functionTypes={functionTypes}
                    scheduleTypes={scheduleTypes}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {visibleBuckets.map((bucket) => (
            <RoomSection
              key={bucket.room.id}
              bucket={bucket}
              timezone={timezone}
              functionTypes={functionTypes}
              scheduleTypes={scheduleTypes}
            />
          ))}
        </div>
      )}
    </div>
  );
}
