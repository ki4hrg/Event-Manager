import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintHeader } from "@/components/print/PrintHeader";
import { getMediaOrders, getMediaOrder } from "@/app/events/media-orders/actions";
import { getEvent } from "../../../actions";
import { getMediaOrderVendors } from "@/app/vendors/actions";
import { formatMediaOrderProvidedBy } from "@/lib/mediaOrderProvidedBy";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Media orders (print)" };

export default async function MediaOrdersPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;

  const [event, orderList] = await Promise.all([
    getEvent(eventId),
    getMediaOrders(eventId),
  ]);

  if (!event) notFound();

  const records = await Promise.all(
    orderList.map(async (o) => {
      const [order, vendors] = await Promise.all([
        getMediaOrder(o.id),
        getMediaOrderVendors(o.id, eventId),
      ]);
      return { order, vendors };
    })
  );

  return (
    <div className="max-w-4xl mx-auto px-8 py-8 bg-white print:px-0 print:py-0">
      <PrintHeader
        eventName={event.name}
        title="All Media Orders"
        backHref={`/events/${eventId}/media-orders`}
      />

      {records.map(({ order, vendors }, i) => {
        if (!order) return null;
        return (
          <div
            key={order.id}
            className={i < records.length - 1 ? "mb-12 pb-12 border-b-2 border-gray-300 print:break-after-page" : ""}
          >
            <h2 className="text-lg font-semibold text-gray-900 print:text-black mb-2">{order.name}</h2>
            {order.notes && <p className="text-sm text-gray-700 print:text-black mb-3 whitespace-pre-wrap">{order.notes}</p>}

            {(order.functions.length > 0 || order.presentations.length > 0) && (
              <p className="text-sm text-gray-700 print:text-black mb-3">
                {order.functions.length > 0 && (
                  <span>Functions: {order.functions.map((f) => f.name).join(", ")}</span>
                )}
                {order.functions.length > 0 && order.presentations.length > 0 && <span> · </span>}
                {order.presentations.length > 0 && (
                  <span>Presentations: {order.presentations.map((p) => p.title).join(", ")}</span>
                )}
              </p>
            )}

            {(vendors.length > 0 || order.contacts.length > 0) && (
              <p className="text-sm text-gray-700 print:text-black mb-3">
                Provided by: {formatMediaOrderProvidedBy(vendors, order.contacts).join(", ")}
              </p>
            )}

            {order.items.length === 0 ? (
              <p className="text-sm text-gray-500">No items.</p>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray-300">
                    <th className="text-left py-2 pr-3 font-medium text-gray-700 print:text-black">Item</th>
                    <th className="text-left py-2 pr-3 font-medium text-gray-700 print:text-black">Delivery</th>
                    <th className="text-left py-2 font-medium text-gray-700 print:text-black">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id} className="border-b border-gray-200">
                      <td className="py-2 pr-3 align-top">{item.description}</td>
                      <td className="py-2 pr-3 align-top">{item.delivery ?? ""}</td>
                      <td className="py-2 align-top">{item.notes ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}

      {records.length === 0 && (
        <p className="text-gray-500">No media orders found for this event.</p>
      )}
    </div>
  );
}
