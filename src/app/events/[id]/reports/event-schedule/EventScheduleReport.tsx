import type { CustomOption } from "@prisma/client";
import type { EventScheduleData, EventScheduleItem } from "@/app/events/reports/data";
import {
  getDateKeyInTimezone,
  groupByDay,
  formatDateHeading,
  formatTime,
} from "@/lib/agendaUtils";
import { resolveOptionLabel } from "@/lib/optionUtils";
import { formatFunctionLabel } from "@/lib/functionNumbers";
import { ReportNav } from "@/components/ReportNav";
import { EmptyState } from "@/components/EmptyState";
import {
  reportTh as th,
  reportTd as td,
  reportSectionCard as sectionCard,
} from "@/lib/reportStyles";

type Props = {
  data: EventScheduleData;
  scheduleTypes: CustomOption[];
  includeNonPublic?: boolean;
  compact?: boolean;
};

function functionLabel(item: EventScheduleItem): string {
  return formatFunctionLabel(item.function);
}

function roomLabel(item: EventScheduleItem): string {
  const names = item.function.rooms.map((r) => r.room.name).filter(Boolean);
  if (names.length > 0) return names.join(", ");
  if (item.function.offSiteLocation) return item.function.offSiteLocation;
  return "";
}

type BreakoutSubRow = { roomName: string; presentationTitle: string };

function breakoutSubRows(item: EventScheduleItem): BreakoutSubRow[] {
  if (item.function.type !== "BREAKOUT_BLOCK") return [];
  return item.function.presentationSlots
    .map((slot) => ({
      roomName: slot.room?.name ?? "Unassigned",
      presentationTitle: slot.presentation.title,
    }))
    .sort((a, b) => {
      if (a.roomName === "Unassigned" && b.roomName !== "Unassigned") return 1;
      if (b.roomName === "Unassigned" && a.roomName !== "Unassigned") return -1;
      return a.roomName.localeCompare(b.roomName);
    });
}

function timeRange(start: Date, end: Date, timezone: string): string {
  return `${formatTime(start, timezone)} – ${formatTime(end, timezone)}`;
}

