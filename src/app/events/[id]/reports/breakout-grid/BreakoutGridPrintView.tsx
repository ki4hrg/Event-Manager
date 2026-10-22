import type { Room } from "@prisma/client";
import type {
  BreakoutScheduleData,
  BreakoutScheduleGroup,
} from "@/app/events/reports/data";
import {
  getEffectiveRooms,
  formatSessionTime,
  getPrimaryNames,
  chunkArray,
} from "@/app/events/breakout-schedule/utils";
import { formatFunctionLabel } from "@/lib/functionNumbers";
import { reportTh as th, reportThWrap as roomTh, reportTd as td } from "@/lib/reportStyles";

const ROOMS_PER_CHUNK = 8;
const SESSION_COL_WIDTH = 13;

function GroupPage({
  group,
  eventName,
  timezone,
  isLast,
}: {
  group: BreakoutScheduleGroup;
  eventName: string;
  timezone: string;
  isLast: boolean;
}) {
  const allRooms = new Map<string, Room>();
  const sessionEffectiveRooms = new Map<string, Set<string>>();

  for (const session of group.functions) {
    const effective = getEffectiveRooms(session, group.rooms);
    sessionEffectiveRooms.set(session.id, new Set(effective.map((r) => r.id)));
    for (const room of effective) allRooms.set(room.id, room);
  }

  const roomList = Array.from(allRooms.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const breakClass = isLast ? "" : "print:break-after-page";

  if (group.functions.length === 0 || roomList.length === 0) {
    return (
      <section className={`${breakClass} mb-8`}>
        <div className="mb-4">
          <p className="text-sm text-gray-500 print:text-gray-600">{eventName}</p>
          <h1 className="text-2xl font-semibold text-gray-900 print:text-black">{group.name}</h1>
        </div>
        <p className="text-sm text-gray-500 print:text-gray-700 italic">
          {group.functions.length === 0 ? "No sessions defined." : "No rooms assigned."}
        </p>
      </section>
    );
  }

  const roomChunks = chunkArray(roomList, ROOMS_PER_CHUNK);

  return (
    <section className={`${breakClass} mb-8`}>
      <div className="mb-4">
        <p className="text-sm text-gray-500 print:text-gray-600">{eventName}</p>
        <h1 className="text-2xl font-semibold text-gray-900 print:text-black">{group.name}</h1>
      </div>

      <div className="space-y-6">
        {roomChunks.map((chunkRooms, chunkIndex) => (
          <div
            key={chunkIndex}
            className={chunkIndex > 0 ? "print:break-before-page" : undefined}
          >
            {roomChunks.length > 1 && (
              <p className="text-xs text-gray-500 print:text-gray-700 mb-2">
                Rooms {chunkIndex * ROOMS_PER_CHUNK + 1}–
                {Math.min((chunkIndex + 1) * ROOMS_PER_CHUNK, roomList.length)} of {roomList.length}
              </p>
            )}
            <table className="w-full border-collapse table-fixed text-sm">
              <colgroup>
                <col style={{ width: `${SESSION_COL_WIDTH}%` }} />
                {chunkRooms.map((room) => (
                  <col
                    key={room.id}
                    style={{ width: `${(100 - SESSION_COL_WIDTH) / chunkRooms.length}%` }}
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
                    <tr key={session.id} className="print:break-inside-avoid">
                      <td className={`${td} font-medium`}>
                        <div className="text-gray-900 print:text-black font-medium">
                          {formatFunctionLabel({ name: session.name, functionNumber: session.functionNumber, breakoutGroup: group })}
                        </div>
                        <div className="text-gray-500 print:text-gray-700 font-normal">
                          {formatSessionTime(session.schedules, timezone)}
                        </div>
                      </td>
                      {chunkRooms.map((room) => {
                        const isAvailable = effectiveIds?.has(room.id) ?? false;
                        if (!isAvailable) {
                          return (
                            <td
                              key={room.id}
                              className={`${td} bg-gray-100 print:bg-gray-100`}
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
                                <div className="font-medium text-gray-900 print:text-black">
                                  {slot.presentation.title}
                                </div>
                                {speakerNames && (
                                  <div className="text-gray-500 print:text-gray-700 mt-0.5">
                                    {speakerNames}
                                  </div>
                                )}
                              </>
                            ) : (
                              <span className="text-gray-400 print:text-gray-500">—</span>
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
        ))}
      </div>
    </section>
  );
}

export function BreakoutGridPrintView({
  data,
  eventName,
}: {
  data: BreakoutScheduleData;
  eventName: string;
}) {
  return (
    <>
      <style>{`@page { size: landscape; margin: 0.5in; }`}</style>
      <div className="p-6 print:p-0">
        {data.groups.map((group, i) => (
          <GroupPage
            key={group.id}
            group={group}
            eventName={eventName}
            timezone={data.timezone}
            isLast={i === data.groups.length - 1}
          />
        ))}
      </div>
    </>
  );
}
