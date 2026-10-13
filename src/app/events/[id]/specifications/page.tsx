import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Toast } from "@/components/Toast";
import { compareFunctionNumbers, formatFunctionLabel } from "@/lib/functionNumbers";
import { formatDateOnly, toDateInput } from "@/lib/esg/format";
import {
  ESG_HEADER_FIELDS,
  ESG_SECTIONS,
  SPEC_GRID_COLUMNS,
  type EsgFieldDef,
  type SpecGrid,
} from "@/lib/esg/fields";
import {
  createSpecificationRow,
  deleteSpecificationRow,
  getEventSpecification,
  issueEsg,
  setSpecificationSectionNa,
  unlockFunctionNumbers,
  updateSpecificationRow,
  updateSpecificationSection,
} from "../../specifications/actions";
import { SpecSectionCard } from "../../specifications/SpecSectionCard";
import { SpecGridTable, type SpecGridRow } from "../../specifications/SpecGridTable";
import { SpecDerivedBlock } from "../../specifications/SpecDerived";
import { IssueEsgPanel } from "../../specifications/IssueEsgPanel";
import type { SpecChoices, SpecValue } from "../../specifications/SpecFieldInput";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Specifications" };

function serialize(kind: EsgFieldDef["kind"] | string, value: unknown): SpecValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return kind === "date" ? toDateInput(value) : value.toISOString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

export default async function SpecificationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const data = await getEventSpecification(eventId);
  if (!data) notFound();
  // The edit form shows what the event stores; organization defaults are
  // passed separately so the card can label them and leave the inputs blank.
  const { event, spec, storedNarrative: narrative } = data;
  const tz = event.timezone;

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

  const valuesFor = (fields: EsgFieldDef[]) => {
    const values: Record<string, SpecValue> = {};
    for (const f of fields) {
      const raw = f.storage === "narrative" ? narrative[f.key] : (spec as Record<string, unknown> | null)?.[f.key];
      values[f.key] = serialize(f.kind, raw);
    }
    return values;
  };

  const gridRows = (grid: SpecGrid): SpecGridRow[] =>
    (data.grids[grid] as unknown as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      values: Object.fromEntries(SPEC_GRID_COLUMNS[grid].map((c) => [c.key, serialize(c.kind, row[c.key])])),
    }));

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
    await updateSpecificationSection(eventId, "header", formData);
  };

  return (
    <>
      <Suspense fallback={null}>
        <Toast />
      </Suspense>
      <div className="mb-6">
        <Breadcrumbs
          items={[
            { label: "Events", href: "/events" },
            { label: event.name, href: `/events/${eventId}` },
            { label: "Specifications" },
          ]}
        />
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mt-1">Event Specifications</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Part I (Narrative) of the APEX Event Specifications Guide. Function schedule and set-up orders come from the
          event&apos;s functions and orders.
        </p>
      </div>

      <div className="space-y-6">
        <IssueEsgPanel
          done={data.completeness.done}
          total={data.completeness.total}
          missing={data.completeness.missing}
          originated={formatDateOnly(spec?.dateOriginated)}
          revised={formatDateOnly(spec?.dateRevised)}
          numbersLocked={event.functionNumbersLockedAt !== null}
          reportHref={`/events/${eventId}/reports/esg`}
          issue={issueAction}
          unlock={unlockAction}
        />

        <nav
          aria-label="ESG sections"
          className="sticky top-2 z-10 flex gap-1 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 p-2 text-sm"
        >
          {ESG_SECTIONS.map((s) => (
            <a
              key={s.letter}
              href={`#spec-${s.letter.toLowerCase()}`}
              title={s.title}
              className={`shrink-0 rounded px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 ${
                na.has(s.letter)
                  ? "text-gray-400 dark:text-gray-500"
                  : missingIn(s.letter) > 0
                    ? "text-amber-700 dark:text-amber-300 font-medium"
                    : "text-gray-700 dark:text-gray-300"
              }`}
            >
              {s.letter}
            </a>
          ))}
        </nav>

        <SpecSectionCard
          letter="header"
          title="Document"
          fields={ESG_HEADER_FIELDS}
          values={valuesFor(ESG_HEADER_FIELDS)}
          timezone={tz}
          choices={choices}
          na={false}
          missingCount={missingIn("")}
          saveAction={saveHeader}
        />

        {ESG_SECTIONS.map((section) => {
          const letter = section.letter;
          const saveAction = async (formData: FormData) => {
            "use server";
            await updateSpecificationSection(eventId, letter, formData);
          };
          const setNa = async (value: boolean) => {
            "use server";
            await setSpecificationSectionNa(eventId, letter, value);
          };
          return (
            <SpecSectionCard
              key={letter}
              letter={letter}
              title={section.title}
              fields={section.fields}
              values={valuesFor(section.fields)}
              inherited={data.inheritedNarrative}
              timezone={tz}
              choices={choices}
              na={na.has(letter)}
              missingCount={missingIn(letter)}
              saveAction={saveAction}
              setNa={setNa}
              derived={
                section.derived && section.derived.length > 0 ? (
                  <div className="space-y-4">
                    {section.derived.map((d) => (
                      <SpecDerivedBlock key={d.source} def={d} data={data} />
                    ))}
                  </div>
                ) : undefined
              }
              grids={
                section.grids && section.grids.length > 0 ? (
                  <div className="space-y-6">
                    {section.grids.map((g) => {
                      const grid = g.grid;
                      const createRow = async (formData: FormData) => {
                        "use server";
                        await createSpecificationRow(eventId, grid, formData);
                      };
                      const updateRow = async (rowId: string, formData: FormData) => {
                        "use server";
                        await updateSpecificationRow(eventId, grid, rowId, formData);
                      };
                      const deleteRow = async (rowId: string) => {
                        "use server";
                        await deleteSpecificationRow(eventId, grid, rowId);
                      };
                      return (
                        <SpecGridTable
                          key={grid}
                          label={g.label}
                          required={g.required}
                          columns={SPEC_GRID_COLUMNS[grid]}
                          rows={gridRows(grid)}
                          timezone={tz}
                          choices={choices}
                          createRow={createRow}
                          updateRow={updateRow}
                          deleteRow={deleteRow}
                        />
                      );
                    })}
                  </div>
                ) : undefined
              }
            />
          );
        })}
      </div>
    </>
  );
}
