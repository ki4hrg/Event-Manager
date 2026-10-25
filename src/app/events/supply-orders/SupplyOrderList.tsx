"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatFunctionLabel } from "@/lib/functionNumbers";
import type { getSupplyOrders } from "./actions";
import type { WorkflowBadgeSummary } from "@/lib/workflowProgress";
import { WorkflowBadge } from "@/components/WorkflowBadge";
import { EmptyState } from "@/components/EmptyState";
import { EntityStatusBadge } from "@/components/EntityStatusBadge";
import { InlineDeleteButton } from "@/components/InlineDeleteButton";
import { partyLabel } from "@/lib/partyLabel";
import { EDIT_STATUS_OPTIONS } from "@/lib/statusConstants";
import { PackingStatusRollup } from "@/components/PackingStatusRollup";
import { useCanWrite } from "@/components/PermissionsProvider";

type SupplyOrder = Awaited<ReturnType<typeof getSupplyOrders>>[number];

type Props = {
  supplyOrders: SupplyOrder[];
  eventId: string;
  workflowSummaries: Record<string, WorkflowBadgeSummary>;
  initialStatus?: string;
  initialRoom?: string;
  initialLinked?: string;
  deleteSupplyOrder: (formData: FormData) => Promise<void>;
};

export function SupplyOrderList({
  supplyOrders,
  eventId,
  workflowSummaries,
  initialStatus,
  initialRoom,
  initialLinked,
  deleteSupplyOrder,
}: Props) {
  // This list ships lean — no selection or bulk edit — so only the create link
  // needs gating; per-row delete gates itself inside InlineDeleteButton.
  const canWrite = useCanWrite("SUPPLY_ORDERS");
  const [statusFilter, setStatusFilter] = useState(initialStatus ?? "");
  const [roomFilter, setRoomFilter] = useState(initialRoom ?? "");
  const [linkedFilter, setLinkedFilter] = useState(initialLinked ?? "");

  const roomOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of supplyOrders) {
      if (o.room) map.set(o.room.id, o.room.name);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [supplyOrders]);

  const filtered = useMemo(() => {
    return supplyOrders.filter((o) => {
      if (statusFilter === "__blank__") {
        if (o.status != null) return false;
      } else if (statusFilter && o.status !== statusFilter) return false;
      if (roomFilter === "__blank__") {
        if (o.room != null) return false;
      } else if (roomFilter && o.room?.id !== roomFilter) return false;
      const hasLink = !!o.room || o.functions.length > 0 || o.presentations.length > 0;
      if (linkedFilter === "yes" && !hasLink) return false;
      if (linkedFilter === "none" && hasLink) return false;
      return true;
    });
  }, [supplyOrders, statusFilter, roomFilter, linkedFilter]);

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-y-2 mb-4">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {filtered.length}
            {filtered.length !== supplyOrders.length ? ` of ${supplyOrders.length}` : ""} supply order
            {supplyOrders.length !== 1 ? "s" : ""}
          </p>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-gray-500 dark:text-gray-400">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="">All</option>
              <option value="__blank__">(blank)</option>
              {EDIT_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-gray-500 dark:text-gray-400">Room:</span>
            <select
              value={roomFilter}
              onChange={(e) => setRoomFilter(e.target.value)}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="">All</option>
              <option value="__blank__">(no room)</option>
              {roomOptions.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-gray-500 dark:text-gray-400">Anchors:</span>
            <select
              value={linkedFilter}
              onChange={(e) => setLinkedFilter(e.target.value)}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="">All</option>
              <option value="yes">Linked (room/function/presentation)</option>
              <option value="none">Anchorless</option>
            </select>
          </div>
        </div>
        {canWrite && (
          <Link
            href={`/events/${eventId}/supply-orders/new`}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 shrink-0"
          >
            Create Supply Order
          </Link>
        )}
      </div>

      {supplyOrders.length === 0 ? (
        <EmptyState message="No supply orders yet. Create your first supply order to get started." />
      ) : filtered.length === 0 ? (
        <EmptyState message="No supply orders match the current filters." />
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => (
            <div
              key={o.id}
              className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 flex items-start gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link
                    href={`/events/${eventId}/supply-orders/${o.id}`}
                    className="text-gray-900 dark:text-white font-medium hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    {o.name}
                  </Link>
                  <WorkflowBadge summary={workflowSummaries[o.id]} />
                  <EntityStatusBadge status={o.status} substatus={o.substatus} />
                  <PackingStatusRollup items={o.items} />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                  <span>→ {o.room?.name ?? "No room"}</span>
                  {o.items.length > 0 && (
                    <span>{o.items.length} item{o.items.length !== 1 ? "s" : ""}</span>
                  )}
                  {o.functions.length > 0 && (
                    <span className="text-green-600 dark:text-green-400">
                      {o.functions.length === 1
                        ? `Linked to function: ${formatFunctionLabel(o.functions[0].function)}`
                        : `Linked to ${o.functions.length} functions`}
                    </span>
                  )}
                  {o.presentations.length > 0 && (
                    <span className="text-blue-600 dark:text-blue-400">
                      {o.presentations.length === 1
                        ? `Linked to presentation: ${o.presentations[0].presentation.title}`
                        : `Linked to ${o.presentations.length} presentations`}
                    </span>
                  )}
                  {partyLabel(o.providerVendor, o.providerContact) && (
                    <span>Provider: {partyLabel(o.providerVendor, o.providerContact)}</span>
                  )}
                </div>
              </div>
              <InlineDeleteButton
                resource="SUPPLY_ORDERS"
                action={deleteSupplyOrder}
                hiddenInputs={{ supplyOrderId: o.id }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
