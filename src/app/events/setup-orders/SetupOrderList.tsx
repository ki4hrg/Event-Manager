"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CustomOption, EntityStatus } from "@prisma/client";
import type { getSetupOrders } from "./actions";
import type { WorkflowBadgeSummary } from "@/app/events/workflows/actions";
import { WorkflowBadge } from "@/components/WorkflowBadge";
import { EntityStatusBadge } from "@/components/EntityStatusBadge";
import { ViewToggle } from "@/components/ui/ViewToggle";
import { InlineDeleteButton } from "@/components/InlineDeleteButton";
import { compareValues, sortIndicator, type SortDir } from "@/lib/tableSort";
import { EDIT_STATUS_OPTIONS } from "@/lib/statusConstants";
import { getSetupOrderDisplayName } from "./utils";

type SetupOrder = Awaited<ReturnType<typeof getSetupOrders>>[number];

type Props = {
  setupOrders: SetupOrder[];
  eventId: string;
  workflowSummaries: Record<string, WorkflowBadgeSummary>;
  substatuses: CustomOption[];
  vendors: { id: string; name: string }[];
  deleteSetupOrder: (formData: FormData) => Promise<void>;
  deleteSetupOrders: (ids: string[]) => Promise<void>;
  bulkUpdateSetupOrders: (ids: string[], updates: { status?: EntityStatus; substatus?: string | null; vendorId?: string }) => Promise<void>;
};

type SortField = "name" | "status" | "vendors" | "type" | "room" | "tables" | "equipment" | "functions";
type FilterState = { name: string; status: string };
const DEFAULT_FILTERS: FilterState = { name: "", status: "" };

