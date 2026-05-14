"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CustomOption, EntityStatus } from "@prisma/client";
import type { getCateringOrders } from "./actions";
import type { WorkflowBadgeSummary } from "@/app/events/workflows/actions";
import { WorkflowBadge } from "@/components/WorkflowBadge";
import { EntityStatusBadge } from "@/components/EntityStatusBadge";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { InlineDeleteButton } from "@/components/InlineDeleteButton";
import { compareValues, sortIndicator, type SortDir } from "@/lib/tableSort";
import { EDIT_STATUS_OPTIONS } from "@/lib/statusConstants";

type CateringOrder = Awaited<ReturnType<typeof getCateringOrders>>[number];

type Props = {
  cateringOrders: CateringOrder[];
  eventId: string;
  workflowSummaries: Record<string, WorkflowBadgeSummary>;
  substatuses: CustomOption[];
  vendors: { id: string; name: string }[];
  initialStatus?: string;
  deleteCateringOrder: (formData: FormData) => Promise<void>;
  deleteCateringOrders: (ids: string[]) => Promise<void>;
  bulkUpdateCateringOrders: (ids: string[], updates: { status?: EntityStatus; substatus?: string | null; vendorId?: string }) => Promise<void>;
};

type SortField = "name" | "status" | "vendors" | "serviceStyle" | "guaranteeCount" | "function";
type FilterState = { name: string; status: string };
const DEFAULT_FILTERS: FilterState = { name: "", status: "" };

