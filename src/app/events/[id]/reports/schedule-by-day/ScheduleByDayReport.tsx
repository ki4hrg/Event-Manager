import type { EventScheduleData, EventScheduleItem } from "@/app/events/reports/actions";
import {
  getDateKeyInTimezone,
  formatDateHeading,
  formatTime,
} from "@/lib/agendaUtils";
import { formatBreakoutSessionName } from "@/lib/breakoutLabels";
import { ReportNav } from "@/components/ReportNav";
import { EmptyState } from "@/components/EmptyState";

type Props = {
  data: EventScheduleData;
  includeNonPublic?: boolean;
};

function functionLabel(item: EventScheduleItem): string {
  return formatBreakoutSessionName(item.function.name, item.function.breakoutGroup?.name);
}

function roomLabel(item: EventScheduleItem): string {
  const names = item.function.rooms.map((r) => r.room.name).filter(Boolean);
  if (names.length > 0) return names.join(", ");
  if (item.function.offSiteLocation) return item.function.offSiteLocation;
  return "";
}

function timeRange(start: Date, end: Date, timezone: string): string {
  return `${formatTime(start, timezone)} – ${formatTime(end, timezone)}`;
}

function groupByDay(
  items: EventScheduleItem[],
  timezone: string
): { dateKey: string; items: EventScheduleItem[] }[] {
  const dated = new Map<string, EventScheduleItem[]>();
  for (const item of items) {
    const key = getDateKeyInTimezone(item.startTime, timezone);
    if (!dated.has(key)) dated.set(key, []);
    dated.get(key)!.push(item);
  }
  return Array.from(dated.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, items]) => ({
      dateKey,
      items: items.sort((a, b) => a.startTime.getTime() - b.startTime.getTime()),
    }));
}

export function ScheduleByDayReport({ data, includeNonPublic = false }: Props) {
  const { items, timezone } = data;

  if (items.length === 0) {
    return <EmptyState message="No schedule items match the selected filters." />;
  }

  const dayGroups = groupByDay(items, timezone);

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

  return (
    <div className="space-y-4">
      <ReportNav sections={navSections} itemGroups={itemGroups} />
      <div className="space-y-5 print:space-y-3">
        {dayGroups.map(({ dateKey, items }) => (
          <section key={dateKey} id={`day-${dateKey}`} className="scroll-mt-24">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white print:text-black pb-0.5 mb-1 border-b border-gray-300 dark:border-gray-600 print:border-gray-500">
              {formatDateHeading(dateKey, timezone)}
            </h2>

            <ul className="sm:hidden print:hidden divide-y divide-gray-200 dark:divide-gray-700 text-xs">
              {items.map((item) => {
                const room = roomLabel(item);
                return (
                  <li key={item.id} className="py-1.5">
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold text-gray-900 dark:text-white">
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

            <table className="hidden sm:table print:table w-full text-xs border-collapse">
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
                      <td className="py-1 align-top text-gray-900 dark:text-white print:text-black">
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
          </section>
        ))}
      </div>
    </div>
  );
}
