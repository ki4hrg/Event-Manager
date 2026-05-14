"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CustomOption, EntityStatus } from "@prisma/client";
import type { getPrintOrders } from "./actions";
import type { WorkflowBadgeSummary } from "@/app/events/workflows/actions";
import { WorkflowBadge } from "@/components/WorkflowBadge";
import { EmptyState } from "@/components/EmptyState";
import { EntityStatusBadge } from "@/components/EntityStatusBadge";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { InlineDeleteButton } from "@/components/InlineDeleteButton";
import { compareValues, sortIndicator, type SortDir } from "@/lib/tableSort";
import { EDIT_STATUS_OPTIONS } from "@/lib/statusConstants";

type PrintOrder = Awaited<ReturnType<typeof getPrintOrders>>[number];

type Props = {
  printOrders: PrintOrder[];
  eventId: string;
  workflowSummaries: Record<string, WorkflowBadgeSummary>;
  substatuses: CustomOption[];
  vendors: { id: string; name: string }[];
  functions: { id: string; name: string }[];
  initialStatus?: string;
  deletePrintOrder: (formData: FormData) => Promise<void>;
  deletePrintOrders: (ids: string[]) => Promise<void>;
  bulkUpdatePrintOrders: (ids: string[], updates: { status?: EntityStatus; substatus?: string | null; vendorId?: string; functionId?: string }) => Promise<void>;
};

type SortField = "name" | "status" | "vendors" | "items" | "functions" | "presentation";
type FilterState = { name: string; status: string };
const DEFAULT_FILTERS: FilterState = { name: "", status: "" };

