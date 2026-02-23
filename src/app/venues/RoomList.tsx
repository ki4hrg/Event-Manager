"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { Room } from "@prisma/client";

type RoomListProps = {
  rooms: Room[];
  venueId: string;
  createRoom: (formData: FormData) => Promise<void>;
  updateRoom: (roomId: string, formData: FormData) => Promise<void>;
  deleteRoom: (roomId: string) => Promise<void>;
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

export function RoomList({ rooms, venueId, createRoom, updateRoom, deleteRoom }: RoomListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <div className="mt-8">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Rooms</h2>
        <button
          onClick={() => setShowAddForm(true)}
          className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
        >
          Add Room
        </button>
      </div>

      {showAddForm && (
        <form
          action={async (formData) => {
            await createRoom(formData);
            setShowAddForm(false);
          }}
          className="mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="text"
              name="name"
              placeholder="Room name *"
              required
              className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
            />
            <input
              type="number"
              name="capacity"
              placeholder="Capacity"
              className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
            />
            <input
              type="text"
              name="notes"
              placeholder="Notes"
              className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
            />
          </div>
          <div className="mt-3 flex gap-2">
            <SubmitButton label="Add" />
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1 text-gray-600 dark:text-gray-400 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {rooms.length === 0 ? (
        <p className="text-gray-600 dark:text-gray-400">No rooms yet.</p>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Capacity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Notes
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {rooms.map((room) => (
                <tr key={room.id}>
                  {editingId === room.id ? (
                    <td colSpan={4} className="px-6 py-4">
                      <form
                        action={async (formData) => {
                          await updateRoom(room.id, formData);
                          setEditingId(null);
                        }}
                        className="flex gap-4 items-center"
                      >
                        <input
                          type="text"
                          name="name"
                          defaultValue={room.name}
                          required
                          className="flex-1 px-3 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                        />
                        <input
                          type="number"
                          name="capacity"
                          defaultValue={room.capacity || ""}
                          className="w-24 px-3 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                        />
                        <input
                          type="text"
                          name="notes"
                          defaultValue={room.notes || ""}
                          className="flex-1 px-3 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
                        />
                        <SubmitButton label="Save" />
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="text-gray-600 dark:text-gray-400 text-sm"
                        >
                          Cancel
                        </button>
                      </form>
                    </td>
                  ) : (
                    <>
                      <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                        {room.name}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                        {room.capacity || "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                        {room.notes || "—"}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => setEditingId(room.id)}
                          className="text-blue-600 hover:underline text-sm"
                        >
                          Edit
                        </button>
                        <button
                          onClick={async () => {
                            if (confirm("Delete this room?")) {
                              await deleteRoom(room.id);
                            }
                          }}
                          className="text-red-600 hover:underline text-sm"
                        >
                          Delete
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
