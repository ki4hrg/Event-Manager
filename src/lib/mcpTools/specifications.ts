import { requirePermissionForUser } from "@/lib/permissions";
import { loadEsgNarrativeData } from "@/lib/esg/narrativeData";
import {
  ESG_HEADER_FIELDS,
  ESG_SECTIONS,
  ESG_SECTION_LETTERS,
  ESG_WRITABLE_FIELDS,
  SPEC_GRID_COLUMNS,
  SPEC_GRIDS,
  type EsgFieldKind,
  type SpecGrid,
} from "@/lib/esg/fields";
import { PER_SECTIONS, PER_SECTION_LETTERS, PER_WRITABLE_FIELDS } from "@/lib/esg/perFields";
import { loadPerData, perCompleteness } from "@/lib/esg/per";
import {
  setPostEventSectionNaCore,
  upsertPostEventCore,
  createSpecRowCore,
  deleteSpecRowCore,
  issueEsgCore,
  setSpecSectionNaCore,
  updateSpecRowCore,
  upsertEventSpecificationCore,
} from "@/app/events/specifications/core";
import type { McpToolDefinition } from "./types";
import { requireString } from "./types";

// JSON arg → typed value for an ESG field kind. Dates are "YYYY-MM-DD";
// datetimes are ISO 8601 with an offset.
function fromJson(key: string, kind: EsgFieldKind, value: unknown): unknown {
  if (value === null || value === "") return null;
  if (kind === "date" || kind === "datetime") {
    if (typeof value !== "string") throw new Error(`${key} must be a string`);
    const d = new Date(kind === "date" ? `${value.slice(0, 10)}T00:00:00Z` : value);
    if (isNaN(d.getTime())) throw new Error(`${key} is not a valid ${kind}: ${JSON.stringify(value)}`);
    return d;
  }
  return value;
}

