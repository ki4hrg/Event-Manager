"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CustomOption } from "@prisma/client";
import type { EntityStatus } from "@prisma/client";
import type { getAVOrders } from "./actions";
import type { WorkflowBadgeSummary } from "@/app/events/workflows/actions";
import { WorkflowBadge } from "@/components/WorkflowBadge";
import { EmptyState } from "@/components/EmptyState";
import { EntityStatusBadge } from "@/components/EntityStatusBadge";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { InlineDeleteButton } from "@/components/InlineDeleteButton";
import { compareValues, sortIndicator, type SortDir } from "@/lib/tableSort";
import { EDIT_STATUS_OPTIONS, STATUS_LABEL } from "@/lib/statusConstants";
import { asPresence, type PresenceFilter } from "@/lib/presenceFilter";
import { PresenceFilterSelect } from "@/components/ui/PresenceFilterSelect";

type AVOrder = Awaited<ReturnType<typeof getAVOrders>>[number];

type Props = {
  avOrders: AVOrder[];
  eventId: string;
  workflowSummaries: Record<string, WorkflowBadgeSummary>;
  substatuses: CustomOption[];
  vendors: { id: string; name: string }[];
  initialStatus?: string;
  initialVendor?: string;
  initialFunction?: string;
  deleteAVOrder: (formData: FormData) => Promise<void>;
  deleteAVOrders: (ids: string[]) => Promise<void>;
  bulkUpdateAVOrders: (ids: string[], updates: { status?: EntityStatus; substatus?: string | null; vendorId?: string }) => Promise<void>;
};

type SortField = "name" | "status" | "vendors" | "functions" | "presentation";

type FilterState = { name: string; status: string; vendor: PresenceFilter; function: PresenceFilter };
const DEFAULT_FILTERS: FilterState = { name: "", status: "", vendor: "", function: "" };

