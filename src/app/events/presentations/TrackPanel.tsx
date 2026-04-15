"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { colorClasses, COLOR_OPTIONS } from "@/lib/colors";
import type { PresentationTrack } from "@prisma/client";

const inputClass =
  "flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white";
const cancelClass =
  "px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800";

type TrackPanelProps = {
  tracks: PresentationTrack[];
  createTrack: (formData: FormData) => Promise<void>;
  updateTrack: (trackId: string, formData: FormData) => Promise<void>;
  deleteTrack: (trackId: string) => Promise<void>;
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? "..." : label}
    </button>
  );
}

function ColorPicker({ name, defaultValue }: { name: string; defaultValue?: string | null }) {
  const [selected, setSelected] = useState(defaultValue || "gray");
  return (
    <div className="flex items-center gap-1.5">
      {COLOR_OPTIONS.map((color) => (
        <label key={color} className="cursor-pointer">
          <input
            type="radio"
            name={name}
            value={color}
            checked={selected === color}
            onChange={() => setSelected(color)}
            className="sr-only"
          />
          <span
            className={`block w-5 h-5 rounded-full border-2 ${
              selected === color
                ? "border-gray-800 dark:border-white"
                : "border-transparent"
            } ${colorClasses[color]}`}
          />
        </label>
      ))}
    </div>
  );
}

function TrackRow({
  track,
  updateTrack,
  deleteTrack,
}: {
  track: PresentationTrack;
  updateTrack: (trackId: string, formData: FormData) => Promise<void>;
  deleteTrack: (trackId: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <form
        action={async (fd) => {
          await updateTrack(track.id, fd);
          setEditing(false);
        }}
        className="flex items-center gap-2 py-1"
      >
        <input
          type="text"
          name="name"
          defaultValue={track.name}
          required
          className={inputClass}
        />
        <ColorPicker name="color" defaultValue={track.color} />
        <SubmitButton label="Save" />
        <button type="button" onClick={() => setEditing(false)} className={cancelClass}>
          Cancel
        </button>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-2 py-1">
      <span
        className={`px-2 py-0.5 text-xs rounded ${
          colorClasses[track.color || "gray"] || colorClasses.gray
        }`}
      >
        {track.name}
      </span>
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
      >
        Edit
      </button>
      <button
        type="button"
        onClick={async () => {
          if (confirm(`Delete track "${track.name}"? Presentations will become untracked.`)) {
            await deleteTrack(track.id);
          }
        }}
        className="text-sm text-red-600 hover:underline"
      >
        Delete
      </button>
    </div>
  );
}

function AddTrackForm({ createTrack }: { createTrack: (formData: FormData) => Promise<void> }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 text-sm text-blue-600 dark:text-blue-400 hover:underline"
      >
        + Add track
      </button>
    );
  }

  return (
    <form
      action={async (fd) => {
        await createTrack(fd);
        setOpen(false);
      }}
      className="mt-3 flex items-center gap-2"
    >
      <input
        type="text"
        name="name"
        placeholder="Track name"
        required
        autoFocus
        className={inputClass}
      />
      <ColorPicker name="color" defaultValue="gray" />
      <SubmitButton label="Add" />
      <button type="button" onClick={() => setOpen(false)} className={cancelClass}>
        Cancel
      </button>
    </form>
  );
}

export function TrackPanel({ tracks, createTrack, updateTrack, deleteTrack }: TrackPanelProps) {
  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 mb-6">
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">
        Tracks
      </h2>

      {tracks.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">None added.</p>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {tracks.map((track) => (
            <TrackRow
              key={track.id}
              track={track}
              updateTrack={updateTrack}
              deleteTrack={deleteTrack}
            />
          ))}
        </div>
      )}

      <AddTrackForm createTrack={createTrack} />
    </div>
  );
}