function DayTable({
  items,
  timezone,
  scheduleTypes,
  includeNonPublic,
}: {
  items: EventScheduleItem[];
  timezone: string;
  scheduleTypes: CustomOption[];
  includeNonPublic: boolean;
}) {
  return (
    <>
      <div className="sm:hidden print:hidden border border-gray-200 dark:border-gray-700 rounded divide-y divide-gray-200 dark:divide-gray-700 text-xs">
        {items.map((item) => {
          const room = roomLabel(item);
          const type = resolveOptionLabel(item.type, scheduleTypes) || item.type;
          const subRows = breakoutSubRows(item);
          return (
            <div key={item.id} className="p-2">
              <div className="flex justify-between gap-2">
                <p className="min-w-0 break-words font-semibold text-gray-900 dark:text-white">{functionLabel(item)}</p>
                <p className="shrink-0 text-gray-700 dark:text-gray-300">
                  {timeRange(item.startTime, item.endTime, timezone)}
                </p>
              </div>
              <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                {type}
                {includeNonPublic && !item.isPublic && (
                  <span className="ml-2 inline-block px-1.5 py-0.5 text-[10px] uppercase tracking-wide rounded bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200">
                    Internal
                  </span>
                )}
              </p>
              {room && (
                <p className="text-gray-700 dark:text-gray-300 mt-1 break-words">{room}</p>
              )}
              {subRows.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-gray-600 dark:text-gray-300">
                  {subRows.map((s, i) => (
                    <li key={i}>
                      <span className="font-medium">{s.roomName}</span>
                      <span className="text-gray-400 dark:text-gray-500"> — </span>
                      {s.presentationTitle}
                    </li>
                  ))}
                </ul>
              )}
              {item.notes && (
                <p className="text-gray-600 dark:text-gray-300 mt-1 italic">{item.notes}</p>
              )}
            </div>
          );
        })}
      </div>
      <div className="hidden sm:block print:block overflow-x-auto">
        <table className="w-full table-fixed text-sm border-collapse">
          <colgroup>
            <col className="w-40" />
            <col />
            <col className="w-32" />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th className={th}>Time</th>
              <th className={th}>Function</th>
              <th className={th}>Type</th>
              <th className={th}>Room(s)</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const room = roomLabel(item);
              const type = resolveOptionLabel(item.type, scheduleTypes) || item.type;
              const subRows = breakoutSubRows(item);
              return (
                <tr key={item.id} id={`schedule-${item.id}`} className="scroll-mt-24">
                  <td className={`${td} whitespace-nowrap font-medium`}>
                    {timeRange(item.startTime, item.endTime, timezone)}
                  </td>
                  <td className={`${td} break-words font-semibold text-gray-900 dark:text-white print:text-black`}>
                    {functionLabel(item)}
                    {item.notes && (
                      <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400 print:text-gray-600 font-normal italic">
                        {item.notes}
                      </div>
                    )}
                  </td>
                  <td className={td}>
                    {type}
                    {includeNonPublic && !item.isPublic && (
                      <span className="ml-2 inline-block px-1.5 py-0.5 text-[10px] uppercase tracking-wide rounded bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 align-middle font-normal">
                        Internal
                      </span>
                    )}
                  </td>
                  <td className={`${td} break-words`}>
                    {room || (subRows.length === 0 && <span className="text-gray-400 dark:text-gray-500">—</span>)}
                    {subRows.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-[12px] text-gray-600 dark:text-gray-300 print:text-gray-700 font-normal">
                        {subRows.map((s, i) => (
                          <li key={i}>
                            <span className="font-medium">{s.roomName}</span>
                            <span className="text-gray-400 dark:text-gray-500"> — </span>
                            {s.presentationTitle}
                          </li>
                        ))}
                      </ul>
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

function CompactDayTable({
  items,
  timezone,
  includeNonPublic,
}: {
  items: EventScheduleItem[];
  timezone: string;
  includeNonPublic: boolean;
}) {
  return (
    <>
      <ul className="sm:hidden print:hidden divide-y divide-gray-200 dark:divide-gray-700 text-xs">
        {items.map((item) => {
          const room = roomLabel(item);
          return (
            <li key={item.id} className="py-1.5">
              <div className="flex justify-between gap-2">
                <span className="min-w-0 break-words font-semibold text-gray-900 dark:text-white">
                  {functionLabel(item)}
                </span>
                <span className="shrink-0 text-gray-700 dark:text-gray-300 tabular-nums">
                  {timeRange(item.startTime, item.endTime, timezone)}
                </span>
              </div>
              {(room || (includeNonPublic && !item.isPublic)) && (
                <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                  {room}
                  {includeNonPublic && !item.isPublic && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300">
                      Internal
                    </span>
                  )}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <table className="hidden sm:table print:table w-full table-fixed text-xs border-collapse">
        <colgroup>
          <col className="w-36" />
          <col />
        </colgroup>
        <tbody>
          {items.map((item) => {
            const room = roomLabel(item);
            return (
              <tr
                key={item.id}
                className="print:break-inside-avoid border-b border-gray-100 dark:border-gray-700 print:border-gray-200 last:border-b-0"
              >
                <td className="py-1 pr-3 align-top whitespace-nowrap font-medium tabular-nums text-gray-900 dark:text-white print:text-black">
                  {timeRange(item.startTime, item.endTime, timezone)}
                </td>
                <td className="py-1 align-top break-words text-gray-900 dark:text-white print:text-black">
                  <span className="font-medium">{functionLabel(item)}</span>
                  {room && (
                    <span className="text-gray-500 dark:text-gray-400 print:text-gray-600">
                      {" · "}
                      {room}
                    </span>
                  )}
                  {includeNonPublic && !item.isPublic && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300">
                      Internal
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

export function EventScheduleReport({
  data,
  scheduleTypes,
  includeNonPublic = false,
  compact = false,
}: Props) {
  const { items, timezone } = data;

  if (items.length === 0) {
    return <EmptyState message="No results." />;
  }

  const dayGroups = groupByDay(
    items,
    (i) => getDateKeyInTimezone(i.startTime, timezone),
    (i) => i.startTime
  );

  const navSections = [{ id: "top", label: "Top" }];
  const itemGroups = [
    {
      label: "Days",
      links: dayGroups.map((g) => ({
        id: `day-${g.dateKey}`,
        label: formatDateHeading(g.dateKey, timezone),
      })),
    },
  ];

  if (compact) {
    return (
      <div className="space-y-4">
        <ReportNav sections={navSections} itemGroups={itemGroups} />
        <div className="space-y-5 print:space-y-3">
          {dayGroups.map(({ dateKey, items }) => (
            <section key={dateKey} id={`day-${dateKey}`} className="scroll-mt-24">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white print:text-black pb-0.5 mb-1 border-b border-gray-300 dark:border-gray-600 print:border-gray-500">
                {formatDateHeading(dateKey, timezone)}
              </h2>
              <CompactDayTable
                items={items}
                timezone={timezone}
                includeNonPublic={includeNonPublic}
              />
            </section>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ReportNav sections={navSections} itemGroups={itemGroups} />
      <div className="space-y-8">
        {dayGroups.map(({ dateKey, items }) => (
          <section
            key={dateKey}
            id={`day-${dateKey}`}
            className={`${sectionCard} scroll-mt-24 print:break-after-page last:print:break-after-auto`}
          >
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white print:text-black mb-4">
              {formatDateHeading(dateKey, timezone)}
            </h2>
            <DayTable
              items={items}
              timezone={timezone}
              scheduleTypes={scheduleTypes}
              includeNonPublic={includeNonPublic}
            />
          </section>
        ))}
      </div>
    </div>
  );
}