function readValues(raw: unknown, kinds: Map<string, EsgFieldKind>, what: string): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${what} must be an object`);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const kind = kinds.get(key);
    if (!kind) throw new Error(`Unknown ${what} key: ${key}`);
    out[key] = fromJson(key, kind, value);
  }
  return out;
}

function requireGrid(args: Record<string, unknown>): SpecGrid {
  const grid = requireString(args, "grid");
  if (!(SPEC_GRIDS as readonly string[]).includes(grid)) throw new Error(`grid must be one of ${SPEC_GRIDS.join(", ")}`);
  return grid as SpecGrid;
}

const FIELD_KINDS = new Map(ESG_WRITABLE_FIELDS.map((f) => [f.key, f.kind]));
const PER_FIELD_KINDS = new Map(PER_WRITABLE_FIELDS.map((f) => [f.key, f.kind]));
const perFieldGuide = PER_SECTIONS.flatMap((s) => s.fields.map((f) => `${s.letter}:${f.key} (${f.kind}${f.optionCategory ? `:${f.optionCategory}` : ""}${f.required ? ", required" : ""})`)).join("; ");

const fieldGuide = [...ESG_HEADER_FIELDS.map((f) => ({ ...f, section: "header" })), ...ESG_SECTIONS.flatMap((s) => s.fields.map((f) => ({ ...f, section: s.letter })))]
  .map((f) => `${f.section}:${f.key} (${f.kind}${f.optionCategory ? `:${f.optionCategory}` : ""}${f.required ? ", required" : ""})`)
  .join("; ");

const gridGuide = SPEC_GRIDS.map((g) => `${g}: ${SPEC_GRID_COLUMNS[g].map((c) => `${c.key}(${c.kind})`).join(", ")}`).join(" | ");

export const specificationTools: McpToolDefinition[] = [
  {
    name: "get_event_specification",
    description:
      "Get an event's APEX Event Specifications Guide Part I (Narrative): stored fields by key, free-text `narrative`, N/A sections, the six grids (VIPs, shuttle routes, off-site transfers, shipments, security/first-aid coverage, keys), the derived F&B attendance grid, housing (placeholder until the Hotels module), and completeness against the ESG required fields.",
    inputSchema: {
      type: "object",
      properties: { eventId: { type: "string" } },
      required: ["eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      await requirePermissionForUser(userId, "EVENTS", "VIEW", eventId);
      const data = await loadEsgNarrativeData(eventId);
      if (!data) throw new Error("Event not found");
      const { event: _event, ...rest } = data;
      return {
        sections: ESG_SECTIONS.map((s) => ({ letter: s.letter, title: s.title })),
        ...rest,
      };
    },
  },
  {
    name: "update_event_specification",
    description: `Partially update an event's ESG Part I fields. Pass \`values\` keyed by field; omitted keys are unchanged, null clears. Dates are YYYY-MM-DD, datetimes ISO 8601 with offset, option fields take the option label, vendor/contact/function fields take ids from the same tenant/event, providedBy is NOT_REQUIRED|GROUP|VENUE|OUTSIDE_VENDOR. Once the ESG is issued, saving stamps Date Revised. Fields (section:key (kind)): ${fieldGuide}`,
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        values: { type: "object", description: "Field key → value.", additionalProperties: true },
      },
      required: ["eventId", "values"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      upsertEventSpecificationCore(requireString(args, "eventId"), readValues(args.values, FIELD_KINDS, "values"), userId),
  },
  {
    name: "set_event_specification_section_na",
    description: `Mark an ESG Part I section not applicable (exempts it from completeness) or applicable again. Sections: ${ESG_SECTION_LETTERS.join(", ")}.`,
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        section: { type: "string", enum: ESG_SECTION_LETTERS },
        notApplicable: { type: "boolean" },
      },
      required: ["eventId", "section", "notApplicable"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      setSpecSectionNaCore(requireString(args, "eventId"), requireString(args, "section"), args.notApplicable === true, userId),
  },
  {
    name: "issue_event_specification",
    description:
      "Issue the ESG: stamps Date Originated (or Date Revised on a re-issue) and locks function numbers so later functions get intermediate numbers (e.g. 4a).",
    inputSchema: {
      type: "object",
      properties: { eventId: { type: "string" } },
      required: ["eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      await issueEsgCore(eventId, userId);
      return { eventId, issued: true };
    },
  },
  {
    name: "get_post_event_details",
    description:
      "Get the stored APEX Post-Event Report fields for an event (columns, `narrative` comments, N/A sections) plus completeness. Future dates and distribution log are the `futureDates` / `distributions` grids (use the *_event_specification_row tools). For the rendered report use get_post_event_report.",
    inputSchema: { type: "object", properties: { eventId: { type: "string" } }, required: ["eventId"], additionalProperties: false },
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      await requirePermissionForUser(userId, "EVENTS", "VIEW", eventId);
      const data = await loadPerData(eventId);
      if (!data) throw new Error("Event not found");
      return {
        postEvent: data.postEvent,
        futureDates: data.narrative.grids.futureDates,
        distributions: data.narrative.grids.distributions,
        completeness: perCompleteness(data),
      };
    },
  },
  {
    name: "update_post_event_details",
    description: `Partially update an event's Post-Event Report fields (values keyed by field; omitted unchanged, null clears). Actual attendance / membership are on update_event; # fed is actualCount on catering orders; function attendance is actualAttendance on functions. Fields (section:key (kind)): ${perFieldGuide}`,
    inputSchema: {
      type: "object",
      properties: { eventId: { type: "string" }, values: { type: "object", additionalProperties: true } },
      required: ["eventId", "values"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      upsertPostEventCore(requireString(args, "eventId"), readValues(args.values, PER_FIELD_KINDS, "values"), userId),
  },
  {
    name: "set_post_event_section_na",
    description: `Mark a Post-Event Report section not applicable (or applicable again). Sections: ${PER_SECTION_LETTERS.join(", ")}.`,
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        section: { type: "string", enum: PER_SECTION_LETTERS },
        notApplicable: { type: "boolean" },
      },
      required: ["eventId", "section", "notApplicable"],
      additionalProperties: false,
    },
    handler: (args, { userId }) =>
      setPostEventSectionNaCore(requireString(args, "eventId"), requireString(args, "section"), args.notApplicable === true, userId),
  },
  {
    name: "create_event_specification_row",
    description: `Add a row to an ESG grid. \`values\` keys per grid: ${gridGuide}. coverage.kind is SECURITY or FIRST_AID; distributions.action is COMPLETED or REVISED.`,
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        grid: { type: "string", enum: [...SPEC_GRIDS] },
        values: { type: "object", additionalProperties: true },
      },
      required: ["eventId", "grid", "values"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const grid = requireGrid(args);
      const kinds = new Map(SPEC_GRID_COLUMNS[grid].map((c) => [c.key, c.kind]));
      return createSpecRowCore(requireString(args, "eventId"), grid, readValues(args.values, kinds, grid), userId);
    },
  },
  {
    name: "update_event_specification_row",
    description: "Partially update an ESG grid row (see create_event_specification_row for columns).",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        grid: { type: "string", enum: [...SPEC_GRIDS] },
        rowId: { type: "string" },
        values: { type: "object", additionalProperties: true },
      },
      required: ["eventId", "grid", "rowId", "values"],
      additionalProperties: false,
    },
    handler: (args, { userId }) => {
      const grid = requireGrid(args);
      const kinds = new Map(SPEC_GRID_COLUMNS[grid].map((c) => [c.key, c.kind]));
      return updateSpecRowCore(
        requireString(args, "eventId"),
        grid,
        requireString(args, "rowId"),
        readValues(args.values, kinds, grid),
        userId,
      );
    },
  },
  {
    name: "delete_event_specification_row",
    description: "Delete an ESG grid row.",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        grid: { type: "string", enum: [...SPEC_GRIDS] },
        rowId: { type: "string" },
      },
      required: ["eventId", "grid", "rowId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const rowId = requireString(args, "rowId");
      await deleteSpecRowCore(requireString(args, "eventId"), requireGrid(args), rowId, userId);
      return { rowId, deleted: true };
    },
  },
];
