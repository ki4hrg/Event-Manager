import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { formatEventDate } from "@/lib/agendaUtils";
import { formatBreakoutSessionName } from "@/lib/breakoutLabels";
import { resolveOptionLabel } from "@/lib/optionUtils";
import type { CustomOption } from "@prisma/client";
import { getEvent } from "@/app/events/event";
import { getOptions } from "@/app/settings/actions";
import {
  getImportSourceOptions,
  getDefaultSource,
  getImportableContent,
  importFromEvent,
} from "@/app/events/import/actions";
import { ImportClient } from "./ImportClient";
import { requirePermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Import" };

type Content = Awaited<ReturnType<typeof getImportableContent>>;

function toItems(content: Content, functionTypes: CustomOption[], presentationTypes: CustomOption[]) {
  return {
    functions: content.functions.map((f) => ({
      id: f.id,
      label: formatBreakoutSessionName(f.name, f.breakoutGroup?.name),
      sublabel: resolveOptionLabel(f.type, functionTypes) || null,
      alreadyPresent: f.alreadyPresent,
    })),
    presentations: content.presentations.map((p) => ({
      id: p.id,
      label: p.title,
      sublabel: p.track?.name ?? (resolveOptionLabel(p.type, presentationTypes) || null),
      alreadyPresent: p.alreadyPresent,
    })),
  };
}

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Import writes into this event; a VIEW-only user should not reach the picker.
  await requirePermission("EVENTS", "WRITE", id);
  const [event, sources, defaultSource, functionTypes, presentationTypes] = await Promise.all([
    getEvent(id),
    getImportSourceOptions(id),
    getDefaultSource(id),
    getOptions("function_type"),
    getOptions("presentation_type"),
  ]);
  if (!event) notFound();

  const initialSourceId = defaultSource?.id ?? sources[0]?.id ?? "";
  const content = initialSourceId
    ? toItems(await getImportableContent(initialSourceId, id), functionTypes, presentationTypes)
    : { functions: [], presentations: [] };

  const loadContent = async (sourceEventId: string) => {
    "use server";
    return toItems(await getImportableContent(sourceEventId, id), functionTypes, presentationTypes);
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
