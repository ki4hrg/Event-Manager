import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintHeader } from "@/components/print/PrintHeader";
import { getMediaDeliverables } from "@/app/events/media-deliverables/actions";
import { getEvent } from "../../../actions";
import { partyLabel } from "@/lib/partyLabel";
import { formatFunctionLabel } from "@/lib/functionNumbers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Media deliverables (print)" };

export default async function MediaDeliverablesPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;

  const [event, deliverables] = await Promise.all([getEvent(eventId), getMediaDeliverables(eventId)]);

  if (!event) notFound();

  return (
    <div className="max-w-4xl mx-auto px-8 py-8 bg-white print:px-0 print:py-0">
      <PrintHeader
        eventName={event.name}
        title="All Media Deliverables"
        backHref={`/events/${eventId}/media-deliverables`}
      />

      {deliverables.map((d, i) => {
        const provider = partyLabel(d.providerVendor, d.providerContact);
        return (
          <div
            key={d.id}
            className={i < deliverables.length - 1 ? "mb-10 pb-10 border-b-2 border-gray-300 print:break-after-page" : ""}
          >
            <h2 className="text-lg font-semibold text-gray-900 print:text-black mb-2">{d.name}</h2>

            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm text-gray-700 print:text-black mb-3">
              {d.mediaType && (
                <>
                  <dt className="font-medium">Media Type:</dt>
                  <dd>{d.mediaType}</dd>
                </>
              )}
              {provider && (
                <>
                  <dt className="font-medium">Provider:</dt>
                  <dd>{provider}</dd>
                </>
              )}
              {d.delivery && (
                <>
                  <dt className="font-medium">Delivery:</dt>
                  <dd>{d.delivery}</dd>
                </>
              )}
              {d.functions.length > 0 && (
                <>
                  <dt className="font-medium">Functions:</dt>
                  <dd>{d.functions.map((f) => formatFunctionLabel(f)).join(", ")}</dd>
                </>
              )}
              {d.presentations.length > 0 && (
                <>
                  <dt className="font-medium">Presentations:</dt>
                  <dd>{d.presentations.map((p) => p.title).join(", ")}</dd>
                </>
              )}
            </dl>

            {d.description && (
              <p className="text-sm text-gray-700 print:text-black mb-2 whitespace-pre-wrap">{d.description}</p>
            )}
            {d.notes && (
              <p className="text-sm text-gray-600 print:text-black mb-2 whitespace-pre-wrap italic">{d.notes}</p>
            )}

            {d.contacts.length > 0 && (
              <p className="text-sm text-gray-700 print:text-black">
                Contacts:{" "}
                {d.contacts
                  .map((c) => {
                    const name = `${c.contact.firstName} ${c.contact.lastName}`.trim();
                    return c.role ? `${name} (${c.role})` : name;
                  })
                  .join(", ")}
              </p>
            )}
          </div>
        );
      })}

      {deliverables.length === 0 && (
        <p className="text-gray-500">No media deliverables found for this event.</p>
      )}
    </div>
  );
}
