"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { formatFunctionLabel } from "@/lib/functionNumbers";
import { useRouter } from "next/navigation";
import type { CustomOption, EntityStatus } from "@prisma/client";
import type { getMediaDeliverables } from "./actions";
import type { WorkflowRowSummary } from "@/lib/workflowProgress";
import { partyLabel } from "@/lib/partyLabel";
import { WorkflowBadge } from "@/components/WorkflowBadge";
import { EmptyState } from "@/components/EmptyState";
import { EntityStatusBadge } from "@/components/EntityStatusBadge";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { InlineDeleteButton } from "@/components/InlineDeleteButton";
import { compareValues, sortIndicator, type SortDir } from "@/lib/tableSort";
import { EDIT_STATUS_OPTIONS } from "@/lib/statusConstants";
import { asPresence, type PresenceFilter } from "@/lib/presenceFilter";
import { PresenceFilterSelect } from "@/components/ui/PresenceFilterSelect";
import { useCanDelete, useCanWrite } from "@/components/PermissionsProvider";
import { InlineConfirmButton } from "@/components/InlineConfirmButton";
import { ColumnPicker } from "@/components/ColumnPicker";
import { parseHiddenColumns } from "@/lib/tableColumns";
import { useHiddenColumns } from "@/lib/useHiddenColumns";
import { MEDIA_DELIVERABLE_TABLE_COLUMNS, type MediaDeliverableTableColumn } from "./tableColumns";

type MediaDeliverable = Awaited<ReturnType<typeof getMediaDeliverables>>[number];

type Props = {
  mediaDeliverables: MediaDeliverable[];
  eventId: string;
  workflowSummaries: Record<string, WorkflowRowSummary>;
  substatuses: CustomOption[];
  vendors: { id: string; name: string }[];
  functions: { id: string; name: string }[];
  presentations: { id: string; title: string }[];
  mediaTypeOptions: { id: string; label: string }[];
  initialStatus?: string;
  initialVendor?: string;
  initialFunction?: string;
  initialLinked?: string;
  initialHiddenColumns: string[];
  deleteMediaDeliverable: (formData: FormData) => Promise<void>;
  deleteMediaDeliverables: (ids: string[]) => Promise<void>;
  bulkUpdateMediaDeliverables: (
    ids: string[],
    updates: {
      status?: EntityStatus;
      substatus?: string | null;
      providerVendorId?: string | null;
      providerContactId?: string | null;
      mediaType?: string | null;
      functionId?: string;
      presentationId?: string;
    }
  ) => Promise<void>;
};

type SortField = "name" | "status" | "provider" | "mediaType" | "functions" | "presentations";
type FilterState = { name: string; status: string; provider: PresenceFilter; function: PresenceFilter; linked: PresenceFilter };
const DEFAULT_FILTERS: FilterState = { name: "", status: "", provider: "", function: "", linked: "" };

