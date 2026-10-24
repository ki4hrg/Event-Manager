"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { btnPrimary, btnSecondary } from "@/lib/buttonStyles";
import { isUserError, type UserError } from "@/lib/userErrors";

const selectClass =
  "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm";
const cardClass = "bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6 space-y-4";
const muted = "text-gray-500 dark:text-gray-400";

export type BeoReview = {
  orderId: string | null;
  menu: string | null;
  notes: string | null;
  orders: { id: string; name: string; rows: { key: string; label: string; current: string; proposed: string; changed: boolean }[] }[];
};

// A BEO against the catering order it's for: each field it states, the
// order's value beside it; ticked ones are written. Changed fields start ticked.
export function InboxBeoReview({ review, apply, cancelHref }: { review: BeoReview; apply: (orderId: string, keys: string[]) => Promise<void | UserError>; cancelHref: string }) {
  const [orderId, setOrderId] = useState(review.orderId ?? "");
  const order = review.orders.find((o) => o.id === orderId);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(order?.rows.filter((r) => r.changed).map((r) => r.key) ?? []));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const pickOrder = (id: string) => {
    setOrderId(id);
    setPicked(new Set(review.orders.find((o) => o.id === id)?.rows.filter((r) => r.changed).map((r) => r.key) ?? []));
  };
  const toggle = (key: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  return (
    <div className={cardClass}>
      <div>
        <label htmlFor="beo-order" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Catering order *
        </label>
        <select id="beo-order" value={orderId} onChange={(e) => pickOrder(e.target.value)} className={selectClass}>
          <option value="">Select an order</option>
          {review.orders.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>
      {order &&
        (order.rows.length === 0 ? (
          <p className={`text-sm ${muted}`}>The BEO states none of the order&apos;s fields.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className={`text-left text-xs uppercase tracking-wide ${muted}`}>
                  <th className="py-1 pr-3 font-medium"></th>
                  <th className="py-1 pr-3 font-medium">Field</th>
                  <th className="py-1 pr-3 font-medium">Order</th>
                  <th className="py-1 font-medium">BEO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {order.rows.map((r) => (
                  <tr key={r.key}>
                    <td className="py-1.5 pr-3">
                      <input
                        type="checkbox"
                        aria-label={`Take ${r.label}`}
                        checked={picked.has(r.key)}
                        onChange={(e) => toggle(r.key, e.target.checked)}
                        className="rounded border-gray-300 dark:border-gray-600"
                      />
                    </td>
                    <td className="py-1.5 pr-3 text-gray-700 dark:text-gray-300">{r.label}</td>
                    <td className={`py-1.5 pr-3 ${muted}`}>{r.current}</td>
                    <td className={`py-1.5 ${r.changed ? "font-medium text-gray-900 dark:text-white" : muted}`}>{r.proposed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      {review.menu && (
        <p className="text-sm text-gray-700 dark:text-gray-300">
          <span className={muted}>Menu: </span>
          {review.menu}
        </p>
      )}
      {review.notes && <p className="text-sm text-amber-700 dark:text-amber-300">{review.notes}</p>}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!orderId || pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              try {
                const result = await apply(orderId, Array.from(picked));
                if (isUserError(result)) setError(result.error);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Couldn't apply");
              }
            })
          }
          className={`${btnPrimary} disabled:opacity-50`}
        >
          {pending ? "Applying..." : picked.size ? `Apply ${picked.size} and file the BEO` : "File the BEO on the order"}
        </button>
        <Link href={cancelHref} className={btnSecondary}>
          Cancel
        </Link>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
