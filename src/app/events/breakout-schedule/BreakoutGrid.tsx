"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type {
  Function as PrismaFunction,
  FunctionRoom,
  FunctionSchedule,
  PresentationSlot,
  Presentation,
  Room,
  BreakoutGroup,
} from "@prisma/client";

type SlotData = PresentationSlot & {
  presentation: Presentation;
  room: Room | null;
};

type BlockFunction = PrismaFunction & {
  schedules: FunctionSchedule[];
  rooms: (FunctionRoom & { room: Room })[];
  presentationSlots: SlotData[];
};

type GroupData = BreakoutGroup & {
  functions: BlockFunction[];
};

type BreakoutGridProps = {
  eventId: string;
  groups: GroupData[];
  ungroupedBlocks: BlockFunction[];
  presentations: Presentation[];
  timezone: string;
  createGroup: (formData: FormData) => Promise<void>;
  updateGroup: (groupId: string, formData: FormData) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  assignPresentation: (
    presentationId: string,
    functionId: string,
    roomId: string | null
  ) => Promise<void>;
  removeSlot: (slotId: string) => Promise<void>;
};

function formatBlockTime(
  schedules: { startTime: Date; endTime: Date }[],
  timezone: string
): string {
  if (schedules.length === 0) return "No time set";
  const s = schedules[0];
  const start = new Date(s.startTime).toLocaleString("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const end = new Date(s.endTime).toLocaleString("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  });
  return `${start} – ${end}`;
}

// Get the slot for a given block+room combination
function getSlot(
  block: BlockFunction,
  roomId: string | null
): SlotData | undefined {
  return block.presentationSlots.find(
    (s) => s.roomId === roomId
  );
}

// Presentations already assigned to a block (by presentationId)
function assignedPresentationIds(block: BlockFunction): Set<string> {
  return new Set(block.presentationSlots.map((s) => s.presentationId));
}