export function MediaDeliverableList({
  mediaDeliverables,
  eventId,
  workflowSummaries,
  substatuses,
  vendors,
  functions,
  presentations,
  mediaTypeOptions,
  initialStatus,
  initialVendor,
  initialFunction,
  initialLinked,
  initialHiddenColumns,
  deleteMediaDeliverable,
  deleteMediaDeliverables,
  bulkUpdateMediaDeliverables,
}: Props) {
  const canWrite = useCanWrite("MEDIA_DELIVERABLES");
  const canDelete = useCanDelete("MEDIA_DELIVERABLES");
  // Selection only exists to feed bulk edit and bulk delete, so it goes
  // away entirely when the user has neither.
  const canSelect = canWrite || canDelete;
  const router = useRouter();
  const [view, setView] = useState<"list" | "table">("list");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filters, setFilters] = useState<FilterState>({
    ...DEFAULT_FILTERS,
    status: initialStatus ?? "",
    provider: asPresence(initialVendor),
    function: asPresence(initialFunction),
    linked: asPresence(initialLinked),
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<EntityStatus | "">("");
  const [bulkSubstatus, setBulkSubstatus] = useState("");
  const [bulkProviderVendorId, setBulkProviderVendorId] = useState("");
  const [bulkMediaType, setBulkMediaType] = useState("");
  const [bulkFunctionId, setBulkFunctionId] = useState("");
  const [bulkPresentationId, setBulkPresentationId] = useState("");
  const columns = useHiddenColumns<MediaDeliverableTableColumn>(
    "media_deliverables",
    parseHiddenColumns(initialHiddenColumns, MEDIA_DELIVERABLE_TABLE_COLUMNS)
  );
  const show = columns.isVisible;

  function setFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  const filtered = useMemo(() => {
    return mediaDeliverables.filter((d) => {
      if (filters.name && !d.name.toLowerCase().includes(filters.name.toLowerCase())) return false;
      if (filters.status === "__blank__") {
        if (d.status != null) return false;
      } else if (filters.status && d.status !== filters.status) return false;
      const hasProvider = !!(d.providerVendor || d.providerContact);
      if (filters.provider === "yes" && !hasProvider) return false;
      if (filters.provider === "none" && hasProvider) return false;
      if (filters.function === "yes" && d.functions.length === 0) return false;
      if (filters.function === "none" && d.functions.length > 0) return false;
      const hasLink = d.functions.length > 0 || d.presentations.length > 0;
      if (filters.linked === "yes" && !hasLink) return false;
      if (filters.linked === "none" && hasLink) return false;
      return true;
    });
  }, [mediaDeliverables, filters]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      switch (sortField) {
        case "name": return compareValues(a.name, b.name, sortDir);
        case "status": return compareValues(a.status, b.status, sortDir);
        case "provider":
          return compareValues(
            partyLabel(a.providerVendor, a.providerContact) ?? "",
            partyLabel(b.providerVendor, b.providerContact) ?? "",
            sortDir
          );
        case "mediaType": return compareValues(a.mediaType ?? "", b.mediaType ?? "", sortDir);
        case "functions": return compareValues(a.functions.length, b.functions.length, sortDir);
        case "presentations": return compareValues(a.presentations.length, b.presentations.length, sortDir);
        default: return 0;
      }
    });
  }, [filtered, sortField, sortDir]);

  function handleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  }

  const allFilteredIds = sorted.map((d) => d.id);
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
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    const ids = Array.from(selected);
    await deleteMediaDeliverables(ids);
    setSelected(new Set());
    router.refresh();
  }

  async function handleBulkApply() {
    const ids = Array.from(selected);
    const updates: {
      status?: EntityStatus;
      substatus?: string | null;
      providerVendorId?: string | null;
      providerContactId?: string | null;
      mediaType?: string | null;
      functionId?: string;
      presentationId?: string;
    } = {};
    if (bulkStatus) updates.status = bulkStatus as EntityStatus;
    if (bulkStatus && bulkSubstatus) updates.substatus = bulkSubstatus;
    else if (bulkStatus) updates.substatus = null;
    if (bulkProviderVendorId) updates.providerVendorId = bulkProviderVendorId;
    if (bulkMediaType) updates.mediaType = bulkMediaType;
    if (bulkFunctionId) updates.functionId = bulkFunctionId;
    if (bulkPresentationId) updates.presentationId = bulkPresentationId;
    if (Object.keys(updates).length === 0) return;
    await bulkUpdateMediaDeliverables(ids, updates);
    setSelected(new Set());
    setShowBulkEdit(false);
    setBulkStatus("");
    setBulkSubstatus("");
    setBulkProviderVendorId("");
    setBulkMediaType("");
    setBulkFunctionId("");
    setBulkPresentationId("");
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
            {sorted.length}{sorted.length !== mediaDeliverables.length ? ` of ${mediaDeliverables.length}` : ""} media deliverable{mediaDeliverables.length !== 1 ? "s" : ""}
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
          <PresenceFilterSelect label="Provider" value={filters.provider} onChange={(v) => setFilter("provider", v)} />
          <PresenceFilterSelect label="Function" value={filters.function} onChange={(v) => setFilter("function", v)} />
          <PresenceFilterSelect
            label="Link"
            value={filters.linked}
            onChange={(v) => setFilter("linked", v)}
            hasLabel="Linked"
            missingLabel="Unlinked"
          />
        </div>
        {canWrite && (
          <Link
            href={`/events/${eventId}/media-deliverables/new`}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 shrink-0"
          >
            Create Media Deliverable
          </Link>
        )}
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
            <InlineConfirmButton
              onConfirm={handleBulkDelete}
              label="Delete selected"
              confirmLabel={`Delete ${selected.size} media deliverable${selected.size !== 1 ? "s" : ""}`}
              resource="MEDIA_DELIVERABLES"
              className="rounded border border-red-300 dark:border-red-700 bg-white dark:bg-gray-800 px-2 py-0.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
            />
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
          <div className="max-w-full">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Status</label>
            <select value={bulkStatus} onChange={(e) => { setBulkStatus(e.target.value as EntityStatus | ""); setBulkSubstatus(""); }} className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white max-w-full">
              <option value="">— no change —</option>
              {EDIT_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {availableSubstatuses.length > 0 && (
            <div className="max-w-full">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Substatus</label>
              <select value={bulkSubstatus} onChange={(e) => setBulkSubstatus(e.target.value)} className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white max-w-full">
                <option value="">— no change —</option>
                {availableSubstatuses.map((s) => <option key={s.id} value={s.label}>{s.label}</option>)}
              </select>
            </div>
          )}
          {mediaTypeOptions.length > 0 && (
            <div className="max-w-full">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Media Type</label>
              <select value={bulkMediaType} onChange={(e) => setBulkMediaType(e.target.value)} className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white max-w-full">
                <option value="">— no change —</option>
                {mediaTypeOptions.map((o) => <option key={o.id} value={o.label}>{o.label}</option>)}
              </select>
            </div>
          )}
          {vendors.length > 0 && (
            <div className="max-w-full">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Provider Vendor</label>
              <select value={bulkProviderVendorId} onChange={(e) => setBulkProviderVendorId(e.target.value)} className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white max-w-full">
                <option value="">— no change —</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
          )}
          {functions.length > 0 && (
            <div className="max-w-full">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Add Function Link</label>
              <select value={bulkFunctionId} onChange={(e) => setBulkFunctionId(e.target.value)} className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white max-w-full">
                <option value="">— no change —</option>
                {functions.map((f) => <option key={f.id} value={f.id}>{formatFunctionLabel(f)}</option>)}
              </select>
            </div>
          )}
          {presentations.length > 0 && (
            <div className="max-w-full">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Add Presentation Link</label>
              <select value={bulkPresentationId} onChange={(e) => setBulkPresentationId(e.target.value)} className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white max-w-full">
                <option value="">— no change —</option>
                {presentations.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
          )}
          <button onClick={handleBulkApply} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
            Apply
          </button>
        </div>
      )}

      {mediaDeliverables.length === 0 ? (
        <EmptyState message="No media deliverables yet." />
      ) : view === "list" ? (
        <div className="space-y-2">
          {sorted.map((d) => {
            const provider = partyLabel(d.providerVendor, d.providerContact);
            return (
              <div
                key={d.id}
                className={`bg-white dark:bg-gray-800 shadow rounded-lg p-4 flex items-start gap-3 ${selected.has(d.id) ? "ring-2 ring-blue-200 dark:ring-blue-800" : ""}`}
              >
                <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleRow(d.id)} className="mt-1 h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/events/${eventId}/media-deliverables/${d.id}`}
                      className="text-gray-900 dark:text-white font-medium hover:text-blue-600 dark:hover:text-blue-400"
                    >
                      {d.name}
                    </Link>
                    <WorkflowBadge summary={workflowSummaries[d.id]} />
                    <EntityStatusBadge status={d.status} substatus={d.substatus} />
                  </div>
                  <div className="mt-1 flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
                    {d.mediaType && <span>{d.mediaType}</span>}
                    {provider && <span>Provider: {provider}</span>}
                    {d.functions.length > 0 && (
                      <span className="text-green-600 dark:text-green-400">
                        {d.functions.length === 1
                          ? `Linked to function: ${formatFunctionLabel(d.functions[0])}`
                          : `Linked to ${d.functions.length} functions`}
                      </span>
                    )}
                    {d.presentations.length > 0 && (
                      <span className="text-blue-600 dark:text-blue-400">
                        {d.presentations.length === 1
                          ? `Linked to presentation: ${d.presentations[0].title}`
                          : `Linked to ${d.presentations.length} presentations`}
                      </span>
                    )}
                    {d.functions.length === 0 && d.presentations.length === 0 && (
                      <span className="text-orange-600 dark:text-orange-400">Unlinked</span>
                    )}
                  </div>
                </div>
                <InlineDeleteButton
                  resource="MEDIA_DELIVERABLES"
                  action={deleteMediaDeliverable}
                  hiddenInputs={{ mediaDeliverableId: d.id }}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex justify-end">
            <ColumnPicker
              columns={MEDIA_DELIVERABLE_TABLE_COLUMNS}
              hidden={columns.hidden}
              onToggle={columns.setColumnHidden}
              onShowAll={columns.showAll}
            />
          </div>
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-x-auto">
            <table className="min-w-full text-sm divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  {canSelect && <th className={`${thBase} w-8`}><input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="rounded" /></th>}
                  <th className={thSortable} onClick={() => handleSort("name")}>Name{sortIndicator(sortField === "name", sortDir)}</th>
                  {show("status") && <th className={thSortable} onClick={() => handleSort("status")}>Status{sortIndicator(sortField === "status", sortDir)}</th>}
                  {show("workflow") && <th className={thBase}>Workflow</th>}
                  {show("mediaType") && <th className={thSortable} onClick={() => handleSort("mediaType")}>Media Type{sortIndicator(sortField === "mediaType", sortDir)}</th>}
                  {show("provider") && <th className={thSortable} onClick={() => handleSort("provider")}>Provider{sortIndicator(sortField === "provider", sortDir)}</th>}
                  {show("functions") && <th className={thSortable} onClick={() => handleSort("functions")}>Functions{sortIndicator(sortField === "functions", sortDir)}</th>}
                  {show("presentations") && <th className={thSortable} onClick={() => handleSort("presentations")}>Presentations{sortIndicator(sortField === "presentations", sortDir)}</th>}
                </tr>
                <tr>
                  {/* Spacer under the select-all column; drops with it. */}
                  {canSelect && <td className={filterCell} />}
                  <td className={filterCell}>
                    <input type="text" placeholder="Filter…" value={filters.name} onChange={(e) => setFilter("name", e.target.value)} className={filterInput} />
                  </td>
                  {show("status") && (
                    <td className={filterCell}>
                      <select value={filters.status} onChange={(e) => setFilter("status", e.target.value)} className={filterInput}>
                        <option value="">All</option>
                        <option value="__blank__">(blank)</option>
                        {EDIT_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                  )}
                  {show("workflow") && <td className={filterCell} />}
                  {show("mediaType") && <td className={filterCell} />}
                  {show("provider") && <td className={filterCell} />}
                  {show("functions") && <td className={filterCell} />}
                  {show("presentations") && <td className={filterCell} />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {sorted.map((d) => {
                  const isSelected = selected.has(d.id);
                  const provider = partyLabel(d.providerVendor, d.providerContact);
                  return (
                    <tr key={d.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}>
                      {canSelect && <td className="px-3 py-3 w-8"><input type="checkbox" checked={isSelected} onChange={() => toggleRow(d.id)} className="rounded" /></td>}
                      <td className="px-3 py-3 font-medium">
                        <Link href={`/events/${eventId}/media-deliverables/${d.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">{d.name}</Link>
                      </td>
                      {show("status") && <td className="px-3 py-3 whitespace-nowrap"><EntityStatusBadge status={d.status} substatus={d.substatus} /></td>}
                      {show("workflow") && <td className="px-3 py-3 whitespace-nowrap"><WorkflowBadge summary={workflowSummaries[d.id]} /></td>}
                      {show("mediaType") && <td className="px-3 py-3 text-gray-600 dark:text-gray-400">{d.mediaType ?? "—"}</td>}
                      {show("provider") && <td className="px-3 py-3 text-gray-600 dark:text-gray-400">{provider ?? "—"}</td>}
                      {show("functions") && (
                        <td className="px-3 py-3 text-gray-600 dark:text-gray-400">
                          {d.functions.length > 0
                            ? d.functions.length === 1
                              ? <Link href={`/events/${eventId}/functions/${d.functions[0].id}`} className="text-blue-600 dark:text-blue-400 hover:underline">{formatFunctionLabel(d.functions[0])}</Link>
                              : `${d.functions.length} functions`
                            : <span className="text-orange-500">—</span>}
                        </td>
                      )}
                      {show("presentations") && (
                        <td className="px-3 py-3 text-gray-600 dark:text-gray-400">
                          {d.presentations.length > 0
                            ? d.presentations.length === 1
                              ? <Link href={`/events/${eventId}/presentations/${d.presentations[0].id}`} className="text-blue-600 dark:text-blue-400 hover:underline">{d.presentations[0].title}</Link>
                              : `${d.presentations.length} presentations`
                            : "—"}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sorted.length === 0 && (
              <p className="text-center text-gray-500 dark:text-gray-400 py-8 text-sm">No media deliverables match the current filters.</p>
            )}
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            {sorted.length === mediaDeliverables.length
              ? `${mediaDeliverables.length} media deliverable${mediaDeliverables.length !== 1 ? "s" : ""}`
              : `${sorted.length} of ${mediaDeliverables.length} media deliverables`}
          </p>
        </div>
      )}
    </div>
  );
}
