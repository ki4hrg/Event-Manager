import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getEvent } from "../../../actions";
import { importPresentationsFromCSV, type ColumnMapping } from "../../../presentations/actions";
import { ImportForm } from "./ImportForm";
import { requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Import presentations" };

export default async function ImportPresentationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;
  // CSV import is a bulk create; a VIEW-only user should not reach the form.
  await requirePermission("PRESENTATIONS", "WRITE", eventId);
  const event = await getEvent(eventId);

  if (!event) notFound();

  const importAction = async (
    rows: Record<string, string>[],
    mapping: ColumnMapping
  ) => {
    "use server";
    return importPresentationsFromCSV(eventId, rows, mapping);
  };

  return (
    <>
      <div className="mb-4">
        <Breadcrumbs
          items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${eventId}` },
            { label: "Presentations", href: `/events/${eventId}/presentations` },
            { label: "Import" },
          ]}
        />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">
          Import Presentations
        </h1>
      </div>
      <ImportForm eventId={eventId} importAction={importAction} />
    </>
  );

}
