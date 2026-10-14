import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Toast } from "@/components/Toast";
import { getOptions } from "@/app/settings/actions";
import { toDateInput } from "@/lib/esg/format";
import { SPEC_GRID_COLUMNS, type EsgFieldDef, type SpecGrid } from "@/lib/esg/fields";
import { PER_SECTIONS } from "@/lib/esg/perFields";
import { perDerivedBlocks } from "@/lib/esg/per";
import {
  createSpecificationRow,
  deleteSpecificationRow,
  getPostEventData,
  setPostEventSectionNa,
  updatePostEventSection,
  updateSpecificationRow,
} from "../../specifications/actions";
import { SpecSectionCard } from "../../specifications/SpecSectionCard";
import { SpecGridTable, type SpecGridRow } from "../../specifications/SpecGridTable";
import type { SpecChoices, SpecValue } from "../../specifications/SpecFieldInput";
import { EsgBlockView } from "../reports/esg/EsgBlocks";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Post-Event Report" };

function serialize(kind: string, value: unknown): SpecValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return kind === "date" ? toDateInput(value) : value.toISOString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

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
  const pe = data.postEvent as Record<string, unknown> | null;
  const narrative = (data.postEvent?.narrative as Record<string, unknown> | null) ?? {};
  const na = new Set(data.postEvent?.naSections ?? []);

  const choices: SpecChoices = {
    options: { per_facility_type: facilityTypes, per_housing_provider: housingProviders, per_av_setup: avSetups },
    vendors: [],
    contacts: [],
    functions: [],
  };
  const valuesFor = (fields: EsgFieldDef[]) =>
    Object.fromEntries(fields.map((f) => [f.key, serialize(f.kind, f.storage === "narrative" ? narrative[f.key] : pe?.[f.key])]));
  const gridRows = (grid: SpecGrid): SpecGridRow[] =>
    (data.narrative.grids[grid] as unknown as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      values: Object.fromEntries(SPEC_GRID_COLUMNS[grid].map((c) => [c.key, serialize(c.kind, row[c.key])])),
    }));
  const missingIn = (letter: string) => completeness.missing.filter((m) => m.section === letter).length;

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
            { label: "Post-Event Report" },
          ]}
        />
        <div className="flex flex-wrap items-baseline justify-between gap-2 mt-1">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Post-Event Report</h1>
          <Link href={`/events/${eventId}/reports/post-event`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
            View report
          </Link>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Required fields: {completeness.done} of {completeness.total}
        </p>
      </div>

      <div className="space-y-6">
        <nav
          aria-label="Post-event sections"
          className="sticky top-2 z-10 flex gap-1 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 p-2 text-sm"
        >
          {PER_SECTIONS.map((s) => (
            <a
              key={s.letter}
              href={`#spec-${s.letter.toLowerCase()}`}
              title={s.title}
              className={`shrink-0 rounded px-2.5 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 ${
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

        {PER_SECTIONS.map((section) => {
          const letter = section.letter;
          const saveAction = async (formData: FormData) => {
            "use server";
            await updatePostEventSection(eventId, letter, formData);
          };
          const setNa = async (value: boolean) => {
            "use server";
            await setPostEventSectionNa(eventId, letter, value);
          };
          const derivedBlocks = (section.derived ?? []).flatMap((d) =>
            perDerivedBlocks(data, d.source, d.label).map((b) => ({ label: d.label, block: b })),
          );
          return (
            <SpecSectionCard
              key={letter}
              letter={letter}
              title={section.title}
              fields={section.fields}
              values={valuesFor(section.fields)}
              timezone={event.timezone}
              choices={choices}
              na={na.has(letter)}
              missingCount={missingIn(letter)}
              saveAction={saveAction}
              setNa={setNa}
              derived={
                derivedBlocks.length > 0 ? (
                  <div className="space-y-4">
                    {derivedBlocks.map((d, i) => (
                      <div key={i}>
                        {d.block.kind !== "fields" && (
                          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">{d.label}</h3>
                        )}
                        <EsgBlockView block={d.block} />
                      </div>
                    ))}
                  </div>
                ) : undefined
              }
              grids={
                section.grids?.length ? (
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
                          timezone={event.timezone}
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