export function PrintOrderList({
  printOrders,
  eventId,
  workflowSummaries,
  substatuses,
  vendors,
  functions,
  initialStatus,
  deletePrintOrder,
  deletePrintOrders,
  bulkUpdatePrintOrders,
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
  const [bulkFunctionId, setBulkFunctionId] = useState("");

  function setFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  const filtered = useMemo(() => {
    return printOrders.filter((o) => {
      if (filters.name && !o.name.toLowerCase().includes(filters.name.toLowerCase())) return false;
      if (filters.status === "__blank__") {
        if (o.status != null) return false;
      } else if (filters.status && o.status !== filters.status) return false;
      return true;
    });
  }, [printOrders, filters]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      switch (sortField) {
        case "name": return compareValues(a.name, b.name, sortDir);
        case "status": return compareValues(a.status, b.status, sortDir);
        case "vendors": return compareValues(a.vendors.map((v) => v.vendor.name).join(", "), b.vendors.map((v) => v.vendor.name).join(", "), sortDir);
        case "items": return compareValues(a.items.length, b.items.length, sortDir);
        case "functions": return compareValues(a.functions.length, b.functions.length, sortDir);
        case "presentation": return compareValues(a.presentation?.title ?? "", b.presentation?.title ?? "", sortDir);
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
    if (!confirm(`Delete ${ids.length} print order${ids.length !== 1 ? "s" : ""}?`)) return;
    await deletePrintOrders(ids);
    setSelected(new Set());
    router.refresh();
  }

  async function handleBulkApply() {
    const ids = Array.from(selected);
    const updates: { status?: EntityStatus; substatus?: string | null; vendorId?: string; functionId?: string } = {};
    if (bulkStatus) updates.status = bulkStatus as EntityStatus;
    if (bulkStatus && bulkSubstatus) updates.substatus = bulkSubstatus;
    else if (bulkStatus) updates.substatus = null;
    if (bulkVendorId) updates.vendorId = bulkVendorId;
    if (bulkFunctionId) updates.functionId = bulkFunctionId;
    if (Object.keys(updates).length === 0) return;
    await bulkUpdatePrintOrders(ids, updates);
    setSelected(new Set());
    setShowBulkEdit(false);
    setBulkStatus("");
    setBulkSubstatus("");
    setBulkVendorId("");
    setBulkFunctionId("");
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
            {sorted.length}{sorted.length !== printOrders.length ? ` of ${printOrders.length}` : ""} print order{printOrders.length !== 1 ? "s" : ""}
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
        <Link
          href={`/events/${eventId}/print-orders/new`}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 shrink-0"
        >
          Create Print Order
        </Link>
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
          {functions.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Add Function Link</label>
              <select value={bulkFunctionId} onChange={(e) => setBulkFunctionId(e.target.value)} className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 dark:text-white">
                <option value="">— no change —</option>
                {functions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          )}
          <button onClick={handleBulkApply} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
            Apply
          </button>
        </div>
      )}

      {printOrders.length === 0 ? (
        <EmptyState message="No print orders yet. Create your first print order to get started." />
      ) : view === "list" ? (
        <div className="space-y-2">
          {sorted.map((po) => (
            <div
              key={po.id}
              className={`bg-white dark:bg-gray-800 shadow rounded-lg p-4 flex items-start gap-3 ${selected.has(po.id) ? "ring-2 ring-blue-200 dark:ring-blue-800" : ""}`}
            >
              <input type="checkbox" checked={selected.has(po.id)} onChange={() => toggleRow(po.id)} className="mt-1 h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/events/${eventId}/print-orders/${po.id}`}
                    className="text-gray-900 dark:text-white font-medium hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    {po.name}
                  </Link>
                  <WorkflowBadge summary={workflowSummaries[po.id]} />
                  <EntityStatusBadge status={po.status} substatus={po.substatus} />
                </div>
                <div className="mt-1 flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                  {po.items.length > 0 && (
                    <span>{po.items.length} item{po.items.length !== 1 ? "s" : ""}</span>
                  )}
                  {po.functions.length > 0 && (
                    <span className="text-green-600 dark:text-green-400">
                      {po.functions.length === 1
                        ? `Linked to function: ${po.functions[0].function.name}`
                        : `Linked to ${po.functions.length} functions`}
                    </span>
                  )}
                  {po.presentation && (
                    <span className="text-blue-600 dark:text-blue-400">
                      Linked to presentation: {po.presentation.title}
                    </span>
                  )}
                  {po.functions.length === 0 && !po.presentation && (
                    <span className="text-orange-600 dark:text-orange-400">Unlinked</span>
                  )}
                </div>
              </div>
              <InlineDeleteButton
                action={deletePrintOrder}
                hiddenInputs={{ printOrderId: po.id }}
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
                  <th className={`${thBase} w-8`}><input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="rounded" /></th>
                  <th className={thSortable} onClick={() => handleSort("name")}>Name{sortIndicator(sortField === "name", sortDir)}</th>
                  <th className={thSortable} onClick={() => handleSort("status")}>Status{sortIndicator(sortField === "status", sortDir)}</th>
                  <th className={thBase}>Workflow</th>
                  <th className={thSortable} onClick={() => handleSort("vendors")}>Vendor(s){sortIndicator(sortField === "vendors", sortDir)}</th>
                  <th className={thSortable} onClick={() => handleSort("items")}>Items{sortIndicator(sortField === "items", sortDir)}</th>
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
                        <Link href={`/events/${eventId}/print-orders/${o.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">{o.name}</Link>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap"><EntityStatusBadge status={o.status} substatus={o.substatus} /></td>
                      <td className="px-3 py-3 whitespace-nowrap"><WorkflowBadge summary={workflowSummaries[o.id]} /></td>
                      <td className="px-3 py-3 text-gray-600 dark:text-gray-400">{o.vendors.length > 0 ? o.vendors.map((v) => v.vendor.name).join(", ") : "—"}</td>
                      <td className="px-3 py-3 text-gray-600 dark:text-gray-400">{o.items.length > 0 ? o.items.length : "—"}</td>
                      <td className="px-3 py-3 text-gray-600 dark:text-gray-400">
                        {o.functions.length > 0
                          ? o.functions.length === 1
                            ? <Link href={`/events/${eventId}/functions/${o.functions[0].function.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">{o.functions[0].function.name}</Link>
                            : `${o.functions.length} functions`
                          : <span className="text-orange-500">Unlinked</span>}
                      </td>
                      <td className="px-3 py-3 text-gray-600 dark:text-gray-400">
                        {o.presentation
                          ? <Link href={`/events/${eventId}/presentations/${o.presentation.id}`} className="text-blue-600 dark:text-blue-400 hover:underline">{o.presentation.title}</Link>
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sorted.length === 0 && (
              <p className="text-center text-gray-500 dark:text-gray-400 py-8 text-sm">No print orders match the current filters.</p>
            )}
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            {sorted.length === printOrders.length
              ? `${printOrders.length} print order${printOrders.length !== 1 ? "s" : ""}`
              : `${sorted.length} of ${printOrders.length} print orders`}
          </p>
        </div>
      )}
    </div>
  );
}