export function CateringOrderList({
  cateringOrders,
  eventId,
  workflowSummaries,
  substatuses,
  vendors,
  initialStatus,
  deleteCateringOrder,
  deleteCateringOrders,
  bulkUpdateCateringOrders,
}: Props) {
  const router = useRouter();
  const [view, setView] = useState<"list" | "table">("list");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filters, setFilters] = useState<FilterState>({ ...DEFAULT_FILTERS, status: initialStatus ?? "" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<EntityStatus | "">("");
  const [bulkSubstatus, setBulkSubstatus] = useState("");
  const [bulkVendorId, setBulkVendorId] = useState("");

  function setFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  const filtered = useMemo(() => {
    return cateringOrders.filter((o) => {
      if (filters.name && !o.name.toLowerCase().includes(filters.name.toLowerCase())) return false;
      if (filters.status === "__blank__") {
        if (o.status != null) return false;
      } else if (filters.status && o.status !== filters.status) return false;
      return true;
    });
  }, [cateringOrders, filters]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      switch (sortField) {
        case "name": return compareValues(a.name, b.name, sortDir);
        case "status": return compareValues(a.status, b.status, sortDir);
        case "vendors": return compareValues(a.vendors.map((v) => v.vendor.name).join(", "), b.vendors.map((v) => v.vendor.name).join(", "), sortDir);
        case "serviceStyle": return compareValues(a.serviceStyle ?? "", b.serviceStyle ?? "", sortDir);
        case "guaranteeCount": return compareValues(a.guaranteeCount ?? 0, b.guaranteeCount ?? 0, sortDir);
        case "function": return compareValues(a.function?.name ?? "", b.function?.name ?? "", sortDir);
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
    if (!confirm(`Delete ${ids.length} catering order${ids.length !== 1 ? "s" : ""}?`)) return;
    await deleteCateringOrders(ids);
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
    await bulkUpdateCateringOrders(ids, updates);
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
            {sorted.length}{sorted.length !== cateringOrders.length ? ` of ${cateringOrders.length}` : ""} Catering Order{cateringOrders.length !== 1 ? "s" : ""}
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
        </div>
        <div className="flex gap-2 shrink-0">
          <a
            href={`/events/${eventId}/catering-orders/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Print All
          </a>
          <Link
            href={`/events/${eventId}/catering-orders/new`}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Create Catering Order
          </Link>
        </div>
      </div>

      {cateringOrders.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">No Catering Orders yet. Create your first to get started.</p>
        </div>
      ) : view === "list" ? (
        <div className="space-y-2">
          {sorted.map((order) => (
            <div key={order.id} className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Link href={`/events/${eventId}/catering-orders/${order.id}`} className="text-gray-900 dark:text-white font-medium hover:text-blue-600 dark:hover:text-blue-400">
                    {order.name}
                  </Link>
                  <WorkflowBadge summary={workflowSummaries[order.id]} />
                  <EntityStatusBadge status={order.status} substatus={order.substatus} />
                </div>
                <div className="mt-1 flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                  {order.guaranteeCount != null && <span>Guarantee: {order.guaranteeCount}</span>}
                  {order.serviceStyle && <span>{order.serviceStyle}</span>}
                  {order.function
                    ? <span className="text-green-600 dark:text-green-400">Linked to function: {order.function.name}</span>
                    : <span className="text-orange-600 dark:text-orange-400">Unlinked</span>}
                </div>
              </div>
              <InlineDeleteButton action={deleteCateringOrder} hiddenInputs={{ cateringOrderId: order.id }} confirmMessage="Delete this Catering Order?" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {selected.size > 0 && (
            <div className="flex flex-col gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/30 rounded border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-3">
                <span className="text-sm text-blue-700 dark:text-blue-300">{selected.size} selected</span>
                <button onClick={() => setShowBulkEdit((v) => !v)} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Bulk edit</button>
                <button onClick={handleBulkDelete} className="text-sm text-red-600 dark:text-red-400 hover:underline">Delete selected</button>
                <button onClick={() => { setSelected(new Set()); setShowBulkEdit(false); }} className="text-sm text-gray-500 dark:text-gray-400 hover:underline ml-auto">Clear selection</button>
              </div>
              {showBulkEdit && (
                <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-blue-200 dark:border-blue-700">
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Status</label>
                    <select value={bulkStatus} onChange={(e) => { setBulkStatus(e.target.value as EntityStatus | ""); setBulkSubstatus(""); }} className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 dark:text-white">
                      <option value="">— no change —</option>
                      {EDIT_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  {availableSubstatuses.length > 0 && (
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Substatus</label>
                      <select value={bulkSubstatus} onChange={(e) => setBulkSubstatus(e.target.value)} className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 dark:text-white">
                        <option value="">— no change —</option>
                        {availableSubstatuses.map((s) => <option key={s.id} value={s.label}>{s.label}</option>)}
                      </select>
                    </div>
                  )}
                  {vendors.length > 0 && (
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Assign Vendor</label>
                      <select value={bulkVendorId} onChange={(e) => setBulkVendorId(e.target.value)} className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 dark:text-white">
                        <option value="">— no change —</option>
                        {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                    </div>
                  )}
                  <button onClick={handleBulkApply} className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Apply to {selected.size}</button>
                  <button onClick={() => setShowBulkEdit(false)} className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
                </div>
              )}
            </div>
          )}

          <div className="bg-white dark:bg-gray-800 shadow rounded-lg overflow-x-auto">
            <table className="min-w-full text-sm divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  <th className={`${thBase} w-8`}><input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="rounded" /></th>
                  <th className={thSortable} onClick={() => handleSort("name")}>Name{sortIndicator(sortField === "name", sortDir)}</th>
                  <th className={thSortable} onClick={() => handleSort("status")}>Status{sortIndicator(sortField === "status", sortDir)}</th>
                  <th className={thBase}>Workflow</th>
                  <th className={thSortable} onClick={() => handleSort("vendors")}>Vendor(s){sortIndicator(sortField === "vendors", sortDir)}</th>
                  <th className={thSortable} onClick={() => handleSort("serviceStyle")}>Service Style{sortIndicator(sortField === "serviceStyle", sortDir)}</th>
                  <th className={thSortable} onClick={() => handleSort("guaranteeCount")}>Guarantee{sortIndicator(sortField === "guaranteeCount", sortDir)}</th>
                  <th className={thSortable} onClick={() => handleSort("function")}>Function{sortIndicator(sortField === "function", sortDir)}</th>
                </tr>
                <tr>
                  <td className={filterCell} />
                  <td className={filterCell}><input type="text" placeholder="Filter…" value={filters.name} onChange={(e) => setFilter("name", e.target.value)} className={filterInput} /></td>
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
                  <td className={filterCell} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {sorted.map((o) => {
                  const isSelected = selected.has(o.id);
                  return (
                    <tr key={o.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}>
                      <td className="px-3 py-3 w-8"><input type="checkbox" checked={isSelected} onChange={() => toggleRow(o.id)} className="rounded" /></td>
                      <td className="px-3 py-3 font-medium">
                        <Link href={`/events/${eventId}/catering-orders/${o.id}`} className="text-blue-600 hover:underline">{o.name}</Link>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap"><EntityStatusBadge status={o.status} substatus={o.substatus} /></td>
                      <td className="px-3 py-3 whitespace-nowrap"><WorkflowBadge summary={workflowSummaries[o.id]} /></td>
                      <td className="px-3 py-3 text-gray-600 dark:text-gray-400">{o.vendors.length > 0 ? o.vendors.map((v) => v.vendor.name).join(", ") : "—"}</td>
                      <td className="px-3 py-3 text-gray-600 dark:text-gray-400">{o.serviceStyle || "—"}</td>
                      <td className="px-3 py-3 text-gray-600 dark:text-gray-400">{o.guaranteeCount ?? "—"}</td>
                      <td className="px-3 py-3 text-gray-600 dark:text-gray-400">
                        {o.function
                          ? <Link href={`/events/${eventId}/functions/${o.function.id}`} className="text-blue-600 hover:underline">{o.function.name}</Link>
                          : <span className="text-orange-500">Unlinked</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sorted.length === 0 && <p className="text-center text-gray-500 dark:text-gray-400 py-8 text-sm">No catering orders match the current filters.</p>}
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            {sorted.length === cateringOrders.length
              ? `${cateringOrders.length} catering order${cateringOrders.length !== 1 ? "s" : ""}`
              : `${sorted.length} of ${cateringOrders.length} catering orders`}
          </p>
        </div>
      )}
    </div>
  );
}
