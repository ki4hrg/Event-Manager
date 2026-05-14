"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { colorClasses } from "@/lib/colors";
import { resolveOptionLabel, resolveOptionColor } from "@/lib/optionUtils";
import { EntityStatusBadge } from "@/components/EntityStatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { EDIT_STATUS_OPTIONS } from "@/lib/statusConstants";
import type {
  Presentation,
  PresentationContact,
  PresentationTrack,
  PresentationSlot,
  Contact,
  CustomOption,
} from "@prisma/client";

type SlotWithFunction = PresentationSlot & {
  function: { id: string; name: string };
};

type PresentationWithRelations = Presentation & {
  track: PresentationTrack | null;
  speakers: (PresentationContact & { contact: Contact })[];
  slots: SlotWithFunction[];
};

type PresentationListProps = {
  presentations: PresentationWithRelations[];
  eventId: string;
  tracks: PresentationTrack[];
  presentationTypes: CustomOption[];
  initialStatus?: string;
  duplicatePresentation: (id: string) => Promise<void>;
  deletePresentation: (id: string) => Promise<void>;
};


export function PresentationList({
  presentations,
  eventId,
  tracks,
  presentationTypes,
  initialStatus,
  duplicatePresentation,
  deletePresentation,
}: PresentationListProps) {
  const [filterStatus, setFilterStatus] = useState(initialStatus ?? "");

  const filteredPresentations = useMemo(() => {
    if (!filterStatus) return presentations;
    if (filterStatus === "__blank__") return presentations.filter((p) => p.status == null);
    return presentations.filter((p) => p.status === filterStatus);
  }, [presentations, filterStatus]);

  const trackMap = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);

  const { grouped, sortedTrackIds } = useMemo(() => {
    const grouped = filteredPresentations.reduce(
      (acc, p) => {
        const trackId = p.trackId || "_unassigned";
        if (!acc[trackId]) acc[trackId] = [];
        acc[trackId].push(p);
        return acc;
      },
      {} as Record<string, PresentationWithRelations[]>
    );
    const sortedTrackIds = Object.keys(grouped).sort((a, b) => {
      if (a === "_unassigned") return 1;
      if (b === "_unassigned") return -1;
      return (trackMap.get(a)?.sortOrder ?? 0) - (trackMap.get(b)?.sortOrder ?? 0);
    });
    return { grouped, sortedTrackIds };
  }, [filteredPresentations, trackMap]);

  const getPrimarySpeaker = (speakers: (PresentationContact & { contact: Contact })[]) => {
    const primary = speakers.find((s) => s.isPrimary);
    if (primary) {
      return `${primary.contact.firstName} ${primary.contact.lastName}`;
    }
    if (speakers.length > 0) {
      return `${speakers[0].contact.firstName} ${speakers[0].contact.lastName}`;
    }
    return null;
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">
            Presentations ({filteredPresentations.length}{filteredPresentations.length !== presentations.length ? ` of ${presentations.length}` : ""})
          </h2>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="">All statuses</option>
            <option value="__blank__">(blank)</option>
            {EDIT_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <Link
          href={`/events/${eventId}/presentations/new`}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Add Presentation
        </Link>
      </div>

      {presentations.length === 0 ? (
        <EmptyState message="No presentations yet. Add your first presentation to get started." />
      ) : (
        <div className="space-y-8">
          {sortedTrackIds.map((trackId) => {
            const track = trackMap.get(trackId);
            return (
              <div key={trackId}>
                <h3 className="text-md font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                  {trackId === "_unassigned" ? (
                    <span className="text-gray-500">No Track Assigned</span>
                  ) : (
                    <>
                      <span
                        className={`px-2 py-0.5 text-xs rounded ${
                          colorClasses[track?.color || "gray"] || colorClasses.gray
                        }`}
                      >
                        {track?.name || trackId}
                      </span>
                      <span className="text-gray-400 dark:text-gray-500 text-sm">
                        ({grouped[trackId].length})
                      </span>
                    </>
                  )}
                </h3>

                <div className="space-y-2">
                  {grouped[trackId].map((presentation) => {
                    const primarySpeaker = getPrimarySpeaker(presentation.speakers);
                    const slotCount = presentation.slots.length;

                    return (
                      <div
                        key={presentation.id}
                        className="bg-white dark:bg-gray-800 shadow rounded-lg p-4"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <Link
                              href={`/events/${eventId}/presentations/${presentation.id}`}
                              className="text-gray-900 dark:text-white font-medium hover:text-blue-600 dark:hover:text-blue-400"
                            >
                              {presentation.title}
                            </Link>

                            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                              {presentation.type && (
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${colorClasses[resolveOptionColor(presentation.type, presentationTypes)] ?? colorClasses.gray}`}>
                                  {resolveOptionLabel(presentation.type, presentationTypes)}
                                </span>
                              )}
                              <EntityStatusBadge status={presentation.status} substatus={presentation.substatus} />
                              {primarySpeaker && (
                                <span className="text-gray-600 dark:text-gray-400">
                                  {primarySpeaker}
                                  {presentation.speakers.length > 1 && (
                                    <span className="text-gray-400 dark:text-gray-500">
                                      {" "}
                                      +{presentation.speakers.length - 1} more
                                    </span>
                                  )}
                                </span>
                              )}
                              {slotCount > 0 ? (
                                <span className="text-green-600 dark:text-green-400">
                                  Scheduled in {slotCount} block{slotCount !== 1 ? "s" : ""}
                                </span>
                              ) : (
                                <span className="text-orange-600 dark:text-orange-400">
                                  Not scheduled
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 ml-4">
                            <form action={() => duplicatePresentation(presentation.id)}>
                              <button
                                type="submit"
                                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm"
                              >
                                Duplicate
                              </button>
                            </form>
                            <button
                              onClick={async () => {
                                if (confirm("Delete this presentation?")) {
                                  await deletePresentation(presentation.id);
                                }
                              }}
                              className="text-red-600 hover:underline text-sm"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
