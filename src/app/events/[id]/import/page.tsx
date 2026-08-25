import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { formatEventDate } from "@/lib/agendaUtils";
import { formatBreakoutSessionName } from "@/lib/breakoutLabels";
import { getEvent } from "@/app/events/actions";
import {
  getImportSourceOptions,
  getDefaultSource,
  getImportableContent,
  importFromEvent,
} from "@/app/events/import/actions";
import { ImportClient } from "./ImportClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Import" };

type Content = Awaited<ReturnType<typeof getImportableContent>>;

function toItems(content: Content) {
  return {
    functions: content.functions.map((f) => ({
      id: f.id,
      label: formatBreakoutSessionName(f.name, f.breakoutGroup?.name),
      sublabel: f.type || null,
      alreadyPresent: f.alreadyPresent,
    })),
    presentations: content.presentations.map((p) => ({
      id: p.id,
      label: p.title,
      sublabel: p.track?.name ?? p.type ?? null,
      alreadyPresent: p.alreadyPresent,
    })),
  };
}

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [event, sources, defaultSource] = await Promise.all([
    getEvent(id),
    getImportSourceOptions(id),
    getDefaultSource(id),
  ]);
  if (!event) notFound();

  const initialSourceId = defaultSource?.id ?? sources[0]?.id ?? "";
  const content = initialSourceId
    ? toItems(await getImportableContent(initialSourceId, id))
    : { functions: [], presentations: [] };

  const loadContent = async (sourceEventId: string) => {
    "use server";
    return toItems(await getImportableContent(sourceEventId, id));
  };

  const runImport = async (args: {
    sourceEventId: string;
    functionIds: string[];
    presentationIds: string[];
    includeSchedules: boolean;
    includeContacts: boolean;
    includeVendors: boolean;
    includeKeyStaff: boolean;
    includeStatusDefaults: boolean;
  }) => {
    "use server";
    return importFromEvent(id, args);
  };

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Events", href: "/events" },
          { label: event.name, href: `/events/${id}` },
          { label: "Import" },
        ]}
        title="Import from a previous event"
      />

      {sources.length === 0 ? (
        <EmptyState message="There's no other event to import from yet." />
      ) : (
        <ImportClient
          eventId={id}
          sources={sources.map((s) => ({
            id: s.id,
            label: `${s.name} · ${formatEventDate(s.startDate, s.timezone, { year: "numeric" })}${
              s.series ? ` · ${s.series.name}` : ""
            }`,
          }))}
          initialSourceId={initialSourceId}
          functions={content.functions}
          presentations={content.presentations}
          loadContent={loadContent}
          runImport={runImport}
        />
      )}
    </>
  );
}
