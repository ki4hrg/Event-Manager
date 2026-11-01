import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { compareFunctionNumbers, formatFunctionLabel } from "@/lib/functionNumbers";
import { formatDateOnly } from "@/lib/esg/format";
import { ESG_HEADER_FIELDS, ESG_SECTIONS } from "@/lib/esg/fields";
import {
  getEventSpecification,
  issueEsg,
  unlockFunctionNumbers,
  updateSpecificationSection,
} from "../../specifications/actions";
import { SpecDocHeader } from "../../specifications/SpecDocHeader";
import { SpecSectionCard } from "../../specifications/SpecSectionCard";
import { SpecSectionNav } from "../../specifications/SpecSectionNav";
import { SpecSections } from "../../specifications/SpecSections";
import { SpecDerivedBlock } from "../../specifications/SpecDerived";
import { IssueEsgPanel } from "../../specifications/IssueEsgPanel";
import { serializeFields, serializeGridRows } from "../../specifications/serialize";
import type { SpecChoices } from "../../specifications/SpecFieldInput";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Event Specifications" };

export default async function SpecificationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const data = await getEventSpecification(eventId);
  if (!data) notFound();
  // The entry form shows what the event stores; organization defaults are
  // passed separately so the card can label them and leave the inputs blank.
  const { event, spec, storedNarrative: narrative } = data;
  const columns = spec as Record<string, unknown> | null;

  const choices: SpecChoices = {
    options: data.options,
    vendors: data.eventVendors
      .map((v) => ({ id: v.id, label: v.name }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    contacts: Array.from(new Map(data.keyStaff.map((k) => [k.contact.id, k])).values()).map((k) => ({
      id: k.contact.id,
      label: [`${k.contact.firstName} ${k.contact.lastName}`, k.title].filter(Boolean).join(" · "),
    })),
    functions: [...data.functions]
      .sort((a, b) => compareFunctionNumbers(a.functionNumber, b.functionNumber) || a.name.localeCompare(b.name))
      .map((f) => ({ id: f.id, label: formatFunctionLabel(f) })),
  };

  const na = new Set(spec?.naSections ?? []);
  const missingIn = (letter: string) => data.completeness.missing.filter((m) => m.section === letter).length;

  const issueAction = async () => {
    "use server";
    await issueEsg(eventId);
  };
  const unlockAction = async () => {
    "use server";
    await unlockFunctionNumbers(eventId);
  };
  const saveHeader = async (formData: FormData) => {
    "use server";
    return updateSpecificationSection(eventId, "header", formData);
  };

  return (
    <>
      <SpecDocHeader eventId={eventId} eventName={event.name} doc="esg" active="edit" />

      <div className="space-y-6">
        <IssueEsgPanel
          done={data.completeness.done}
          total={data.completeness.total}
          missing={data.completeness.missing}
          sectionTitles={{ "": "Document", ...Object.fromEntries(ESG_SECTIONS.map((s) => [s.letter, s.title])) }}
          originated={formatDateOnly(spec?.dateOriginated)}
          revised={formatDateOnly(spec?.dateRevised)}
          numbersLocked={event.functionNumbersLockedAt !== null}
          issue={issueAction}
          unlock={unlockAction}
        />

        <SpecSectionNav sections={ESG_SECTIONS} na={na} missingIn={missingIn} />

        <SpecSectionCard
          letter="header"
          title="Document"
          fields={ESG_HEADER_FIELDS}
          values={serializeFields(ESG_HEADER_FIELDS, columns, narrative)}
          timezone={event.timezone}
          choices={choices}
          na={false}
          missingCount={missingIn("")}
          saveAction={saveHeader}
        />

        <SpecSections
          eventId={eventId}
          doc="esg"
          sections={ESG_SECTIONS}
          valuesFor={(s) => serializeFields(s.fields, columns, narrative)}
          rowsFor={(grid) => serializeGridRows(grid, data.grids[grid])}
          derivedFor={(s) =>
            s.derived?.length ? (
              <div className="space-y-4">
                {s.derived.map((d) => (
                  <SpecDerivedBlock key={d.source} def={d} data={data} />
                ))}
              </div>
            ) : null
          }
          inherited={data.inheritedNarrative}
          na={na}
          missingIn={missingIn}
          timezone={event.timezone}
          choices={choices}
        />
      </div>
    </>
  );
}
