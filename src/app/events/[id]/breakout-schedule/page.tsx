import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageWrapper } from "@/components/PageWrapper";
import { EventTabs } from "../EventTabs";
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
  updateSession,
  deleteSession,
  assignPresentationToSession,
  movePresentationSlot,
  removePresentationFromSession,
  createGroupPresentation,
  assignPresentationToGroup,
  getAvailablePresentationsForGroup,
} from "../../breakout-schedule/actions";
import { BreakoutGrid } from "../../breakout-schedule/BreakoutGrid";

export const dynamic = "force-dynamic";

export default async function BreakoutSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;

  const [event, groups, ungroupedBlocks] = await Promise.all([
    prisma.event.findUnique({
      where: { id: eventId },
      include: {
        venue: { include: { rooms: { orderBy: { name: "asc" } } } },
      },
    }),
    getBreakoutGroups(eventId),
    getUngroupedBlocks(eventId),
  ]);

  if (!event) {
    notFound();
  }

  const rooms = event.venue?.rooms ?? [];

  return (
    <PageWrapper>
      <EventTabs eventId={eventId} />

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
          {event.name}
        </h1>
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
        updateSession={async (functionId: string, formData: FormData) => {
          "use server";
          await updateSession(functionId, eventId, formData);
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
        createGroupPresentation={async (groupId: string, formData: FormData) => {
          "use server";
          await createGroupPresentation(groupId, eventId, formData);
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
    </PageWrapper>
  );
}
