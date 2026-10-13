import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PrintHeader } from "@/components/print/PrintHeader";
import { reportTh as th, reportTd as td } from "@/lib/reportStyles";

// Room header cells need word-wrap; reportTh has whitespace-nowrap which collides at narrow widths
const roomTh = th.replace("whitespace-nowrap", "whitespace-normal break-words");
import { getBreakoutGroups } from "@/app/events/breakout-schedule/actions";
import { getEffectiveRooms, formatSessionTime, getPrimaryNames } from "@/app/events/breakout-schedule/utils";
import { formatFunctionLabel } from "@/lib/functionNumbers";
import type { Room } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Breakout schedule (print)" };

// Max rooms per table chunk before splitting onto a new page
const ROOMS_PER_CHUNK = 8;

function formatGroupDate(schedules: { startTime: Date }[], timezone: string): string {
  if (schedules.length === 0) return "";
  return new Date(schedules[0].startTime).toLocaleString("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export default async function BreakoutSchedulePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;

  const [event, groups] = await Promise.all([
    prisma.event.findUnique({ where: { id: eventId } }),
    getBreakoutGroups(eventId),
  ]);

  if (!event) notFound();

  const timezone = event.timezone || "America/Chicago";

  return (
    <>
      {/* Force landscape orientation for all print pages */}
      <style>{`@page { size: landscape; margin: 0.5in; }`}</style>

      <div className="max-w-none mx-auto px-8 py-8 bg-white print:px-0 print:py-0">
        <PrintHeader
          eventName={event.name}
          title="Breakout Schedule"
          backHref={`/events/${eventId}/breakout-schedule`}
        />

        {groups.length === 0 && (
          <p className="text-gray-500">No breakout groups found.</p>
        )}

        {groups.map((group, groupIndex) => {
          const allRooms = new Map<string, Room>();
          const sessionEffectiveRooms = new Map<string, Set<string>>();

          for (const session of group.functions) {
            const effective = getEffectiveRooms(session, group.rooms);
            sessionEffectiveRooms.set(session.id, new Set(effective.map((r) => r.id)));
            for (const room of effective) {
              allRooms.set(room.id, room);
            }
          }

          const roomList = Array.from(allRooms.values()).sort((a, b) => a.name.localeCompare(b.name));
          const roomChunks = chunkArray(roomList, ROOMS_PER_CHUNK);
          const firstSchedule = group.functions[0]?.schedules ?? [];
          const dateHeading = formatGroupDate(firstSchedule, timezone);
          const isLastGroup = groupIndex === groups.length - 1;

          return (
            <div key={group.id}>
              {group.functions.length === 0 || roomList.length === 0 ? (
                <div className="mb-12">
                  <div className="mb-3">
                    <h2 className="text-lg font-semibold text-gray-900 print:text-black">{group.name}</h2>
                    {dateHeading && (
                      <p className="text-sm text-gray-500 print:text-gray-600">{dateHeading}</p>
                    )}
                  </div>
                  <p className="text-sm text-gray-400 italic">
                    {group.functions.length === 0 ? "No sessions defined." : "No rooms assigned."}
                  </p>
                </div>
              ) : (
                roomChunks.map((chunkRooms, chunkIndex) => {
                  const breakBefore = chunkIndex > 0 || groupIndex > 0;

                  return (
                    <div
                      key={chunkIndex}
                      className={`mb-8${breakBefore ? " print:break-before-page" : ""}`}
                    >
                      <div className="mb-3">
                        <h2 className="text-lg font-semibold text-gray-900 print:text-black">
                          {group.name}
                          {roomChunks.length > 1 && (
                            <span className="text-base font-normal text-gray-500 print:text-gray-600 ml-2">
                              (rooms {chunkIndex * ROOMS_PER_CHUNK + 1}–{Math.min((chunkIndex + 1) * ROOMS_PER_CHUNK, roomList.length)} of {roomList.length})
                            </span>
                          )}
                        </h2>
                        {dateHeading && (
                          <p className="text-sm text-gray-500 print:text-gray-600">{dateHeading}</p>
                        )}
                      </div>

                      <div className="overflow-x-auto print:overflow-visible">
                        <table className="w-full border-collapse table-fixed">
                          <colgroup>
                            <col style={{ width: "13%" }} />
                            {chunkRooms.map((room) => (
                              <col key={room.id} style={{ width: `${87 / chunkRooms.length}%` }} />
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
                                    <div className="text-gray-900 print:text-black font-medium">{formatFunctionLabel({ name: session.name, functionNumber: session.functionNumber, breakoutGroup: group })}</div>
                                    <div className="text-gray-500 print:text-gray-600 font-normal">
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
                                    const speakerNames = slot ? getPrimaryNames(slot.presentation.speakers) : null;
                                    return (
                                      <td key={room.id} className={td}>
                                        {slot ? (
                                          <>
                                            <div className="font-medium text-gray-900 print:text-black">
                                              {slot.presentation.title}
                                            </div>
                                            {speakerNames && (
                                              <div className="text-gray-500 print:text-gray-600 mt-0.5">
                                                {speakerNames}
                                              </div>
                                            )}
                                          </>
                                        ) : (
                                          <span className="text-gray-300 print:text-gray-400">—</span>
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
                  );
                })
              )}
            </div>
          );
        })}

        <p className="text-xs text-gray-400 print:text-gray-500 mt-4 print:hidden">
          Generated{" "}
          {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </p>
      </div>
    </>
  );
}
