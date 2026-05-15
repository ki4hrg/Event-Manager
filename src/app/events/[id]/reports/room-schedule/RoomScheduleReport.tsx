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

type AgendaItem =
  | {
      kind: "function";
      fn: RegularFn;
      mainRow: ScheduleRow;
      subRows: ScheduleRow[];
      start: Date;
      end: Date;
    }
  | {
      kind: "breakout";
      entry: BreakoutEntry;
      mainRow: ScheduleRow;
      subRows: ScheduleRow[];
      start: Date;
      end: Date;
    };

function pickMainRow(schedules: ScheduleRow[]): {
  main: ScheduleRow | null;
  subs: ScheduleRow[];
} {
  if (schedules.length === 0) return { main: null, subs: [] };
  const publicRows = schedules.filter((s) => s.isPublic);
  const pool = publicRows.length > 0 ? publicRows : schedules;
  const main = pool.reduce((longest, s) => {
    const dur = s.endTime.getTime() - s.startTime.getTime();
    const longestDur = longest.endTime.getTime() - longest.startTime.getTime();
    return dur > longestDur ? s : longest;
  }, pool[0]);
  const subs = schedules
    .filter((s) => s.id !== main.id)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  return { main, subs };
}

function buildAgendaItems(bucket: RoomBucket): AgendaItem[] {
  const items: AgendaItem[] = [];

  for (const fn of bucket.regularFunctions) {
    const { main, subs } = pickMainRow(fn.schedules);
    if (!main) continue;
    items.push({
      kind: "function",
      fn,
      mainRow: main,
      subRows: subs,
      start: main.startTime,
      end: main.endTime,
    });
  }

  for (const entry of bucket.breakoutEntries) {
    const { main, subs } = pickMainRow(entry.block.schedules);
    if (!main) continue;
    items.push({
      kind: "breakout",
      entry,
      mainRow: main,
      subRows: subs,
      start: main.startTime,
      end: main.endTime,
    });
  }

  items.sort((a, b) => a.start.getTime() - b.start.getTime());
  return items;
}

function groupByDay(
  items: AgendaItem[],
  timezone: string
): { dateKey: string; items: AgendaItem[] }[] {
  const dated = new Map<string, AgendaItem[]>();
  for (const item of items) {
    const key = getDateKeyInTimezone(item.start, timezone);
    if (!dated.has(key)) dated.set(key, []);
    dated.get(key)!.push(item);
  }
  return Array.from(dated.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, items]) => ({ dateKey, items }));
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
  return notes;
}

function anchorIdFor(item: AgendaItem): string {
  return item.kind === "function"
    ? `function-${item.fn.id}`
    : `presentation-${item.entry.slot.presentation.id}-${item.entry.block.id}`;
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
            <div key={anchorIdFor(item)} id={anchorIdFor(item)} className="p-2 scroll-mt-24">
              <div className="flex justify-between gap-2">
                <p className="font-semibold text-gray-900 dark:text-white">{itemTitle(item)}</p>
                <p className="shrink-0 text-gray-700 dark:text-gray-300">
                  {timeRange(item.start, item.end, timezone)}
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
                    <li key={row.id}>
                      {resolveOptionLabel(row.type, scheduleTypes) || row.type}: {timeRange(row.startTime, row.endTime, timezone)}
                    </li>
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
                <tr key={anchorIdFor(item)} id={anchorIdFor(item)} className="scroll-mt-24">
                  <td className={`${td} whitespace-nowrap font-medium`}>
                    {timeRange(item.start, item.end, timezone)}
                    {item.subRows.length > 0 && (
                      <div className="mt-1 text-[11px] text-gray-500 dark:text-gray-400 print:text-gray-600 font-normal">
                        {item.subRows.map((row) => (
                          <div key={row.id}>
                            {resolveOptionLabel(row.type, scheduleTypes) || row.type}:{" "}
                            {timeRange(row.startTime, row.endTime, timezone)}
                          </div>
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
  const items = buildAgendaItems(bucket);
  const dayGroups = groupByDay(items, timezone);
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
      <SectionDivider id="rooms" title="Room Schedules" />
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
