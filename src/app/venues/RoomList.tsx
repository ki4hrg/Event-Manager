"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { Room, RoomGroup } from "@prisma/client";
import { useCanDelete, useCanWrite } from "@/components/PermissionsProvider";

type RoomListProps = {
  rooms: Room[];
  roomGroups: RoomGroup[];
  venueId: string;
  createRoom: (formData: FormData) => Promise<void>;
  updateRoom: (roomId: string, formData: FormData) => Promise<void>;
  deleteRoom: (roomId: string) => Promise<void>;
  createRoomGroup: (formData: FormData) => Promise<void>;
  updateRoomGroup: (groupId: string, formData: FormData) => Promise<void>;
  deleteRoomGroup: (groupId: string) => Promise<void>;
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? "..." : label}
    </button>
  );
}

function GroupSelect({ groups, defaultValue }: { groups: RoomGroup[]; defaultValue?: string | null }) {
  if (groups.length === 0) return null;
  return (
    <select
      name="groupId"
      defaultValue={defaultValue ?? ""}
      className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
    >
      <option value="">No group</option>
      {groups.map((g) => (
        <option key={g.id} value={g.id}>{g.name}</option>
      ))}
    </select>
  );
}

function RoomRow({
  room,
  groups,
  isEditing,
  onEdit,
  onCancelEdit,
  updateRoom,
  deleteRoom,
}: {
  room: Room;
  groups: RoomGroup[];
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  updateRoom: (roomId: string, formData: FormData) => Promise<void>;
  deleteRoom: (roomId: string) => Promise<void>;
}) {
  const canWrite = useCanWrite("VENUES");
  const canDelete = useCanDelete("VENUES");
  if (isEditing) {
    return (
      <tr>
        <td colSpan={groups.length > 0 ? 5 : 4} className="px-6 py-4">
          <form
            action={async (formData) => {
              await updateRoom(room.id, formData);
              onCancelEdit();
            }}
            className="flex gap-3 items-center flex-wrap"
          >
            <input
              type="text"
              name="name"
              defaultValue={room.name}
              required
              className="flex-1 min-w-32 px-3 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
            />
            <input
              type="number"
              name="capacity"
              defaultValue={room.capacity ?? ""}
              className="w-24 px-3 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
              placeholder="Capacity"
            />
            <input
              type="text"
              name="notes"
              defaultValue={room.notes ?? ""}
              className="flex-1 min-w-32 px-3 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
              placeholder="Notes"
            />
            <GroupSelect groups={groups} defaultValue={room.groupId} />
            <SubmitButton label="Save" />
            <button
              type="button"
              onClick={onCancelEdit}
              className="text-gray-600 dark:text-gray-400 text-sm"
            >
              Cancel
            </button>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td className="px-6 py-4 font-medium text-gray-900 dark:text-white text-sm">{room.name}</td>
      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{room.capacity ?? "—"}</td>
      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{room.notes ?? "—"}</td>
      {groups.length > 0 && (
        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
          {groups.find((g) => g.id === room.groupId)?.name ?? "—"}
        </td>
      )}
      <td className="px-6 py-4 text-right space-x-3 whitespace-nowrap">
        {canWrite && (
          <button onClick={onEdit} className="text-blue-600 dark:text-blue-400 hover:underline text-sm">
            Edit
          </button>
        )}
        {canDelete && (
          <button
            onClick={async () => {
              if (confirm("Delete this room?")) await deleteRoom(room.id);
            }}
            className="text-red-600 hover:underline text-sm"
          >
            Delete
          </button>
        )}
      </td>
    </tr>
  );
}

function RoomsTable({
  rooms,
  groups,
  editingId,
  setEditingId,
  updateRoom,
  deleteRoom,
}: {
  rooms: Room[];
  groups: RoomGroup[];
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  updateRoom: (roomId: string, formData: FormData) => Promise<void>;
  deleteRoom: (roomId: string) => Promise<void>;
}) {
  if (rooms.length === 0) {
    return <p className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 italic">No rooms.</p>;
  }

  return (
    <div className="overflow-x-auto">
    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
      <thead className="bg-gray-50 dark:bg-gray-900">
        <tr>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Capacity</th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Notes</th>
          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
        {rooms.map((room) => (
          <RoomRow
            key={room.id}
            room={room}
            groups={groups}
            isEditing={editingId === room.id}
            onEdit={() => setEditingId(room.id)}
            onCancelEdit={() => setEditingId(null)}
            updateRoom={updateRoom}
            deleteRoom={deleteRoom}
          />
        ))}
      </tbody>
    </table>
    </div>
  );
}

export function RoomList({
  rooms,
  roomGroups,
  venueId,
  createRoom,
  updateRoom,
  deleteRoom,
  createRoomGroup,
  updateRoomGroup,
  deleteRoomGroup,
}: RoomListProps) {
  const canWrite = useCanWrite("VENUES");
  const canDelete = useCanDelete("VENUES");
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [activeForm, setActiveForm] = useState<"room" | "group" | null>(null);

  const hasGroups = roomGroups.length > 0;
  const ungroupedRooms = rooms.filter((r) => !r.groupId);

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">Rooms</h2>
        {canWrite && (
          <div className="flex gap-2">
            <button
              onClick={() => setActiveForm("group")}
              className="px-3 py-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Add Group
            </button>
            <button
              onClick={() => setActiveForm("room")}
              className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
            >
              Add Room
            </button>
          </div>
        )}
      </div>

      {activeForm === "group" && (
        <form
          action={async (formData) => {
            await createRoomGroup(formData);
            setActiveForm(null);
          }}
          className="mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg flex flex-wrap gap-3 items-center"
        >
          <input
            type="text"
            name="name"
            placeholder="Group name *"
            required
            autoFocus
            className="flex-1 min-w-0 basis-48 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
          />
          <SubmitButton label="Add Group" />
          <button
            type="button"
            onClick={() => setActiveForm(null)}
            className="text-gray-600 dark:text-gray-400 text-sm"
          >
            Cancel
          </button>
        </form>
      )}

      {activeForm === "room" && (
        <form
          action={async (formData) => {
            await createRoom(formData);
            setActiveForm(null);
          }}
          className="mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              name="name"
              placeholder="Room name *"
              required
              autoFocus
              className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
            />
            <input
              type="number"
              name="capacity"
              placeholder="Capacity"
              className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
            />
            <input
              type="text"
              name="notes"
              placeholder="Notes"
              className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
            />
          </div>
          {hasGroups && (
            <div className="mt-3">
              <GroupSelect groups={roomGroups} />
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <SubmitButton label="Add Room" />
            <button
              type="button"
              onClick={() => setActiveForm(null)}
              className="text-gray-600 dark:text-gray-400 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {rooms.length === 0 && roomGroups.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400 text-sm italic">No rooms added.</p>
      ) : hasGroups ? (
        <div className="space-y-6">
          {roomGroups.map((group) => {
            const groupRooms = rooms.filter((r) => r.groupId === group.id);
            return (
              <div key={group.id} className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
                <div className="flex justify-between items-center px-6 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                  {editingGroupId === group.id ? (
                    <form
                      action={async (formData) => {
                        await updateRoomGroup(group.id, formData);
                        setEditingGroupId(null);
                      }}
                      className="flex gap-2 items-center flex-1 min-w-0"
                    >
                      <input
                        type="text"
                        name="name"
                        defaultValue={group.name}
                        required
                        autoFocus
                        className="flex-1 min-w-0 px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
                      />
                      <SubmitButton label="Save" />
                      <button
                        type="button"
                        onClick={() => setEditingGroupId(null)}
                        className="text-gray-600 dark:text-gray-400 text-sm"
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <>
                      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                        {group.name}
                      </h3>
                      <div className="flex gap-3">
                        <button
                          onClick={() => setEditingGroupId(group.id)}
                          className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
                        >
                          Edit
                        </button>
                        <button
                          onClick={async () => {
                            if (confirm(`Delete group "${group.name}"? Rooms in this group will become ungrouped.`)) {
                              await deleteRoomGroup(group.id);
                            }
                          }}
                          className="text-red-600 hover:underline text-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <RoomsTable
                  rooms={groupRooms}
                  groups={roomGroups}
                  editingId={editingRoomId}
                  setEditingId={setEditingRoomId}
                  updateRoom={updateRoom}
                  deleteRoom={deleteRoom}

                />
              </div>
            );
          })}

          {ungroupedRooms.length > 0 && (
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
              <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Ungrouped
                </h3>
              </div>
              <RoomsTable
                rooms={ungroupedRooms}
                groups={roomGroups}
                editingId={editingRoomId}
                setEditingId={setEditingRoomId}
                updateRoom={updateRoom}
                deleteRoom={deleteRoom}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
          <RoomsTable
            rooms={rooms}
            groups={roomGroups}
            editingId={editingRoomId}
            setEditingId={setEditingRoomId}
            updateRoom={updateRoom}
            deleteRoom={deleteRoom}
          />
        </div>
      )}
    </div>
  );
}
