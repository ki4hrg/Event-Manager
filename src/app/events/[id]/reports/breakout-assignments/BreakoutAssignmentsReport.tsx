import type {
  BreakoutScheduleData,
  BreakoutScheduleGroup,
} from "@/app/events/reports/data";
import { ReportNav } from "@/components/ReportNav";
import { SectionDivider } from "@/components/SectionDivider";
import { EmptyState } from "@/components/EmptyState";
import { formatFunctionLabel } from "@/lib/functionNumbers";
import { formatSessionTime, getPrimaryNames } from "@/app/events/breakout-schedule/utils";
import {
  reportTh as th,
  reportTd as td,
  reportSectionCard as sectionCard,
} from "@/lib/reportStyles";

type Props = {
  data: BreakoutScheduleData;
};

type Presentation = BreakoutScheduleGroup["presentations"][number];
type Session = BreakoutScheduleGroup["functions"][number];

type AssignmentRow = {
  key: string;
  sessionLabel: string;
  sessionTime: string;
  roomName: string | null;
};

function buildAssignmentRows(
  presentation: Presentation,
  sessionsById: Map<string, Session>,
  groupName: string,
  timezone: string
): AssignmentRow[] {
  const filledRows: AssignmentRow[] = presentation.slots.map((slot) => {
    const session = sessionsById.get(slot.functionId);
    return {
      key: `slot-${slot.id}`,
      sessionLabel: session
        ? formatFunctionLabel({ name: session.name, functionNumber: session.functionNumber, breakoutGroup: { name: groupName } })
        : "Unknown session",
      sessionTime: session ? formatSessionTime(session.schedules, timezone) : "",
      roomName: slot.room?.name ?? null,
    };
  });

  filledRows.sort((a, b) => a.sessionLabel.localeCompare(b.sessionLabel, undefined, { numeric: true }));

  const remaining = Math.max(0, presentation.instanceCount - presentation.slots.length);
  const unassignedRows: AssignmentRow[] = Array.from({ length: remaining }, (_, i) => ({
    key: `unassigned-${presentation.id}-${i}`,
    sessionLabel: "Unassigned",
    sessionTime: "",
    roomName: null,
  }));

  return [...filledRows, ...unassignedRows];
}

function PresentationCard({
  presentation,
  group,
  sessionsById,
  timezone,
}: {
  presentation: Presentation;
  group: BreakoutScheduleGroup;
  sessionsById: Map<string, Session>;
  timezone: string;
}) {
  const rows = buildAssignmentRows(presentation, sessionsById, group.name, timezone);
  const speakers = getPrimaryNames(presentation.speakers);

  return (
    <div
      id={`presentation-${presentation.id}-${group.id}`}
      className="scroll-mt-24 border border-gray-200 dark:border-gray-700 rounded p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 dark:text-white print:text-black break-words">
            {presentation.title}
          </p>
          {speakers && (
            <p className="text-xs text-gray-500 dark:text-gray-400 print:text-gray-700 mt-0.5">
              {speakers}
            </p>
          )}
        </div>
        {presentation.instanceCount > 1 && (
          <p className="text-xs text-gray-500 dark:text-gray-400 print:text-gray-700">
            {presentation.slots.length} of {presentation.instanceCount} assigned
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-gray-400 italic">No assignments.</p>
      ) : (
        <>
          <div className="sm:hidden print:hidden mt-3 divide-y divide-gray-200 dark:divide-gray-700 text-xs">
            {rows.map((row) => (
              <div key={row.key} className="py-2">
                <p className="font-medium text-gray-900 dark:text-white break-words">
                  {row.sessionLabel}
                </p>
                {row.sessionTime && (
                  <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                    {row.sessionTime}
                  </p>
                )}
                <p
                  className={
                    row.roomName
                      ? "text-gray-700 dark:text-gray-300 mt-0.5 break-words"
                      : "text-gray-400 dark:text-gray-500 italic mt-0.5"
                  }
                >
                  {row.roomName ?? "Unassigned"}
                </p>
              </div>
            ))}
          </div>

          <div className="hidden sm:block print:block mt-3 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className={th}>Session</th>
                  <th className={th}>Time</th>
                  <th className={th}>Room</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <td className={`${td} font-medium`}>{row.sessionLabel}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      {row.sessionTime || (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className={td}>
                      {row.roomName ?? (
                        <span className="text-gray-400 italic">Unassigned</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function GroupSection({
  group,
  timezone,
}: {
  group: BreakoutScheduleGroup;
  timezone: string;
}) {
  const sessionsById = new Map(group.functions.map((s) => [s.id, s]));

  return (
    <section className={`${sectionCard} scroll-mt-24`} id={`group-${group.id}`}>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white print:text-black">
        {group.name}
      </h3>

      {group.presentations.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400 print:text-gray-700 italic">
          No presentations.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {group.presentations.map((p) => (
            <PresentationCard
              key={p.id}
              presentation={p}
              group={group}
              sessionsById={sessionsById}
              timezone={timezone}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function BreakoutAssignmentsReport({ data }: Props) {
  const { groups, timezone } = data;

  if (groups.length === 0) {
    return <EmptyState message="No results." />;
  }

  const hasAnyPresentations = groups.some((g) => g.presentations.length > 0);
  if (!hasAnyPresentations) {
    return <EmptyState message="No presentations assigned." />;
  }

  const navSections = [{ id: "top", label: "Top" }];
  const itemGroups = groups.map((g) => ({
    label: g.name,
    links: g.presentations.map((p) => ({
      id: `presentation-${p.id}-${g.id}`,
      label: p.title,
    })),
  }));

  return (
    <div className="space-y-6">
      <ReportNav sections={navSections} itemGroups={itemGroups} />
      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.id} className="space-y-3">
            <div className="print:hidden">
              <SectionDivider id={`group-${group.id}-divider`} title={group.name} />
            </div>
            <GroupSection group={group} timezone={timezone} />
          </div>
        ))}
      </div>
    </div>
  );
}
