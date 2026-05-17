"use client";

import { useState } from "react";
import Link from "next/link";
import { OrderMeta, type OrderMetaFields } from "@/components/OrderMeta";

type PrintOrderSummary = OrderMetaFields & {
  id: string;
  name: string;
};

type FunctionModeProps = {
  mode: "function";
  printOrders: PrintOrderSummary[];
  eventId: string;
  availablePrintOrders: PrintOrderSummary[];
  newPrintOrderPath: string;
  linkPrintOrder: (printOrderId: string) => Promise<void>;
  unlinkPrintOrder: (printOrderId: string) => Promise<void>;
};

type PresentationModeProps = {
  mode?: "presentation";
  printOrder: PrintOrderSummary | null;
  eventId: string;
  availablePrintOrders: PrintOrderSummary[];
  newPrintOrderPath: string;
  linkPrintOrder: (printOrderId: string) => Promise<void>;
  unlinkPrintOrder: () => Promise<void>;
};

type Props = FunctionModeProps | PresentationModeProps;

function LinkForm({
  available,
  onLink,
  onCancel,
  newPath,
  label,
}: {
  available: PrintOrderSummary[];
  onLink: (id: string) => Promise<void>;
  onCancel: () => void;
  newPath: string;
  label: string;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [isLinking, setIsLinking] = useState(false);

  const handleLink = async () => {
    if (!selectedId) return;
    setIsLinking(true);
    try {
      await onLink(selectedId);
      setSelectedId("");
      onCancel();
    } finally {
      setIsLinking(false);
    }
  };

  return (
    <div className="space-y-3">
      {available.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No unlinked Print Orders available for this event.
        </p>
      ) : (
        <div className="flex gap-2">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select Print Order...</option>
            {available.map((po) => (
              <option key={po.id} value={po.id}>
                {po.name}
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
        <Link href={newPath} className="text-blue-600 dark:text-blue-400 hover:underline">
          {label}
        </Link>
        <button
          onClick={onCancel}
          className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function PrintOrderPanel(props: Props) {
  const [showLinkForm, setShowLinkForm] = useState(false);

  if (props.mode === "function") {
    const { printOrders, eventId, availablePrintOrders, newPrintOrderPath, linkPrintOrder, unlinkPrintOrder } = props;

    const handleUnlink = async (printOrderId: string) => {
      if (!confirm("Unlink this Print Order? The Print Order will not be deleted.")) return;
      await unlinkPrintOrder(printOrderId);
    };

    return (
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Print Orders</h2>

        {printOrders.length > 0 && (
          <div className="space-y-2 mb-4">
            {printOrders.map((po) => (
              <div
                key={po.id}
                className="flex items-start justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/events/${eventId}/print-orders/${po.id}`}
                    className="text-blue-600 dark:text-blue-400 hover:underline font-medium text-sm"
                  >
                    {po.name}
                  </Link>
                  <div className="mt-1">
                    <OrderMeta
                      status={po.status}
                      substatus={po.substatus}
                      vendors={po.vendors}
                      notes={po.notes}
                    />
                  </div>
                </div>
                <button
                  onClick={() => handleUnlink(po.id)}
                  className="text-red-600 hover:underline text-sm flex-shrink-0"
                >
                  Unlink
                </button>
              </div>
            ))}
          </div>
        )}

        {printOrders.length === 0 && !showLinkForm && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">No Print Orders linked.</p>
        )}

        {showLinkForm ? (
          <LinkForm
            available={availablePrintOrders}
            onLink={linkPrintOrder}
            onCancel={() => setShowLinkForm(false)}
            newPath={newPrintOrderPath}
            label="Create new Print Order"
          />
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowLinkForm(true)}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
            >
              Link Existing
            </button>
            <Link
              href={newPrintOrderPath}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Create New
            </Link>
          </div>
        )}
      </div>
    );
  }

  // Presentation mode (single print order)
  const { printOrder, eventId, availablePrintOrders, newPrintOrderPath, linkPrintOrder, unlinkPrintOrder } = props;

  const handleUnlink = async () => {
    if (!confirm("Unlink this Print Order? The Print Order will not be deleted.")) return;
    await (unlinkPrintOrder as () => Promise<void>)();
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
      <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Print Order</h2>

      {printOrder ? (
        <div className="flex items-start justify-between gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <div className="min-w-0 flex-1">
            <Link
              href={`/events/${eventId}/print-orders/${printOrder.id}`}
              className="text-blue-600 dark:text-blue-400 hover:underline font-medium text-sm"
            >
              {printOrder.name}
            </Link>
            <div className="mt-1">
              <OrderMeta
                status={printOrder.status}
                substatus={printOrder.substatus}
                vendors={printOrder.vendors}
                notes={printOrder.notes}
              />
            </div>
          </div>
          <button
            onClick={handleUnlink}
            className="text-red-600 hover:underline text-sm flex-shrink-0"
          >
            Unlink
          </button>
        </div>
      ) : (
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">No Print Order linked.</p>

          {showLinkForm ? (
            <LinkForm
              available={availablePrintOrders}
              onLink={linkPrintOrder}
              onCancel={() => setShowLinkForm(false)}
              newPath={newPrintOrderPath}
              label="Create new Print Order"
            />
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowLinkForm(true)}
                className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
              >
                Link Existing
              </button>
              <Link
                href={newPrintOrderPath}
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