function BlockGrid({
  block,
  presentations,
  eventId,
  timezone,
  assignPresentation,
  removeSlot,
}: {
  block: BlockFunction;
  presentations: Presentation[];
  eventId: string;
  timezone: string;
  assignPresentation: (
    presentationId: string,
    functionId: string,
    roomId: string | null
  ) => Promise<void>;
  removeSlot: (slotId: string) => Promise<void>;
}) {
  const [openCell, setOpenCell] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const columns: (Room | null)[] = [...block.rooms.map((fr) => fr.room), null]; // null = Unassigned
  const assigned = assignedPresentationIds(block);
  const availablePresentations = presentations.filter(
    (p) => !assigned.has(p.id)
  );

  const cellKey = (roomId: string | null) =>
    `${block.id}:${roomId ?? "null"}`;

  const handleSelect = (presentationId: string, roomId: string | null) => {
    if (!presentationId) return;
    startTransition(async () => {
      await assignPresentation(presentationId, block.id, roomId);
      setOpenCell(null);
    });
  };

  const handleRemove = (slotId: string) => {
    startTransition(async () => {
      await removeSlot(slotId);
    });
  };

  return (
    <div className="mb-4">
      <div className="flex items-start gap-2 mb-1">
        <div>
          <Link
            href={`/events/${eventId}/functions/${block.id}`}
            className="font-medium text-blue-600 hover:underline text-sm"
          >
            {block.name}
          </Link>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {formatBlockTime(block.schedules, timezone)}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border border-gray-200 dark:border-gray-700 text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-900">
              {columns.map((room) => (
                <th
                  key={room?.id ?? "unassigned"}
                  className="border border-gray-200 dark:border-gray-700 px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap"
                >
                  {room?.name ?? "Unassigned"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {columns.map((room) => {
                const roomId = room?.id ?? null;
                const slot = getSlot(block, roomId);
                const key = cellKey(roomId);
                const isOpen = openCell === key;

                return (
                  <td
                    key={key}
                    className="border border-gray-200 dark:border-gray-700 px-3 py-2 align-top min-w-[160px]"
                  >
                    {slot ? (
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-gray-900 dark:text-white text-xs">
                          {slot.presentation.title}
                        </span>
                        <button
                          onClick={() => handleRemove(slot.id)}
                          disabled={isPending}
                          className="text-red-500 hover:text-red-700 text-xs shrink-0 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    ) : isOpen ? (
                      <div className="space-y-1">
                        <select
                          defaultValue=""
                          onChange={(e) => handleSelect(e.target.value, roomId)}
                          disabled={isPending}
                          autoFocus
                          className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 rounded text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:opacity-50"
                        >
                          <option value="">Select...</option>
                          {availablePresentations.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.title}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => setOpenCell(null)}
                          className="text-gray-400 hover:text-gray-600 text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setOpenCell(key)}
                        disabled={availablePresentations.length === 0 || isPending}
                        className="text-blue-600 hover:underline text-xs disabled:opacity-40 disabled:no-underline"
                      >
                        {availablePresentations.length === 0
                          ? "All assigned"
                          : "+ Assign"}
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupSection({
  group,
  presentations,
  eventId,
  timezone,
  updateGroup,
  deleteGroup,
  assignPresentation,
  removeSlot,
}: {
  group: GroupData;
  presentations: Presentation[];
  eventId: string;
  timezone: string;
  updateGroup: (groupId: string, formData: FormData) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  assignPresentation: (
    presentationId: string,
    functionId: string,
    roomId: string | null
  ) => Promise<void>;
  removeSlot: (slotId: string) => Promise<void>;
}) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleRename = (formData: FormData) => {
    startTransition(async () => {
      await updateGroup(group.id, formData);
      setIsRenaming(false);
    });
  };

  const handleDelete = () => {
    if (
      !confirm(
        `Delete group "${group.name}"? Breakout blocks in this group will become ungrouped.`
      )
    )
      return;
    startTransition(async () => {
      await deleteGroup(group.id);
    });
  };

  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-3">
        {isRenaming ? (
          <form action={handleRename} className="flex items-center gap-2">
            <input
              name="name"
              defaultValue={group.name}
              autoFocus
              className="px-2 py-1 border border-gray-300 dark:border-gray-700 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
            <button
              type="submit"
              disabled={isPending}
              className="px-2 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setIsRenaming(false)}
              className="text-gray-500 text-sm hover:text-gray-700"
            >
              Cancel
            </button>
          </form>
        ) : (
          <>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              {group.name}
            </h3>
            <button
              onClick={() => setIsRenaming(true)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs"
            >
              Rename
            </button>
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="text-red-400 hover:text-red-600 text-xs disabled:opacity-50"
            >
              Delete
            </button>
          </>
        )}
      </div>

      {group.functions.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          No breakout blocks in this group yet.
        </p>
      ) : (
        <div className="space-y-4">
          {group.functions.map((block) => (
            <BlockGrid
              key={block.id}
              block={block}
              presentations={presentations}
              eventId={eventId}
              timezone={timezone}
              assignPresentation={assignPresentation}
              removeSlot={removeSlot}
            />
          ))}
        </div>
      )}

      <Link
        href={`/events/${eventId}/functions/new?type=BREAKOUT_BLOCK&groupId=${group.id}`}
        className="inline-block mt-2 text-sm text-blue-600 hover:underline"
      >
        + Add Breakout Block
      </Link>
    </div>
  );
}

export function BreakoutGrid({
  eventId,
  groups,
  ungroupedBlocks,
  presentations,
  timezone,
  createGroup,
  updateGroup,
  deleteGroup,
  assignPresentation,
  removeSlot,
}: BreakoutGridProps) {
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleCreateGroup = (formData: FormData) => {
    startTransition(async () => {
      await createGroup(formData);
      setShowAddGroup(false);
    });
  };

  const unscheduledPresentations = presentations.filter(
    (p) =>
      !groups.some((g) =>
        g.functions.some((f) =>
          f.presentationSlots.some((s) => s.presentationId === p.id)
        )
      ) &&
      !ungroupedBlocks.some((f) =>
        f.presentationSlots.some((s) => s.presentationId === p.id)
      )
  );

  return (
    <div>
      {groups.map((group) => (
        <GroupSection
          key={group.id}
          group={group}
          presentations={presentations}
          eventId={eventId}
          timezone={timezone}
          updateGroup={updateGroup}
          deleteGroup={deleteGroup}
          assignPresentation={assignPresentation}
          removeSlot={removeSlot}
        />
      ))}

      {ungroupedBlocks.length > 0 && (
        <div className="mb-8">
          <h3 className="text-base font-semibold text-gray-500 dark:text-gray-400 mb-3">
            Ungrouped
          </h3>
          <div className="space-y-4">
            {ungroupedBlocks.map((block) => (
              <BlockGrid
                key={block.id}
                block={block}
                presentations={presentations}
                eventId={eventId}
                timezone={timezone}
                assignPresentation={assignPresentation}
                removeSlot={removeSlot}
              />
            ))}
          </div>
          <Link
            href={`/events/${eventId}/functions/new?type=BREAKOUT_BLOCK`}
            className="inline-block mt-2 text-sm text-blue-600 hover:underline"
          >
            + Add Breakout Block
          </Link>
        </div>
      )}

      {/* Add Group */}
      <div className="mb-8">
        {showAddGroup ? (
          <form action={handleCreateGroup} className="flex items-center gap-2">
            <input
              name="name"
              placeholder="Group name"
              required
              autoFocus
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
            <button
              type="submit"
              disabled={isPending}
              className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setShowAddGroup(false)}
              className="text-gray-500 text-sm hover:text-gray-700"
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            onClick={() => setShowAddGroup(true)}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-700 rounded text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            + Add Group
          </button>
        )}

        {groups.length === 0 && ungroupedBlocks.length === 0 && (
          <div className="mt-4">
            <Link
              href={`/events/${eventId}/functions/new?type=BREAKOUT_BLOCK`}
              className="text-sm text-blue-600 hover:underline"
            >
              + Add Ungrouped Breakout Block
            </Link>
          </div>
        )}
      </div>

      {/* Unscheduled Presentations */}
      {unscheduledPresentations.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
            Unscheduled Presentations ({unscheduledPresentations.length})
          </h3>
          <div className="space-y-1">
            {unscheduledPresentations.map((p) => (
              <div key={p.id} className="text-sm text-gray-700 dark:text-gray-300">
                <Link
                  href={`/events/${eventId}/presentations/${p.id}`}
                  className="hover:text-blue-600 hover:underline"
                >
                  {p.title}
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
