"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { colorClasses } from "@/lib/colors";
import { resolveOptionLabel, resolveOptionColor } from "@/lib/optionUtils";
import { EntityStatusBadge } from "@/components/EntityStatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { compareValues, sortIndicator, type SortDir } from "@/lib/tableSort";
import { EDIT_STATUS_OPTIONS } from "@/lib/statusConstants";
import { asPresence, type PresenceFilter } from "@/lib/presenceFilter";
import { PresenceFilterSelect } from "@/components/ui/PresenceFilterSelect";
import { useCanDelete, useCanWrite } from "@/components/PermissionsProvider";
import type {
  Presentation,
  PresentationContact,
  PresentationTrack,
  PresentationSlot,
  Contact,
  CustomOption,
  EntityStatus,
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
  substatuses: CustomOption[];
  initialStatus?: string;
  initialSlot?: string;
  initialSpeaker?: string;
  duplicatePresentation: (id: string) => Promise<void>;
  deletePresentation: (id: string) => Promise<void>;
  deletePresentations: (ids: string[]) => Promise<void>;
  bulkUpdatePresentations: (
    ids: string[],
    updates: { status?: EntityStatus; substatus?: string | null; trackId?: string | null; type?: string }
  ) => Promise<void>;
};

type SortField = "title" | "status" | "type" | "track" | "speaker" | "slots";
type FilterState = { title: string; status: string; trackId: string; type: string; slot: PresenceFilter; speaker: PresenceFilter };
const DEFAULT_FILTERS: FilterState = { title: "", status: "", trackId: "", type: "", slot: "", speaker: "" };

function primarySpeakerName(speakers: (PresentationContact & { contact: Contact })[]) {
  const primary = speakers.find((s) => s.isPrimary) ?? speakers[0];
  if (!primary) return "";
  return `${primary.contact.firstName} ${primary.contact.lastName}`;
}

