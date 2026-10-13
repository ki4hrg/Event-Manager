import type { Room } from "@prisma/client";
import type {
  BreakoutScheduleData,
  BreakoutScheduleGroup,
} from "@/app/events/reports/actions";
import { ReportNav } from "@/components/ReportNav";
import { SectionDivider } from "@/components/SectionDivider";
import { EmptyState } from "@/components/EmptyState";
import { formatFunctionLabel } from "@/lib/functionNumbers";
import {
  getEffectiveRooms,
  formatSessionTime,
  getPrimaryNames,
  chunkArray,
} from "@/app/events/breakout-schedule/utils";
import {
  reportTh as th,
  reportThWrap as roomTh,
  reportTd as td,
  reportSectionCard as sectionCard,
} from "@/lib/reportStyles";

// Max rooms per table chunk before splitting onto a new page.
const ROOMS_PER_CHUNK = 8;

type Props = {
  data: BreakoutScheduleData;
};

type Session = BreakoutScheduleGroup["functions"][number];

function GroupSection({
  group,
  timezone,
}: {
  group: BreakoutScheduleGroup;
  timezone: string;
}) {
  const allRooms = new Map<string, Room>();
  const sessionEffectiveRooms = new Map<string, Set<string>>();

  for (const session of group.functions) {
    const effective = getEffectiveRooms(session, group.rooms);
    sessionEffectiveRooms.set(session.id, new Set(effective.map((r) => r.id)));
    for (const room of effective) {
      allRooms.set(room.id, room);
    }
  }

  const roomList = Array.from(allRooms.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  if (group.functions.length === 0 || roomList.length === 0) {
    return (
      <section className={`${sectionCard} scroll-mt-24`} id={`group-${group.id}`}>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white print:text-black">
          {group.name}
        </h3>
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400 print:text-gray-700 italic">
          {group.functions.length === 0 ? "No sessions defined." : "No rooms assigned."}
        </p>
      </section>
    );
  }

  const roomChunks = chunkArray(roomList, ROOMS_PER_CHUNK);

  return (
    <section className={`${sectionCard} scroll-mt-24`} id={`group-${group.id}`}>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white print:text-black">
        {group.name}
      </h3>

      <MobileSessions
        sessions={group.functions}
        sessionEffectiveRooms={sessionEffectiveRooms}
        timezone={timezone}
        groupName={group.name}
      />

      <div className="hidden sm:block print:block mt-4 space-y-6">
        {roomChunks.map((chunkRooms, chunkIndex) => (
          <div
            key={chunkIndex}
            className={chunkIndex > 0 ? "print:break-before-page" : undefined}
          >
            {roomChunks.length > 1 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 print:text-gray-700 mb-2">
                Rooms {chunkIndex * ROOMS_PER_CHUNK + 1}–
                {Math.min((chunkIndex + 1) * ROOMS_PER_CHUNK, roomList.length)} of{" "}
                {roomList.length}
              </p>
            )}
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full border-collapse table-fixed text-sm">
                <colgroup>
                  <col style={{ width: "13%" }} />
                  {chunkRooms.map((room) => (
                    <col
                      key={room.id}
                      style={{ width: `${87 / chunkRooms.length}%` }}
                    />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    <th className={th}>Session</th>
                    {chunkRooms.map((room) => (
                      <th key={room.id} className={roomTh}>
                        {room.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.functions.map((session) => {
                    const effectiveIds = sessionEffectiveRooms.get(session.id);
                    return (
                      <tr
                        key={session.id}
                        id={`session-${session.id}`}
                        className="print:break-inside-avoid scroll-mt-24"
                      >
                        <td className={`${td} font-medium`}>
                          <div className="text-gray-900 dark:text-white print:text-black font-medium">
                            {formatFunctionLabel({ name: session.name, functionNumber: session.functionNumber, breakoutGroup: group })}
                          </div>
                          <div className="text-gray-500 dark:text-gray-400 print:text-gray-700 font-normal">
                            {formatSessionTime(session.schedules, timezone)}
                          </div>
                        </td>
                        {chunkRooms.map((room) => {
                          const isAvailable = effectiveIds?.has(room.id) ?? false;
                          if (!isAvailable) {
                            return (
                              <td
                                key={room.id}
                                className={`${td} bg-gray-100 dark:bg-gray-900 print:bg-gray-100`}
                              />
                            );
                          }
                          const slot = session.presentationSlots.find(
                            (s) => s.roomId === room.id
                          );
                          const speakerNames = slot
                            ? getPrimaryNames(slot.presentation.speakers)
                            : null;
                          return (
                            <td key={room.id} className={td}>
                              {slot ? (
                                <>
                                  <div className="font-medium text-gray-900 dark:text-white print:text-black">
                                    {slot.presentation.title}
                                  </div>
                                  {speakerNames && (
                                    <div className="text-gray-500 dark:text-gray-400 print:text-gray-700 mt-0.5">
                                      {speakerNames}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <span className="text-gray-300 dark:text-gray-600 print:text-gray-400">
                                  —
                                </span>
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
          </div>
        ))}
      </div>
    </section>
  );
}

function MobileSessions({
  sessions,
  sessionEffectiveRooms,
  timezone,
  groupName,
}: {
  sessions: Session[];
  sessionEffectiveRooms: Map<string, Set<string>>;
  timezone: string;
  groupName: string;
}) {
  return (
    <div className="sm:hidden print:hidden mt-4 space-y-4">
      {sessions.map((session) => {
        const effectiveIds = sessionEffectiveRooms.get(session.id) ?? new Set<string>();
        const slotByRoom = new Map(
          session.presentationSlots
            .filter((s) => s.roomId && effectiveIds.has(s.roomId))
            .map((s) => [s.roomId as string, s])
        );
        const rows = Array.from(effectiveIds).map((roomId) => {
          const slot = slotByRoom.get(roomId);
          const room = slot?.room ?? session.rooms.find((r) => r.roomId === roomId)?.room;
          return { roomId, roomName: room?.name ?? "—", slot };
        });
        rows.sort((a, b) => a.roomName.localeCompare(b.roomName));

        return (
          <div
            key={session.id}
            id={`session-${session.id}-mobile`}
            className="scroll-mt-24 border border-gray-200 dark:border-gray-700 rounded p-3"
          >
            <p className="font-semibold text-gray-900 dark:text-white break-words">
              {formatFunctionLabel({ name: session.name, functionNumber: session.functionNumber, breakoutGroup: { name: groupName } })}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {formatSessionTime(session.schedules, timezone)}
            </p>
            {rows.length === 0 ? (
              <p className="mt-2 text-xs text-gray-400 dark:text-gray-500 italic">No rooms available.</p>
            ) : (
              <ul className="mt-2 divide-y divide-gray-200 dark:divide-gray-700 text-xs">
                {rows.map((row) => {
                  const speakers = row.slot
                    ? getPrimaryNames(row.slot.presentation.speakers)
                    : null;
                  return (
                    <li key={row.roomId} className="py-1.5">
                      <p className="text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px]">
                        {row.roomName}
                      </p>
                      {row.slot ? (
                        <>
                          <p className="font-medium text-gray-900 dark:text-white break-words">
                            {row.slot.presentation.title}
                          </p>
                          {speakers && (
                            <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                              {speakers}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-gray-400 dark:text-gray-500 italic">Unassigned</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function BreakoutGridReport({ data }: Props) {
  const { groups, timezone } = data;

  if (groups.length === 0) {
    return <EmptyState message="No results." />;
  }

  const navSections = [{ id: "top", label: "Top" }];
  const itemGroups = groups.map((g) => ({
    label: g.name,
    links: g.functions.map((s) => ({
      id: `session-${s.id}`,
      mobileId: `session-${s.id}-mobile`,
      label: formatFunctionLabel({ name: s.name, functionNumber: s.functionNumber, breakoutGroup: g }),
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
