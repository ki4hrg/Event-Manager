import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { prisma } from "@/lib/prisma";
import {
  getBreakoutGroups,
  getUngroupedBlocks,
  createBreakoutGroup,
  updateBreakoutGroup,
  deleteBreakoutGroup,
  addRoomToGroup,
  removeRoomFromGroup,
  setSessionRoomOverride,
  removeSessionRoomOverride,
  createSessionInGroup,
  deleteSession,
  assignPresentationToSession,
  movePresentationSlot,
  removePresentationFromSession,
  assignPresentationToGroup,
  getAvailablePresentationsForGroup,
} from "../../breakout-schedule/actions";
import { BreakoutGrid } from "../../breakout-schedule/BreakoutGrid";
import { getEventRooms } from "@/lib/eventVenues";
import { btnSecondary } from "@/lib/buttonStyles";
import { REPORTS } from "@/lib/reportRegistry";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Breakout schedule" };

export default async function BreakoutSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;

  const [event, rooms, groups, ungroupedBlocks] = await Promise.all([
    prisma.event.findUnique({ where: { id: eventId } }),
    getEventRooms(eventId),
    getBreakoutGroups(eventId),
    getUngroupedBlocks(eventId),
  ]);

  if (!event) {
    notFound();
  }


  return (
    <>
      <div className="flex flex-wrap justify-between items-center gap-y-2 mb-4">
        <div>
          <Breadcrumbs items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${eventId}` },
            { label: "Breakouts" },
          ]} />
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
            {event.name}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2 min-w-0">
          <Link
            href={`/events/${eventId}/${REPORTS.BREAKOUT_GRID.path}`}
            className={`${btnSecondary} text-sm`}
          >
            {REPORTS.BREAKOUT_GRID.label}
          </Link>
          <Link
            href={`/events/${eventId}/${REPORTS.BREAKOUT_ASSIGNMENTS.path}`}
            className={`${btnSecondary} text-sm`}
          >
            {REPORTS.BREAKOUT_ASSIGNMENTS.label}
          </Link>
          <Link
            href={`/events/${eventId}/reports/function-detail`}
            className={`${btnSecondary} text-sm`}
          >
            Detail Report
          </Link>
          <Link
            href={`/events/${eventId}/breakout-schedule/print`}
            className={`${btnSecondary} text-sm`}
          >
            Print view
          </Link>
        </div>
      </div>

      <BreakoutGrid
        eventId={eventId}
        groups={groups}
        ungroupedBlocks={ungroupedBlocks}
        venueRooms={rooms}
        timezone={event.timezone}
        createGroup={async (formData: FormData) => {
          "use server";
          await createBreakoutGroup(eventId, formData);
        }}
        updateGroup={async (groupId: string, formData: FormData) => {
          "use server";
          await updateBreakoutGroup(groupId, eventId, formData);
        }}
        deleteGroup={async (groupId: string) => {
          "use server";
          await deleteBreakoutGroup(groupId, eventId);
        }}
        addRoomToGroup={async (groupId: string, roomId: string) => {
          "use server";
          await addRoomToGroup(groupId, roomId, eventId);
        }}
        removeRoomFromGroup={async (groupId: string, roomId: string) => {
          "use server";
          await removeRoomFromGroup(groupId, roomId, eventId);
        }}
        setSessionRoomOverride={async (functionId: string, roomId: string, type: "exclude" | "include") => {
          "use server";
          await setSessionRoomOverride(functionId, roomId, type, eventId);
        }}
        removeSessionRoomOverride={async (functionId: string, roomId: string) => {
          "use server";
          await removeSessionRoomOverride(functionId, roomId, eventId);
        }}
        createSession={async (groupId: string, formData: FormData) => {
          "use server";
          await createSessionInGroup(groupId, eventId, formData);
        }}
        deleteSession={async (functionId: string) => {
          "use server";
          await deleteSession(functionId, eventId);
        }}
        assignPresentation={async (presentationId: string, functionId: string, roomId: string | null) => {
          "use server";
          return assignPresentationToSession(presentationId, functionId, roomId, eventId);
        }}
        moveSlot={async (slotId: string, newFunctionId: string, newRoomId: string | null) => {
          "use server";
          return movePresentationSlot(slotId, newFunctionId, newRoomId, eventId);
        }}
        removeSlot={async (slotId: string) => {
          "use server";
          await removePresentationFromSession(slotId, eventId);
        }}
        getAvailablePresentations={async (groupId: string) => {
          "use server";
          return getAvailablePresentationsForGroup(groupId, eventId);
        }}
        assignExistingPresentation={async (presentationId: string, groupId: string) => {
          "use server";
          await assignPresentationToGroup(presentationId, groupId, eventId);
        }}
      />
    </>
  );

}
