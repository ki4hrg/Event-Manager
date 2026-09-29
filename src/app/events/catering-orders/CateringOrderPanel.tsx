"use client";

import { useState } from "react";
import Link from "next/link";
import type { CateringOrder } from "@prisma/client";
import { OrderMeta } from "@/components/OrderMeta";
import { useCanWrite } from "@/components/PermissionsProvider";

type CateringOrderWithVendors = CateringOrder & {
  vendors?: { vendor: { name: string } }[];
};

function guestCountField(o: CateringOrderWithVendors): { label: string; value: number } | null {
  if (o.confirmedCount != null) return { label: "Confirmed", value: o.confirmedCount };
  if (o.guaranteeCount != null) return { label: "Guarantee", value: o.guaranteeCount };
  if (o.expectedCount != null) return { label: "Expected", value: o.expectedCount };
  return null;
}

type CateringOrderPanelProps = {
  cateringOrder: CateringOrderWithVendors | null;
  eventId: string;
  availableCateringOrders: CateringOrder[];
  newCateringOrderPath: string;
  linkCateringOrder: (cateringOrderId: string) => Promise<void>;
  unlinkCateringOrder: () => Promise<void>;
};

export function CateringOrderPanel({
  cateringOrder,
  eventId,
  availableCateringOrders,
  newCateringOrderPath,
  linkCateringOrder,
  unlinkCateringOrder,
}: CateringOrderPanelProps) {
  const canWrite = useCanWrite("CATERING_ORDERS");
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [isLinking, setIsLinking] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);

  const handleLink = async () => {
    if (!selectedId) return;
    setIsLinking(true);
    try {
      await linkCateringOrder(selectedId);
      setShowLinkForm(false);
      setSelectedId("");
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlink = async () => {
    if (!confirm("Unlink this Catering Order? The order will not be deleted.")) return;
    setIsUnlinking(true);
    try {
      await unlinkCateringOrder();
    } finally {
      setIsUnlinking(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 flex-1 flex flex-col">
      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
        Catering Order
      </h2>

      {cateringOrder ? (
        <div className="flex items-start justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <div className="min-w-0 flex-1">
            <Link
              href={`/events/${eventId}/catering-orders/${cateringOrder.id}`}
              className="text-blue-600 dark:text-blue-400 hover:underline font-medium text-sm"
            >
              {cateringOrder.name}
            </Link>
            <div className="mt-1">
              <OrderMeta
                status={cateringOrder.status}
                substatus={cateringOrder.substatus}
                vendors={cateringOrder.vendors}
                fields={[
                  { label: "Service", value: cateringOrder.serviceStyle },
                  guestCountField(cateringOrder),
                ]}
                notes={cateringOrder.notes}
              />
            </div>
          </div>
          {canWrite && (
            <button
              onClick={handleUnlink}
              disabled={isUnlinking}
              className="text-red-600 hover:underline text-sm disabled:opacity-50 flex-shrink-0"
            >
              Unlink
            </button>
          )}
        </div>
      ) : (
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            No Catering Order linked.
          </p>

          {!canWrite ? null : showLinkForm ? (
            <div className="space-y-3">
              {availableCateringOrders.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No unlinked Catering Orders available for this event.
                </p>
              ) : (
                <div className="flex gap-2">
                  <select
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                    className="flex-1 min-w-0 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Catering Order...</option>
                    {availableCateringOrders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleLink}
                    disabled={!selectedId || isLinking}
                    className="px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isLinking ? "Linking..." : "Link"}
                  </button>
                </div>
              )}
              <div className="flex items-center gap-3 text-sm">
                <Link href={newCateringOrderPath} className="text-blue-600 dark:text-blue-400 hover:underline">
                  Create new Catering Order
                </Link>
                <button
                  onClick={() => setShowLinkForm(false)}
                  className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowLinkForm(true)}
                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
              >
                Link Existing
              </button>
              <Link
                href={newCateringOrderPath}
                className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Create New
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
