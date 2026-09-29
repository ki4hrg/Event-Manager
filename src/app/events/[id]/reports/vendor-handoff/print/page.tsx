import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getEvent } from "@/app/events/actions";
import { getVendorHandoffData } from "@/app/events/reports/actions";
import { getOptions } from "@/app/settings/actions";
import { PrintHeader } from "@/components/print/PrintHeader";
import { VendorHandoffReport } from "../VendorHandoffReport";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Vendor handoff (print)" };

export default async function VendorHandoffPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vendorId?: string }>;
}) {
  const { id: eventId } = await params;
  const { vendorId } = await searchParams;

  if (!vendorId) notFound();

  const [event, data, functionTypes] = await Promise.all([
    getEvent(eventId),
    getVendorHandoffData(eventId, vendorId),
    getOptions("function_type"),
  ]);

  if (!event || !data) notFound();

  const backHref = `/events/${eventId}/reports/vendor-handoff?vendorId=${vendorId}`;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto print:p-0 print:max-w-none">
      <PrintHeader
        eventName={event.name}
        title={`Vendor Handoff — ${data.vendor.name}`}
        backHref={backHref}
      />
      <VendorHandoffReport data={data} event={event} functionTypes={functionTypes} />
    </div>
  );
}