export function PresentationList({
  presentations,
  eventId,
  tracks,
  presentationTypes,
  substatuses,
  initialStatus,
  initialSlot,
  initialSpeaker,
  duplicatePresentation,
  deletePresentation,
  deletePresentations,
  bulkUpdatePresentations,
}: PresentationListProps) {
  const canWrite = useCanWrite("PRESENTATIONS");
  const canDelete = useCanDelete("PRESENTATIONS");
  // Selection only exists to feed bulk edit and bulk delete, so it goes
  // away entirely when the user has neither.
  const canSelect = canWrite || canDelete;
  const router = useRouter();
  const [view, setView] = useState<"list" | "table">("list");
  const [sortField, setSortField] = useState<SortField>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filters, setFilters] = useState<FilterState>({
    ...DEFAULT_FILTERS,
    status: initialStatus ?? "",
    slot: asPresence(initialSlot),
    speaker: asPresence(initialSpeaker),
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<EntityStatus | "">("");
  const [bulkSubstatus, setBulkSubstatus] = useState("");
  const [bulkTrackId, setBulkTrackId] = useState<string>("__no_change__");
  const [bulkType, setBulkType] = useState<string>("__no_change__");

  function setFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  const trackMap = useMemo(() => new Map(tracks.map((t) => [t.id, t])), [tracks]);

  const filtered = useMemo(() => {
    return presentations.filter((p) => {
      if (filters.title && !p.title.toLowerCase().includes(filters.title.toLowerCase())) return false;
      if (filters.status === "__blank__") {
        if (p.status != null) return false;
      } else if (filters.status && p.status !== filters.status) return false;
      if (filters.trackId === "__blank__") {
        if (p.trackId != null) return false;
      } else if (filters.trackId && p.trackId !== filters.trackId) return false;
      if (filters.type && p.type !== filters.type) return false;
      if (filters.slot === "yes" && p.slots.length === 0) return false;
      if (filters.slot === "none" && p.slots.length > 0) return false;
      if (filters.speaker === "yes" && p.speakers.length === 0) return false;
      if (filters.speaker === "none" && p.speakers.length > 0) return false;
      return true;
    });
  }, [presentations, filters]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      switch (sortField) {
        case "title": return compareValues(a.title, b.title, sortDir);
        case "status": return compareValues(a.status, b.status, sortDir);
        case "type": return compareValues(a.type, b.type, sortDir);
        case "track": return compareValues(a.track?.name ?? "", b.track?.name ?? "", sortDir);
        case "speaker": return compareValues(primarySpeakerName(a.speakers), primarySpeakerName(b.speakers), sortDir);
        case "slots": return compareValues(a.slots.length, b.slots.length, sortDir);
        default: return 0;
      }
    });
  }, [filtered, sortField, sortDir]);

  function handleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  }

  const allFilteredIds = sorted.map((p) => p.id);
  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selected.has(id));

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) allFilteredIds.forEach((id) => next.delete(id));
      else allFilteredIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    const ids = Array.from(selected);
    if (!confirm(`Delete ${ids.length} presentation${ids.length !== 1 ? "s" : ""}?`)) return;
    await deletePresentations(ids);
    setSelected(new Set());
    router.refresh();
  }

  async function handleBulkApply() {
    const ids = Array.from(selected);
    const updates: { status?: EntityStatus; substatus?: string | null; trackId?: string | null; type?: string } = {};
    if (bulkStatus) {
      updates.status = bulkStatus as EntityStatus;
      updates.substatus = bulkSubstatus || null;
    }
    if (bulkTrackId !== "__no_change__") updates.trackId = bulkTrackId || null;
    if (bulkType !== "__no_change__") updates.type = bulkType;
    if (Object.keys(updates).length === 0) return;
    await bulkUpdatePresentations(ids, updates);
    setSelected(new Set());
    setShowBulkEdit(false);
    setBulkStatus("");
    setBulkSubstatus("");
    setBulkTrackId("__no_change__");
    setBulkType("__no_change__");
    router.refresh();
  }

  const availableSubstatuses = useMemo(
    () => substatuses.filter((s) => !s.group || s.group === bulkStatus),
    [substatuses, bulkStatus]
  );

  const thBase = "px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap bg-gray-50 dark:bg-gray-900";
  const thSortable = `${thBase} cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none`;
  const filterCell = "px-2 py-1 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700";
  const filterInput = "w-full text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 dark:text-white";

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-y-2 mb-4">
        <div className="flex items-center gap-3 min-w-0 flex-wrap">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {sorted.length}{sorted.length !== presentations.length ? ` of ${presentations.length}` : ""} Presentation{presentations.length !== 1 ? "s" : ""}
          </p>
          <ViewToggle view={view} onChange={setView} />
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-gray-500 dark:text-gray-400">Status:</span>
            <select
              value={filters.status}
              onChange={(e) => setFilter("status", e.target.value)}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="">All</option>
              <option value="__blank__">(blank)</option>
              {EDIT_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-gray-500 dark:text-gray-400">Track:</span>
            <select
              value={filters.trackId}
              onChange={(e) => setFilter("trackId", e.target.value)}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="">All</option>
              <option value="__blank__">(blank)</option>
              {tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <PresenceFilterSelect
            label="Slot"
            value={filters.slot}
            onChange={(v) => setFilter("slot", v)}
            hasLabel="Assigned"
            missingLabel="Unassigned"
          />
          <PresenceFilterSelect label="Speaker" value={filters.speaker} onChange={(v) => setFilter("speaker", v)} />
        </div>
        <div className="flex gap-2 shrink-0">
          {canWrite && (
            <Link
              href={`/events/${eventId}/presentations/import`}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Import CSV
            </Link>
          )}
          {canWrite && (
            <Link
              href={`/events/${eventId}/presentations/new`}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Add Presentation
            </Link>
          )}
        </div>
      </div>

      {canSelect && selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 text-sm">
          <span className="font-medium text-blue-700 dark:text-blue-300">{selected.size} selected</span>
          {canWrite && (
            <button
              onClick={() => setShowBulkEdit((v) => !v)}
              className="rounded border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-800 px-2 py-0.5 text-xs hover:bg-blue-50 dark:hover:bg-blue-900/40"
            >
              {showBulkEdit ? "Hide bulk edit" : "Bulk edit"}
            </button>
          )}
          {canDelete && (
            <button
              onClick={handleBulkDelete}
              className="rounded border border-red-300 dark:border-red-700 bg-white dark:bg-gray-800 px-2 py-0.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              Delete selected
            </button>
          )}
          <button
            onClick={() => { setSelected(new Set()); setShowBulkEdit(false); }}
            className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-0.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Clear selection
          </button>
        </div>
      )}
      {canWrite && showBulkEdit && selected.size > 0 && (
        <div className="mb-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 flex flex-wrap items-end gap-3 text-sm">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Status</label>
            <select value={bulkStatus} onChange={(e) => { setBulkStatus(e.target.value as EntityStatus | ""); setBulkSubstatus(""); }} className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white">
              <option value="">— no change —</option>
              {EDIT_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {bulkStatus && availableSubstatuses.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Substatus</label>
              <select value={bulkSubstatus} onChange={(e) => setBulkSubstatus(e.target.value)} className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white">
                <option value="">— none —</option>
                {availableSubstatuses.map((s) => <option key={s.id} value={s.label}>{s.label}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Track</label>
            <select value={bulkTrackId} onChange={(e) => setBulkTrackId(e.target.value)} className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white">
              <option value="__no_change__">— no change —</option>
              <option value="">— none —</option>
              {tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Type</label>
            <select value={bulkType} onChange={(e) => setBulkType(e.target.value)} className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white">
              <option value="__no_change__">— no change —</option>
              <option value="">— none —</option>
              {presentationTypes.map((t) => <option key={t.id} value={t.label}>{t.label}</option>)}
            </select>
          </div>
          <button onClick={handleBulkApply} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
            Apply
          </button>
        </div>
      )}

      {presentations.length === 0 ? (
        <EmptyState message="No presentations yet. Add your first presentation to get started." />
      ) : view === "list" ? (
        <div className="space-y-2">
          {sorted.map((p) => {
            const speaker = primarySpeakerName(p.speakers);
            const slotCount = p.slots.length;
            const isSelected = selected.has(p.id);
            return (
              <div
                key={p.id}
                className={`bg-white dark:bg-gray-800 shadow rounded-lg p-4 flex items-start gap-3 ${isSelected ? "ring-2 ring-blue-200 dark:ring-blue-800" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleRow(p.id)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/events/${eventId}/presentations/${p.id}`}
                        className="text-gray-900 dark:text-white font-medium hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        {p.title}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                        {p.track && (
                          <span className={`px-2 py-0.5 rounded text-xs ${colorClasses[p.track.color || "gray"] ?? colorClasses.gray}`}>
                            {p.track.name}
                          </span>
                        )}
                        {p.type && (
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${colorClasses[resolveOptionColor(p.type, presentationTypes)] ?? colorClasses.gray}`}>
                            {resolveOptionLabel(p.type, presentationTypes)}
                          </span>
                        )}
                        <EntityStatusBadge status={p.status} substatus={p.substatus} />
                        {speaker && (
                          <span className="text-gray-600 dark:text-gray-400">
                            {speaker}
                            {p.speakers.length > 1 && (
                              <span className="text-gray-400 dark:text-gray-500"> +{p.speakers.length - 1} more</span>
                            )}
                          </span>
                        )}
                        {slotCount > 0 ? (
                          <span className="text-green-600 dark:text-green-400">
                            Scheduled in {slotCount} block{slotCount !== 1 ? "s" : ""}
                          </span>
                        ) : (
                          <span className="text-orange-600 dark:text-orange-400">Not scheduled</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {canWrite && (
                        <form action={() => duplicatePresentation(p.id)}>
                          <button type="submit" className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-sm">
                            Duplicate
                          </button>
                        </form>
                      )}
                      {canDelete && (
                        <button
                          onClick={async () => {
                            if (confirm("Delete this presentation?")) await deletePresentation(p.id);
                          }}
                          className="text-red-600 hover:underline text-sm"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-x-auto">
            <table className="min-w-full text-sm divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  {canSelect && <th className={`${thBase} w-8`}><input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="rounded" /></th>}
                  <th className={thSortable} onClick={() => handleSort("title")}>Title{sortIndicator(sortField === "title", sortDir)}</th>
                  <th className={thSortable} onClick={() => handleSort("status")}>Status{sortIndicator(sortField === "status", sortDir)}</th>
                  <th className={thSortable} onClick={() => handleSort("type")}>Type{sortIndicator(sortField === "type", sortDir)}</th>
                  <th className={thSortable} onClick={() => handleSort("track")}>Track{sortIndicator(sortField === "track", sortDir)}</th>
                  <th className={thSortable} onClick={() => handleSort("speaker")}>Primary Speaker{sortIndicator(sortField === "speaker", sortDir)}</th>
                  <th className={thSortable} onClick={() => handleSort("slots")}>Schedule{sortIndicator(sortField === "slots", sortDir)}</th>
                </tr>
                <tr>
                  {/* Spacer under the select-all column; drops with it. */}
                  {canSelect && <td className={filterCell} />}
                  <td className={filterCell}><input type="text" placeholder="Filter…" value={filters.title} onChange={(e) => setFilter("title", e.target.value)} className={filterInput} /></td>
                  <td className={filterCell}>
                    <select value={filters.status} onChange={(e) => setFilter("status", e.target.value)} className={filterInput}>
                      <option value="">All</option>
                      <option value="__blank__">(blank)</option>
                      {EDIT_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                  <td className={filterCell}>
                    <select value={filters.type} onChange={(e) => setFilter("type", e.target.value)} className={filterInput}>
                      <option value="">All</option>
                      {presentationTypes.map((t) => <option key={t.id} value={t.label}>{t.label}</option>)}
                    </select>
                  </td>
                  <td className={filterCell}>
                    <select value={filters.trackId} onChange={(e) => setFilter("trackId", e.target.value)} className={filterInput}>
                      <option value="">All</option>
                      <option value="__blank__">(blank)</option>
                      {tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </td>
                  <td className={filterCell} />
                  <td className={filterCell} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {sorted.map((p) => {
                  const isSelected = selected.has(p.id);
                  const speaker = primarySpeakerName(p.speakers);
                  return (
                    <tr key={p.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}>
                      {canSelect && <td className="px-3 py-3 w-8"><input type="checkbox" checked={isSelected} onChange={() => toggleRow(p.id)} className="rounded" /></td>}
                      <td className="px-3 py-3 font-medium">
                        <Link href={`/events/${eventId}/presentations/${p.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">{p.title}</Link>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap"><EntityStatusBadge status={p.status} substatus={p.substatus} /></td>
                      <td className="px-3 py-3 text-gray-600 dark:text-gray-400">{p.type ? resolveOptionLabel(p.type, presentationTypes) : "—"}</td>
                      <td className="px-3 py-3 text-gray-600 dark:text-gray-400">{p.track?.name ?? "—"}</td>
                      <td className="px-3 py-3 text-gray-600 dark:text-gray-400">
                        {speaker || "—"}
                        {p.speakers.length > 1 && <span className="text-gray-400 dark:text-gray-500"> +{p.speakers.length - 1}</span>}
                      </td>
                      <td className="px-3 py-3 text-gray-600 dark:text-gray-400">
                        {p.slots.length > 0
                          ? <span className="text-green-600 dark:text-green-400">{p.slots.length} block{p.slots.length !== 1 ? "s" : ""}</span>
                          : <span className="text-orange-500">Not scheduled</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sorted.length === 0 && <p className="text-center text-gray-500 dark:text-gray-400 py-8 text-sm">No presentations match the current filters.</p>}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {sorted.length === presentations.length
              ? `${presentations.length} presentation${presentations.length !== 1 ? "s" : ""}`
              : `${sorted.length} of ${presentations.length} presentations`}
          </p>
        </div>
      )}
    </div>
  );
}