export function AVOrderList({
  avOrders,
  eventId,
  workflowSummaries,
  substatuses,
  vendors,
  initialStatus,
  initialVendor,
  initialFunction,
  deleteAVOrder,
  deleteAVOrders,
  bulkUpdateAVOrders,
}: Props) {
  const router = useRouter();
  const [view, setView] = useState<"list" | "table">("list");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filters, setFilters] = useState<FilterState>({
    ...DEFAULT_FILTERS,
    status: initialStatus ?? "",
    vendor: asPresence(initialVendor),
    function: asPresence(initialFunction),
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<EntityStatus | "">("");
  const [bulkSubstatus, setBulkSubstatus] = useState("");
  const [bulkVendorId, setBulkVendorId] = useState("");

  function setFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  const filtered = useMemo(() => {
    return avOrders.filter((o) => {
      if (filters.name && !o.name.toLowerCase().includes(filters.name.toLowerCase())) return false;
      if (filters.status === "__blank__") {
        if (o.status != null) return false;
      } else if (filters.status && o.status !== filters.status) return false;
      if (filters.vendor === "yes" && o.vendors.length === 0) return false;
      if (filters.vendor === "none" && o.vendors.length > 0) return false;
      if (filters.function === "yes" && o.functions.length === 0) return false;
      if (filters.function === "none" && o.functions.length > 0) return false;
      return true;
    });
  }, [avOrders, filters]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      switch (sortField) {
        case "name": return compareValues(a.name, b.name, sortDir);
        case "status": return compareValues(a.status, b.status, sortDir);
        case "vendors": return compareValues(a.vendors.map((v) => v.vendor.name).join(", "), b.vendors.map((v) => v.vendor.name).join(", "), sortDir);
        case "functions": return compareValues(a.functions.length, b.functions.length, sortDir);
        case "presentation": return compareValues(a.presentations.map((p) => p.title).join(", "), b.presentations.map((p) => p.title).join(", "), sortDir);
        default: return 0;
      }
    });
  }, [filtered, sortField, sortDir]);

  function handleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  }

  const allFilteredIds = sorted.map((o) => o.id);
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
    if (!confirm(`Delete ${ids.length} AV order${ids.length !== 1 ? "s" : ""}?`)) return;
    await deleteAVOrders(ids);
    setSelected(new Set());
    router.refresh();
  }

  async function handleBulkApply() {
    const ids = Array.from(selected);
    const updates: { status?: EntityStatus; substatus?: string | null; vendorId?: string } = {};
    if (bulkStatus) updates.status = bulkStatus as EntityStatus;
    if (bulkStatus && bulkSubstatus) updates.substatus = bulkSubstatus;
    else if (bulkStatus) updates.substatus = null;
    if (bulkVendorId) updates.vendorId = bulkVendorId;
    if (Object.keys(updates).length === 0) return;
    await bulkUpdateAVOrders(ids, updates);
    setSelected(new Set());
    setShowBulkEdit(false);
    setBulkStatus("");
    setBulkSubstatus("");
    setBulkVendorId("");
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
        <div className="flex items-center gap-3 min-w-0">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {sorted.length}{sorted.length !== avOrders.length ? ` of ${avOrders.length}` : ""} AV order{avOrders.length !== 1 ? "s" : ""}
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
          <PresenceFilterSelect label="Vendor" value={filters.vendor} onChange={(v) => setFilter("vendor", v)} />
          <PresenceFilterSelect label="Function" value={filters.function} onChange={(v) => setFilter("function", v)} />
        </div>
        <div className="flex gap-2 shrink-0">
          <a
            href={`/events/${eventId}/av-orders/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Print All
          </a>
          <Link
            href={`/events/${eventId}/av-orders/new`}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Create AV Order
          </Link>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 text-sm">
          <span className="font-medium text-blue-700 dark:text-blue-300">{selected.size} selected</span>
          <button
            onClick={() => setShowBulkEdit((v) => !v)}
            className="rounded border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-800 px-2 py-0.5 text-xs hover:bg-blue-50 dark:hover:bg-blue-900/40"
          >
            {showBulkEdit ? "Hide bulk edit" : "Bulk edit"}
          </button>
          <button
            onClick={handleBulkDelete}
            className="rounded border border-red-300 dark:border-red-700 bg-white dark:bg-gray-800 px-2 py-0.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            Delete selected
          </button>
          <button
            onClick={() => { setSelected(new Set()); setShowBulkEdit(false); }}
            className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-0.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Clear selection
          </button>
        </div>
      )}
      {showBulkEdit && selected.size > 0 && (
        <div className="mb-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 flex flex-wrap items-end gap-3 text-sm">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Status</label>
            <select value={bulkStatus} onChange={(e) => { setBulkStatus(e.target.value as EntityStatus | ""); setBulkSubstatus(""); }} className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white">
              <option value="">— no change —</option>
              {EDIT_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {availableSubstatuses.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Substatus</label>
              <select value={bulkSubstatus} onChange={(e) => setBulkSubstatus(e.target.value)} className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white">
                <option value="">— no change —</option>
                {availableSubstatuses.map((s) => <option key={s.id} value={s.label}>{s.label}</option>)}
              </select>
            </div>
          )}
          {vendors.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Assign Vendor</label>
              <select value={bulkVendorId} onChange={(e) => setBulkVendorId(e.target.value)} className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white">
                <option value="">— no change —</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
          )}
          <button onClick={handleBulkApply} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
            Apply
          </button>
        </div>
      )}

      {avOrders.length === 0 ? (
        <EmptyState message="No AV orders yet. Create your first AV order to get started." />
      ) : view === "list" ? (
        <div className="space-y-2">
          {sorted.map((avOrder) => (
            <div
              key={avOrder.id}
              className={`bg-white dark:bg-gray-800 shadow rounded-lg p-4 flex items-start gap-3 ${selected.has(avOrder.id) ? "ring-2 ring-blue-200 dark:ring-blue-800" : ""}`}
            >
              <input type="checkbox" checked={selected.has(avOrder.id)} onChange={() => toggleRow(avOrder.id)} className="mt-1 h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/events/${eventId}/av-orders/${avOrder.id}`}
                    className="text-gray-900 dark:text-white font-medium hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    {avOrder.name}
                  </Link>
                  <WorkflowBadge summary={workflowSummaries[avOrder.id]} />
                  <EntityStatusBadge status={avOrder.status} substatus={avOrder.substatus} />
                </div>
                <div className="mt-1 flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                  {avOrder.functions.length > 0 && (
                    <span className="text-green-600 dark:text-green-400">
                      {avOrder.functions.length === 1
                        ? `Linked to function: ${avOrder.functions[0].name}`
                        : `Linked to ${avOrder.functions.length} functions`}
                    </span>
                  )}
                  {avOrder.presentations.length > 0 && (
                    <span className="text-blue-600 dark:text-blue-400">
                      {avOrder.presentations.length === 1
                        ? `Linked to presentation: ${avOrder.presentations[0].title}`
                        : `Linked to ${avOrder.presentations.length} presentations`}
                    </span>
                  )}
                  {avOrder.functions.length === 0 && avOrder.presentations.length === 0 && (
                    <span className="text-orange-600 dark:text-orange-400">Unlinked</span>
                  )}
                </div>
              </div>
              <InlineDeleteButton
                action={deleteAVOrder}
                hiddenInputs={{ avOrderId: avOrder.id }}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-x-auto">
            <table className="min-w-full text-sm divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  <th className={`${thBase} w-8`}>
                    <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="rounded" />
                  </th>
                  <th className={thSortable} onClick={() => handleSort("name")}>Name{sortIndicator(sortField === "name", sortDir)}</th>
                  <th className={thSortable} onClick={() => handleSort("status")}>Status{sortIndicator(sortField === "status", sortDir)}</th>
                  <th className={thBase}>Workflow</th>
                  <th className={thSortable} onClick={() => handleSort("vendors")}>Vendor(s){sortIndicator(sortField === "vendors", sortDir)}</th>
                  <th className={thSortable} onClick={() => handleSort("functions")}>Functions{sortIndicator(sortField === "functions", sortDir)}</th>
                  <th className={thSortable} onClick={() => handleSort("presentation")}>Presentation{sortIndicator(sortField === "presentation", sortDir)}</th>
                </tr>
                <tr>
                  <td className={filterCell} />
                  <td className={filterCell}>
                    <input type="text" placeholder="Filter…" value={filters.name} onChange={(e) => setFilter("name", e.target.value)} className={filterInput} />
                  </td>
                  <td className={filterCell}>
                    <select value={filters.status} onChange={(e) => setFilter("status", e.target.value)} className={filterInput}>
                      <option value="">All</option>
                      <option value="__blank__">(blank)</option>
                      {EDIT_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                  <td className={filterCell} />
                  <td className={filterCell} />
                  <td className={filterCell} />
                  <td className={filterCell} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {sorted.map((o) => {
                  const isSelected = selected.has(o.id);
                  return (
                    <tr key={o.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}>
                      <td className="px-3 py-3 w-8">
                        <input type="checkbox" checked={isSelected} onChange={() => toggleRow(o.id)} className="rounded" />
                      </td>
                      <td className="px-3 py-3 font-medium">
                        <Link href={`/events/${eventId}/av-orders/${o.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">
                          {o.name}
                        </Link>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <EntityStatusBadge status={o.status} substatus={o.substatus} />
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <WorkflowBadge summary={workflowSummaries[o.id]} />
                      </td>
                      <td className="px-3 py-3 text-gray-600 dark:text-gray-400">
                        {o.vendors.length > 0 ? o.vendors.map((v) => v.vendor.name).join(", ") : "—"}
                      </td>
                      <td className="px-3 py-3 text-gray-600 dark:text-gray-400">
                        {o.functions.length > 0
                          ? o.functions.length === 1
                            ? <Link href={`/events/${eventId}/functions/${o.functions[0].id}`} className="text-blue-600 dark:text-blue-400 hover:underline">{o.functions[0].name}</Link>
                            : `${o.functions.length} functions`
                          : <span className="text-orange-500">Unlinked</span>}
                      </td>
                      <td className="px-3 py-3 text-gray-600 dark:text-gray-400">
                        {o.presentations.length > 0
                          ? o.presentations.length === 1
                            ? <Link href={`/events/${eventId}/presentations/${o.presentations[0].id}`} className="text-blue-600 dark:text-blue-400 hover:underline">{o.presentations[0].title}</Link>
                            : `${o.presentations.length} presentations`
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sorted.length === 0 && (
              <p className="text-center text-gray-500 dark:text-gray-400 py-8 text-sm">No AV orders match the current filters.</p>
            )}
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            {sorted.length === avOrders.length
              ? `${avOrders.length} AV order${avOrders.length !== 1 ? "s" : ""}`
              : `${sorted.length} of ${avOrders.length} AV orders`}
          </p>
        </div>
      )}
    </div>
  );
}
