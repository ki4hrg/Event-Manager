import type { ReactNode } from "react";
import { SPEC_GRID_COLUMNS, type EsgSectionDef, type SpecGrid } from "@/lib/esg/fields";
import type { InheritedValue } from "@/lib/esg/narrativeData";
import {
  createSpecificationRow,
  deleteSpecificationRow,
  setPostEventSectionNa,
  setSpecificationSectionNa,
  updatePostEventSection,
  updateSpecificationRow,
  updateSpecificationSection,
} from "./actions";
import { SpecSectionCard } from "./SpecSectionCard";
import { SpecGridTable, type SpecGridRow } from "./SpecGridTable";
import type { SpecChoices, SpecValue } from "./SpecFieldInput";
import type { SpecDoc } from "./SpecDocHeader";

// The entry cards for every section of one document (ESG Part I or the PER),
// with each card's and grid's Server Actions bound to the event.
export function SpecSections<D extends string>({
  eventId,
  doc,
  sections,
  valuesFor,
  rowsFor,
  derivedFor,
  inherited,
  na,
  missingIn,
  timezone,
  choices,
}: {
  eventId: string;
  doc: SpecDoc;
  sections: EsgSectionDef<D>[];
  valuesFor: (section: EsgSectionDef<D>) => Record<string, SpecValue>;
  rowsFor: (grid: SpecGrid) => SpecGridRow[];
  derivedFor: (section: EsgSectionDef<D>) => ReactNode;
  inherited?: Record<string, InheritedValue>;
  na: Set<string>;
  missingIn: (letter: string) => number;
  timezone: string;
  choices: SpecChoices;
}) {
  return (
    <>
      {sections.map((section) => {
        const letter = section.letter;
        const saveAction = async (formData: FormData) => {
          "use server";
          if (doc === "esg") await updateSpecificationSection(eventId, letter, formData);
          else await updatePostEventSection(eventId, letter, formData);
        };
        const setNa = async (value: boolean) => {
          "use server";
          if (doc === "esg") await setSpecificationSectionNa(eventId, letter, value);
          else await setPostEventSectionNa(eventId, letter, value);
        };
        const derived = derivedFor(section);
        return (
          <SpecSectionCard
            key={letter}
            letter={letter}
            title={section.title}
            fields={section.fields}
            values={valuesFor(section)}
            inherited={inherited}
            timezone={timezone}
            choices={choices}
            na={na.has(letter)}
            missingCount={missingIn(letter)}
            saveAction={saveAction}
            setNa={setNa}
            derived={derived || undefined}
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
                        rows={rowsFor(grid)}
                        timezone={timezone}
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
    </>
  );
}
