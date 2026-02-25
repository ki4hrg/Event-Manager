import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageWrapper } from "@/components/PageWrapper";
import { EventTabs } from "../EventTabs";
import { getEvent } from "../../actions";
import { getPresentations } from "../../presentations/actions";
import {
  getBreakoutGroups,
  getUngroupedBlocks,
  createBreakoutGroup,
  updateBreakoutGroup,
  deleteBreakoutGroup,
  assignPresentationToBlock,
  removePresentationFromBlock,
} from "../../breakout-schedule/actions";
import { BreakoutGrid } from "../../breakout-schedule/BreakoutGrid";

export const dynamic = "force-dynamic";

export default async function BreakoutSchedulePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;

  const [event, groups, ungroupedBlocks, presentations] = await Promise.all([
    getEvent(eventId),
    getBreakoutGroups(eventId),
    getUngroupedBlocks(eventId),
    getPresentations(eventId),
  ]);

  if (!event) {
    notFound();
  }

  const rooms = event.venueId
    ? await prisma.room.findMany({
        where: { venueId: event.venueId },
        orderBy: { name: "asc" },
      })
    : [];

  const createGroupAction = async (formData: FormData) => {
    "use server";
    await createBreakoutGroup(eventId, formData);
  };

  const updateGroupAction = async (groupId: string, formData: FormData) => {
    "use server";
    await updateBreakoutGroup(groupId, eventId, formData);
  };

  const deleteGroupAction = async (groupId: string) => {
    "use server";
    await deleteBreakoutGroup(groupId, eventId);
  };

  const assignPresentationAction = async (
    presentationId: string,
    functionId: string,
    roomId: string | null
  ) => {
    "use server";
    await assignPresentationToBlock(presentationId, functionId, roomId, eventId);
  };

  const removeSlotAction = async (slotId: string) => {
    "use server";
    await removePresentationFromBlock(slotId, eventId);
  };

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
        presentations={presentations}
        rooms={rooms}
        timezone={event.timezone}
        createGroup={createGroupAction}
        updateGroup={updateGroupAction}
        deleteGroup={deleteGroupAction}
        assignPresentation={assignPresentationAction}
        removeSlot={removeSlotAction}
      />
    </PageWrapper>
  );
}
