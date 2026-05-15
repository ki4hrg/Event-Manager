import type { CustomOption } from "@prisma/client";
import type { RoomScheduleData } from "@/app/events/reports/actions";
import { getDateKeyInTimezone, formatDateHeading, formatTime } from "@/lib/agendaUtils";
import { resolveOptionLabel } from "@/lib/optionUtils";
import { ReportNav } from "@/components/ReportNav";
import { SectionDivider } from "@/components/SectionDivider";
import { EmptyState } from "@/components/EmptyState";
import {
  reportTh as th,
  reportTd as td,
  reportSectionCard as sectionCard,
} from "@/lib/reportStyles";

type Props = {
  data: RoomScheduleData;
  functionTypes: CustomOption[];
  scheduleTypes: CustomOption[];
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
  allDay: boolean;
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
        items.push({
          ...base,
          mainRow: main,
          subRows: subsForDay,
          start: main.startTime,
          end: main.endTime,
          dayKey,
          allDay: multiDay,
        });
      }
    }
  };

  for (const fn of bucket.regularFunctions) emit({ kind: "function", fn }, fn.schedules);
  for (const entry of bucket.breakoutEntries) emit({ kind: "breakout", entry }, entry.block.schedules);

  return items;
}

function groupByDay(items: AgendaItem[]): { dateKey: string; items: AgendaItem[] }[] {
  const dated = new Map<string, AgendaItem[]>();
  for (const item of items) {
    if (!dated.has(item.dayKey)) dated.set(item.dayKey, []);
    dated.get(item.dayKey)!.push(item);
  }
  return Array.from(dated.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, items]) => ({
      dateKey,
      items: items.sort((a, b) => a.start.getTime() - b.start.getTime()),
    }));
}

function timeLabel(item: AgendaItem, timezone: string): string {
  return item.allDay ? "All day" : timeRange(item.start, item.end, timezone);
}

function speakerNames(entry: BreakoutEntry): string {
  return entry.slot.presentation.speakers
    .map((s) => `${s.contact.firstName} ${s.contact.lastName}`.trim())
    .filter(Boolean)
    .join(", ");
}

function timeRange(start: Date, end: Date, timezone: string): string {
  return `${formatTime(start, timezone)} – ${formatTime(end, timezone)}`;
}

function itemTitle(item: AgendaItem): string {
  if (item.kind === "function") return item.fn.name;
  return item.entry.slot.presentation.title;
}

function itemContext(item: AgendaItem, functionTypes: CustomOption[]): string {
  if (item.kind === "function") {
    return resolveOptionLabel(item.fn.type, functionTypes) || item.fn.type || "";
  }
  // breakout: show block name + presentation type (or "Breakout")
  const blockName = item.entry.block.name;
  const presType = resolveOptionLabel(item.entry.slot.presentation.type, []) || "Breakout";
  return `${presType} · in ${blockName}`;
}

function itemNotes(item: AgendaItem): string[] {
  const notes: string[] = [];
  if (item.kind === "function") {
    if (item.fn.description) notes.push(item.fn.description);
    const contacts = item.fn.contacts
      .map((c) => `${c.contact.firstName} ${c.contact.lastName}`.trim())
      .filter(Boolean);
    if (contacts.length > 0) notes.push(contacts.join(", "));
    if (item.fn.notes) notes.push(item.fn.notes);
  } else {
    const speakers = speakerNames(item.entry);
    if (speakers) notes.push(speakers);
    if (item.entry.slot.presentation.description) {
      notes.push(item.entry.slot.presentation.description);
    }
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
          return (
            <div key={rowKey(item)} className="p-2">
              <div className="flex justify-between gap-2">
                <p className="font-semibold text-gray-900 dark:text-white">{itemTitle(item)}</p>
                <p className="shrink-0 text-gray-700 dark:text-gray-300">
                  {timeLabel(item, timezone)}
                </p>
              </div>
              <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                {itemContext(item, functionTypes)}
              </p>
              {notes.map((n, i) => (
                <p key={i} className="text-gray-600 dark:text-gray-300 mt-1 italic">
                  {n}
                </p>
              ))}
              {item.subRows.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-gray-500 dark:text-gray-400">
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
              <th className={th}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const notes = itemNotes(item);
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
                    {notes.length === 0 ? (
                      <span className="text-gray-400">—</span>
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
  const dayGroups = groupByDay(items);
  const venueName = bucket.room.venue?.name;
  const capacity = bucket.room.capacity;

  return (
    <section className="print:break-after-page last:print:break-after-auto">
      <div
        id={`room-${bucket.room.id}`}
        className={`${sectionCard} scroll-mt-24`}
      >
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white print:text-black">
              {bucket.room.name}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 print:text-gray-700 mt-0.5">
              {[venueName, capacity ? `Capacity ${capacity}` : null]
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

export function RoomScheduleReport({ data, functionTypes, scheduleTypes }: Props) {
  const { roomBuckets, timezone } = data;

  if (roomBuckets.length === 0) {
    return <EmptyState message="No rooms match the selected filters." />;
  }

  const navSections = [{ id: "top", label: "Top" }];
  const itemGroups = [
    {
      label: "Rooms",
      links: roomBuckets.map((b) => ({ id: `room-${b.room.id}`, label: b.room.name })),
    },
  ];

  return (
    <div className="space-y-6">
      <ReportNav sections={navSections} itemGroups={itemGroups} />
      <div className="print:hidden">
        <SectionDivider id="rooms" title="Room Schedules" />
      </div>
      <div className="space-y-6">
        {roomBuckets.map((bucket) => (
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
  );
}
