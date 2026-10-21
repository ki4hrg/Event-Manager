import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOptions } from "@/app/settings/actions";
import { PER_SECTIONS } from "@/lib/esg/perFields";
import { perDerivedBlocks } from "@/lib/esg/per";
import { getPostEventData } from "../../specifications/actions";
import { SpecDocHeader } from "../../specifications/SpecDocHeader";
import { SpecProgressPanel } from "../../specifications/SpecProgressPanel";
import { SpecSectionNav } from "../../specifications/SpecSectionNav";
import { SpecSections } from "../../specifications/SpecSections";
import { serializeFields, serializeGridRows } from "../../specifications/serialize";
import type { SpecChoices } from "../../specifications/SpecFieldInput";
import { EsgBlockView } from "../reports/esg/EsgBlocks";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Post-Event Report" };

export default async function PostEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const [result, facilityTypes, housingProviders, avSetups] = await Promise.all([
    getPostEventData(eventId),
    getOptions("per_facility_type"),
    getOptions("per_housing_provider"),
    getOptions("per_av_setup"),
  ]);
  if (!result) notFound();
  const { data, completeness } = result;
  const { event } = data.narrative;
  const columns = data.postEvent as Record<string, unknown> | null;
  const narrative = (data.postEvent?.narrative as Record<string, unknown> | null) ?? {};
  const na = new Set(data.postEvent?.naSections ?? []);

  const choices: SpecChoices = {
    options: { per_facility_type: facilityTypes, per_housing_provider: housingProviders, per_av_setup: avSetups },
    vendors: [],
    contacts: [],
    functions: [],
  };
  const missingIn = (letter: string) => completeness.missing.filter((m) => m.section === letter).length;

  return (
    <>
      <SpecDocHeader eventId={eventId} eventName={event.name} doc="per" active="edit" />

      <div className="space-y-6">
        <SpecProgressPanel
          done={completeness.done}
          total={completeness.total}
          missing={completeness.missing}
          sectionTitles={Object.fromEntries(PER_SECTIONS.map((s) => [s.letter, s.title]))}
        />

        <SpecSectionNav sections={PER_SECTIONS} na={na} missingIn={missingIn} />

        <SpecSections
          eventId={eventId}
          doc="per"
          sections={PER_SECTIONS}
          valuesFor={(s) => serializeFields(s.fields, columns, narrative)}
          rowsFor={(grid) => serializeGridRows(grid, data.narrative.grids[grid])}
          derivedFor={(s) => {
            const blocks = (s.derived ?? []).flatMap((d) =>
              perDerivedBlocks(data, d.source, d.label).map((block) => ({ label: d.label, block })),
            );
            return blocks.length > 0 ? (
              <div className="space-y-4">
                {blocks.map((d, i) => (
                  <div key={i}>
                    {d.block.kind !== "fields" && (
                      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">{d.label}</h3>
                    )}
                    <EsgBlockView block={d.block} />
                  </div>
                ))}
              </div>
            ) : null;
          }}
          na={na}
          missingIn={missingIn}
          timezone={event.timezone}
          choices={choices}
        />
      </div>
    </>
  );
}