export function SetupOrderList({
  setupOrders,
  eventId,
  workflowSummaries,
  substatuses,
  vendors,
  deleteSetupOrder,
  deleteSetupOrders,
  bulkUpdateSetupOrders,
}: Props) {
  const router = useRouter();
  const [view, setView] = useState<"list" | "table">("list");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<EntityStatus | "">("");
  const [bulkSubstatus, setBulkSubstatus] = useState("");
  const [bulkVendorId, setBulkVendorId] = useState("");

  function setFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  const filtered = useMemo(() => {
    return setupOrders.filter((o) => {
      const displayName = getSetupOrderDisplayName(o);
      if (filters.name && !displayName.toLowerCase().includes(filters.name.toLowerCase())) return false;
      if (filters.status && o.status !== filters.status) return false;
      return true;
    });
  }, [setupOrders, filters]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      switch (sortField) {
        case "name": return compareValues(getSetupOrderDisplayName(a), getSetupOrderDisplayName(b), sortDir);
        case "status": return compareValues(a.status, b.status, sortDir);
        case "vendors": return compareValues(a.vendors.map((v) => v.vendor.name).join(", "), b.vendors.map((v) => v.vendor.name).join(", "), sortDir);
        case "type": return compareValues(a.setupType ?? "", b.setupType ?? "", sortDir);
        case "room": return compareValues(a.room?.name ?? "", b.room?.name ?? "", sortDir);
        case "tables": return compareValues(a.tables.length, b.tables.length, sortDir);
        case "equipment": return compareValues(a.equipmentItems.length, b.equipmentItems.length, sortDir);
        case "functions": return compareValues(a.functions.length, b.functions.length, sortDir);
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
    if (!confirm(`Delete ${ids.length} setup order${ids.length !== 1 ? "s" : ""}?`)) return;
    await deleteSetupOrders(ids);
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
    await bulkUpdateSetupOrders(ids, updates);
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
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {setupOrders.length} setup order{setupOrders.length !== 1 ? "s" : ""}
          </p>
          <ViewToggle view={view} onChange={setView} />
        </div>
        <div className="flex gap-2">
          <a
            href={`/events/${eventId}/setup-orders/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Print All
          </a>
          <Link
            href={`/events/${eventId}/setup-orders/new`}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Create Setup Order
          </Link>
        </div>
      </div>

      {setupOrders.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            No setup orders yet. Create your first setup order to get started.
          </p>
        </div>
      ) : view === "list" ? (
        <div className="space-y-2">
          {setupOrders.map((so) => {
            const displayName = getSetupOrderDisplayName(so);
            return (
              <div
                key={so.id}
                className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/events/${eventId}/setup-orders/${so.id}`}
                      className="text-gray-900 dark:text-white font-medium hover:text-blue-600 dark:hover:text-blue-400"
                    >
                      {displayName}
                    </Link>
                    <WorkflowBadge summary={workflowSummaries[so.id]} />
                    <EntityStatusBadge status={so.status} substatus={so.substatus} />
                  </div>
                  <div className="mt-1 flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                    {so.setupType && <span>{so.setupType}</span>}
                    {so.tables.length > 0 && (
                      <span>{so.tables.length} table row{so.tables.length !== 1 ? "s" : ""}</span>
                    )}
                    {so.equipmentItems.length > 0 && (
                      <span>{so.equipmentItems.length} equipment item{so.equipmentItems.length !== 1 ? "s" : ""}</span>
                    )}
                  </div>
                </div>
                <InlineDeleteButton
                  action={deleteSetupOrder}
                  hiddenInputs={{ setupOrderId: so.id }}
                  confirmMessage="Delete this Setup Order?"
                />
              </div>
            );
          })}
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
                  <th className={thSortable} onClick={() => handleSort("type")}>Type{sortIndicator(sortField === "type", sortDir)}</th>
                  <th className={thSortable} onClick={() => handleSort("room")}>Room{sortIndicator(sortField === "room", sortDir)}</th>
                  <th className={thSortable} onClick={() => handleSort("tables")}>Tables{sortIndicator(sortField === "tables", sortDir)}</th>
                  <th className={thSortable} onClick={() => handleSort("equipment")}>Equipment{sortIndicator(sortField === "equipment", sortDir)}</th>
                  <th className={thSortable} onClick={() => handleSort("functions")}>Functions{sortIndicator(sortField === "functions", sortDir)}</th>
                </tr>
                <tr>
                  <td className={filterCell} />
                  <td className={filterCell}>
                    <input type="text" placeholder="Filter…" value={filters.name} onChange={(e) => setFilter("name", e.target.value)} className={filterInput} />
                  </td>
                  <td className={filterCell}>
                    <select value={filters.status} onChange={(e) => setFilter("status", e.target.value)} className={filterInput}>
                      <option value="">All</option>
                      {EDIT_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                  <td className={filterCell} />
                  <td className={filterCell} />
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
                  const displayName = getSetupOrderDisplayName(o);
                  return (
                    <tr key={o.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}>
                      <td className="px-3 py-3 w-8"><input type="checkbox" checked={isSelected} onChange={() => toggleRow(o.id)} className="rounded" /></td>
                      <td className="px-3 py-3 font-medium">
                        <Link href={`/events/${eventId}/setup-orders/${o.id}`} className="text-blue-600 hover:underline">{displayName}</Link>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap"><EntityStatusBadge status={o.status} substatus={o.substatus} /></td>
                      <td className="px-3 py-3 whitespace-nowrap"><WorkflowBadge summary={workflowSummaries[o.id]} /></td>
                      <td className="px-3 py-3 text-gray-600 dark:text-gray-400">{o.vendors.length > 0 ? o.vendors.map((v) => v.vendor.name).join(", ") : "—"}</td>
                      <td className="px-3 py-3 text-gray-600 dark:text-gray-400">{o.setupType || "—"}</td>
                      <td className="px-3 py-3 text-gray-600 dark:text-gray-400">
                        {o.room
                          ? <Link href={`/events/${eventId}/rooms/${o.room.id}`} className="text-blue-600 hover:underline">{o.room.name}</Link>
                          : "—"}
                      </td>
                      <td className="px-3 py-3 text-gray-600 dark:text-gray-400">{o.tables.length > 0 ? o.tables.length : "—"}</td>
                      <td className="px-3 py-3 text-gray-600 dark:text-gray-400">{o.equipmentItems.length > 0 ? o.equipmentItems.length : "—"}</td>
                      <td className="px-3 py-3 text-gray-600 dark:text-gray-400">
                        {o.functions.length > 0
                          ? o.functions.length === 1
                            ? <Link href={`/events/${eventId}/functions/${o.functions[0].id}`} className="text-blue-600 hover:underline">{o.functions[0].name}</Link>
                            : `${o.functions.length} functions`
                          : <span className="text-orange-500">Unlinked</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sorted.length === 0 && (
              <p className="text-center text-gray-500 dark:text-gray-400 py-8 text-sm">No setup orders match the current filters.</p>
            )}
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            {sorted.length === setupOrders.length
              ? `${setupOrders.length} setup order${setupOrders.length !== 1 ? "s" : ""}`
              : `${sorted.length} of ${setupOrders.length} setup orders`}
          </p>
        </div>
      )}
    </div>
  );
}
