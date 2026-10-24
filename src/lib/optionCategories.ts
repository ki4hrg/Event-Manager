// The option-category registry: every CustomOption list the app has, with
// what Settings needs to edit it and every column that stores its labels.
// Option references are by label, not FK, so a rename rewrites each rename
// target and a delete counts uses across them. A new category is one entry
// here plus its place in an area of OPTION_SECTIONS (tsc refuses an entry
// without rename targets or an area), its seed in
// prisma/tenantDefaults.mjs, and its reads.
//
// Plain server module (it reaches Prisma through the targets). Client
// components import its types only; pages hand them the resolved props.

import { EntityStatus, PermissionResource, Prisma } from "@prisma/client";
import { FUNCTION_SPACES, MEAL_BUCKETS, SCHEDULE_ROLES } from "@/lib/esg/apex";
import { CHARGE_SCOPES, PROPOSAL_STAGES } from "@/lib/hotels";
import { CONCESSION_GROUPS } from "@/lib/rfp/sections";
import { hotelLabelUses, mergeHotelLabel, type HotelLabelCategory } from "@/lib/hotelLabels";
import { MAIN_SCHEDULE_GROUP } from "@/lib/scheduleTypes";
import { STATUS_LABEL } from "@/lib/statusConstants";

type Db = Prisma.TransactionClient;

// ── Rename targets ──────────────────────────────────────────────────────────

type ModelProp = Prisma.TypeMap["meta"]["modelProps"];
type ModelOf<M extends ModelProp> = Prisma.TypeMap["model"][Capitalize<M> & Prisma.ModelName];
type Scalars<M extends ModelProp> = ModelOf<M>["payload"]["scalars"];
type StringField<M extends ModelProp> = {
  [K in keyof Scalars<M>]: Scalars<M>[K] extends string | null ? K : never;
}[keyof Scalars<M>] &
  string;
type WhereOf<M extends ModelProp> = NonNullable<ModelOf<M>["operations"]["updateMany"]["args"]["where"]>;

// A scalar string column holding the label. `where` scopes it to one tenant
// (labels are only unique per tenant). `onDelete: "clear"` marks a column a
// deleted option is cleared from rather than one that blocks the delete.
export type ColumnTarget = {
  kind: "column";
  model: ModelProp;
  field: string;
  where: (tenantId: string) => object;
  onDelete?: "clear";
};

// Anything a single updateMany can't express: array columns, merges that
// fold duplicates. `uses` counts records per label.
export type CustomTarget = {
  kind: "custom";
  name: string;
  rename: (tx: Db, tenantId: string, from: string, to: string) => Promise<unknown>;
  uses: (db: Db, tenantId: string) => Promise<Map<string, number>>;
};

export type RenameTarget = ColumnTarget | CustomTarget;

// Typed constructor: `field` must be a string column of `model`, and `where`
// that model's filter, so a renamed column or relation fails tsc.
function col<M extends ModelProp>(
  model: M,
  field: StringField<M>,
  where: (tenantId: string) => WhereOf<M>,
  opts: { onDelete?: "clear" } = {},
): ColumnTarget {
  return { kind: "column", model, field, where, ...opts };
}

const inTenant = (tenantId: string) => ({ tenantId });
const inEvent = (tenantId: string) => ({ event: { tenantId } });

// A String[] column. `join` reaches the tenant through Event for tables
// without their own tenantId.
function arrayCol(table: "Contact" | "Event" | "Rfp", column: string): CustomTarget {
  const t = Prisma.raw(`"${table}"`);
  const c = Prisma.raw(`"${column}"`);
  const viaEvent = table === "Rfp";
  return {
    kind: "custom",
    name: `${table}.${column}`,
    rename: (tx, tenantId, from, to) =>
      viaEvent
        ? tx.$executeRaw`
            UPDATE ${t} r SET ${c} = array_replace(r.${c}, ${from}, ${to})
            FROM "Event" e
            WHERE e."id" = r."eventId" AND e."tenantId" = ${tenantId} AND ${from} = ANY(r.${c})`
        : tx.$executeRaw`UPDATE ${t} SET ${c} = array_replace(${c}, ${from}, ${to}) WHERE "tenantId" = ${tenantId} AND ${from} = ANY(${c})`,
    uses: async (db, tenantId) => {
      const rows = viaEvent
        ? await db.$queryRaw<{ label: string; n: number }[]>`
            SELECT u.label, count(DISTINCT r."id")::int AS n
            FROM ${t} r JOIN "Event" e ON e."id" = r."eventId", unnest(r.${c}) AS u(label)
            WHERE e."tenantId" = ${tenantId} GROUP BY u.label`
        : await db.$queryRaw<{ label: string; n: number }[]>`
            SELECT u.label, count(DISTINCT r."id")::int AS n
            FROM ${t} r, unnest(r.${c}) AS u(label)
            WHERE r."tenantId" = ${tenantId} GROUP BY u.label`;
      return new Map(rows.map((r) => [r.label, r.n]));
    },
  };
}

// A merge-safe list (amenities, concessions, terms): rename and merge are the
// same move, folding rows that would end up holding the label twice.
function mergeTarget(category: HotelLabelCategory): CustomTarget {
  return {
    kind: "custom",
    name: `${category} uses`,
    rename: (tx, tenantId, from, to) => mergeHotelLabel(tx, tenantId, category, from, to),
    uses: (db, tenantId) => hotelLabelUses(db, tenantId, category),
  };
}

// Live form links offer booth types by option id (config.options.boothTypeIds),
// so a rename carries through on its own; a delete waits until no live link
// offers the type, or the public form would lose it.
const formLinkBoothTypes: CustomTarget = {
  kind: "custom",
  name: "FormLink booth types",
  rename: async () => {},
  uses: async (db, tenantId) => {
    const rows = await db.$queryRaw<{ label: string; n: number }[]>`
      SELECT co."label", count(*)::int AS n
      FROM "CustomOption" co
      JOIN "FormLink" fl ON fl."tenantId" = co."tenantId"
        AND (fl."config" -> 'options' -> 'boothTypeIds') @> jsonb_build_array(co."id")
      WHERE co."tenantId" = ${tenantId} AND co."category" = 'booth_type'
        AND fl."revokedAt" IS NULL AND fl."expiresAt" > now()
      GROUP BY co."label"`;
    return new Map(rows.map((r) => [r.label, r.n]));
  },
};

// A file hangs off exactly one parent; any of them places it in a tenant.
const fileInTenant = (tenantId: string): Prisma.FileUploadWhereInput => ({
  OR: [
    { event: { tenantId } },
    { venue: { tenantId } },
    { cateringOrder: inEvent(tenantId) },
    { avOrder: inEvent(tenantId) },
    { setupOrder: inEvent(tenantId) },
    { printOrder: inEvent(tenantId) },
    { supplyOrder: inEvent(tenantId) },
    { mediaDeliverable: inEvent(tenantId) },
    { hotelProposal: inEvent(tenantId) },
    { rfp: inEvent(tenantId) },
    { vendorQuote: inEvent(tenantId) },
    { inboundEmail: { tenantId } },
    { formSubmission: { tenantId } },
    { contact: { tenantId } },
  ],
});

// ── Sections ────────────────────────────────────────────────────────────────

// The functional areas of the admin nav, in nav order, each with its lists in
// order. Every list has its own page (optionListHref); /settings/<area>
// redirects to the area's first list. A category sits in exactly one area
// (checked below the registry).
export const OPTION_SECTIONS = {
  events: {
    title: "Events",
    lists: ["event_type", "event_scope", "event_frequency", "per_facility_type", "hotel_region", "hotel_area", "file_type", "cost_center"],
  },
  program: { title: "Program", lists: ["function_type", "schedule_type", "presentation_type", "presenter_role", "booth_type"] },
  orders: {
    title: "Orders",
    lists: ["service_style", "meal_type", "unit", "setup_type", "per_av_setup", "delivery_method", "media_type", "print_distribution"],
  },
  hotels: {
    title: "Hotels",
    lists: [
      "hotel_room_type",
      "hotel_guest_type",
      "hotel_amenity",
      "hotel_charge",
      "hotel_brand",
      "reservation_method",
      "proposal_status",
      "per_housing_provider",
    ],
  },
  rfps: { title: "RFPs", lists: ["rfp_service", "rfp_term", "rfp_concession"] },
  people: { title: "People & vendors", lists: ["contact_role", "vendor_contact_type"] },
  status: { title: "Statuses", lists: ["substatus"] },
  inventory: { title: "Inventory", lists: ["equipment_category", "location_type"] },
} as const satisfies Record<string, { title: string; lists: readonly string[] }>;

export type OptionSection = keyof typeof OPTION_SECTIONS;

export const SECTION_KEYS = Object.keys(OPTION_SECTIONS) as OptionSection[];

export function isOptionSection(value: string): value is OptionSection {
  return Object.hasOwn(OPTION_SECTIONS, value);
}

// Settings URLs from before lists had their own pages: the per-topic tabs
// (/settings/functions, …) and the area slugs since renamed or split. Each
// lands on one list (checked below the registry).
export const LEGACY_SETTINGS_TABS = {
  functions: "function_type",
  presentations: "presentation_type",
  files: "file_type",
  specifications: "event_type",
  catering: "service_style",
  contacts: "contact_role",
  vendors: "vendor_contact_type",
  "event-planning": "event_type",
  "post-event": "per_facility_type",
} as const satisfies Record<string, string>;

// ── Groups ──────────────────────────────────────────────────────────────────

export type GroupChoice = { value: string; label: string; description?: string };

// An option's `group`: a fixed key from a code list (meal bucket, proposal
// stage), or another category's label (an area's region). `split` renders one
// list per group with the group fixed (substatus per top-level status).
export type GroupSource =
  | { kind: "fixed"; label: string; choices: readonly GroupChoice[]; fallback?: string; split?: boolean }
  // `category` is an OptionCategory (checked below the registry; typing it
  // here would make the registry's type circular).
  | { kind: "category"; label: string; category: string };

// One substatus list per top-level status, in the enum's order.
export const SUBSTATUS_GROUPS: readonly GroupChoice[] = Object.values(EntityStatus).map((status) => ({
  value: status,
  label: `${STATUS_LABEL[status]} Substatuses`,
  description: `Finer states within ${STATUS_LABEL[status]}.`,
}));

// A file type's group: the type a feature files its own documents under
// (RFP: what a sent RFP's document is filed as), resolved by group so a
// renamed label still matches.
export const FILE_TYPE_GROUPS = [{ value: "RFP", label: "RFP documents" }] as const;

// ── The registry ────────────────────────────────────────────────────────────

export type OptionCategoryDef = {
  title: string;
  description: string;
  color?: boolean;
  // Option carries Vendor model types (which order forms list it).
  models?: boolean;
  groups?: GroupSource;
  // One spelling per thing: options merge into one another, and labels in use
  // that aren't on the list are offered for mapping. `noun` names one item.
  mergeable?: { noun: string };
  // Who edits the list (VIEW to see it, WRITE/DELETE to change it).
  resource: PermissionResource;
  // Every column storing this category's labels. Required: a list with no
  // stored uses still declares [] on purpose.
  renameTargets: readonly RenameTarget[];
};

const SETTINGS = PermissionResource.SETTINGS;

const SUBSTATUS_TARGETS: readonly RenameTarget[] = [
  col("function", "substatus", inEvent),
  col("presentation", "substatus", inEvent),
  col("aVOrder", "substatus", inEvent),
  col("cateringOrder", "substatus", inEvent),
  col("setupOrder", "substatus", inEvent),
  col("printOrder", "substatus", inEvent),
  col("mediaDeliverable", "substatus", inEvent),
  col("supplyOrder", "substatus", inEvent),
  col("formSubmission", "substatus", inTenant),
  // An event's default substatus is config, not a use: a delete clears it.
  col("eventStatusDefault", "substatus", inEvent, { onDelete: "clear" }),
  col("workflowTemplate", "pendingSubstatusValue", inTenant),
  col("workflowTemplate", "completionSubstatusValue", inTenant),
  col("workflowStep", "pendingSubstatusValue", (tenantId) => ({ template: { tenantId } })),
];

const HOTEL_ROOM_TYPE_TARGETS: readonly RenameTarget[] = [
  col("hotelProposalNight", "roomType", (t) => ({ proposal: inEvent(t) })),
  col("hotelBlockNight", "roomType", (t) => ({ block: { proposal: inEvent(t) } })),
  col("hotelPickupGuest", "roomType", (t) => ({ block: { proposal: inEvent(t) } })),
  col("hotelPickupCount", "roomType", (t) => ({ block: { proposal: inEvent(t) } })),
  col("rfpHotelBlockNight", "roomType", (t) => ({ block: { rfp: inEvent(t) } })),
];

export const OPTION_CATEGORIES = {
  function_type: {
    title: "Function Types",
    description: "Categories for functions.",
    color: true,
    groups: { kind: "fixed", label: "Function space", choices: FUNCTION_SPACES },
    resource: SETTINGS,
    renameTargets: [
      col("function", "type", inEvent),
      col("rfpSpaceRequest", "functionType", (t) => ({ kind: "MEETING", rfp: inEvent(t) })),
    ],
  },
  schedule_type: {
    title: "Schedule Types",
    description: "Entries in a function's schedule.",
    color: true,
    // MAIN anchors a function's date and is the default for new schedules.
    groups: { kind: "fixed", label: "Role", choices: [{ value: MAIN_SCHEDULE_GROUP, label: "Main" }, ...SCHEDULE_ROLES] },
    resource: SETTINGS,
    renameTargets: [col("functionSchedule", "type", (t) => ({ function: inEvent(t) }))],
  },
  setup_type: {
    title: "Setup Types",
    description: "Room setups for setup orders.",
    resource: SETTINGS,
    renameTargets: [
      col("setupOrder", "setupType", inEvent),
      col("rfpSpaceRequest", "setup", (t) => ({ rfp: inEvent(t) })),
      col("function", "defaultSetup", inEvent),
    ],
  },
  booth_type: {
    title: "Booth Types",
    description: "Exhibit booth and stand types.",
    resource: SETTINGS,
    renameTargets: [col("exhibitBooth", "boothType", inEvent), col("exhibitBoothGroup", "boothType", inEvent), formLinkBoothTypes],
  },
  presenter_role: {
    title: "Presenter Roles",
    description: "Speaker roles on presentations.",
    resource: SETTINGS,
    renameTargets: [col("presentationContact", "role", (t) => ({ presentation: inEvent(t) }))],
  },
  presentation_type: {
    title: "Presentation Types",
    description: "Categories for presentations.",
    color: true,
    resource: SETTINGS,
    renameTargets: [col("presentation", "type", inEvent)],
  },
  contact_role: {
    title: "Contact Roles",
    description: "Roles for contacts.",
    resource: SETTINGS,
    renameTargets: [arrayCol("Contact", "roles")],
  },
  service_style: {
    title: "Service Styles",
    description: "Catering service styles.",
    resource: SETTINGS,
    renameTargets: [col("cateringOrder", "serviceStyle", inEvent)],
  },
  meal_type: {
    title: "Meal Types",
    description: "Meal periods for catering orders.",
    groups: { kind: "fixed", label: "Report bucket", choices: MEAL_BUCKETS },
    resource: SETTINGS,
    renameTargets: [
      col("cateringOrder", "mealType", inEvent),
      col("rfpSpaceRequest", "functionType", (t) => ({ kind: "FB", rfp: inEvent(t) })),
      col("hotelProposalMeal", "mealType", (t) => ({ proposal: inEvent(t) })),
    ],
  },
  unit: {
    title: "Units",
    description: "Units for catering and RFP line items.",
    resource: SETTINGS,
    renameTargets: [
      col("cateringOrderLineItem", "unitType", (t) => ({ cateringOrder: inEvent(t) })),
      col("rfpLineItem", "unit", (t) => ({ rfp: inEvent(t) })),
    ],
  },
  vendor_contact_type: {
    title: "Vendor Contact Types",
    description: "Roles for vendor contacts.",
    resource: SETTINGS,
    renameTargets: [col("vendorContact", "contactType", (tenantId) => ({ vendor: { tenantId } }))],
  },
  file_type: {
    title: "File Types",
    description: "Categories for file attachments.",
    groups: { kind: "fixed", label: "Used for", choices: FILE_TYPE_GROUPS },
    resource: SETTINGS,
    renameTargets: [col("fileUpload", "fileType", fileInTenant)],
  },
  substatus: {
    title: "Substatuses",
    description: "Finer states within each status.",
    groups: { kind: "fixed", label: "Status", choices: SUBSTATUS_GROUPS, split: true },
    resource: SETTINGS,
    renameTargets: SUBSTATUS_TARGETS,
  },
  proposal_status: {
    title: "Proposal Statuses",
    description: "Hotel proposal statuses, each tied to a stage.",
    color: true,
    groups: { kind: "fixed", label: "Stage", choices: PROPOSAL_STAGES },
    resource: SETTINGS,
    renameTargets: [col("hotelProposal", "status", inEvent)],
  },
  hotel_room_type: {
    title: "Room Types",
    description: "Room types for hotel blocks.",
    resource: SETTINGS,
    renameTargets: HOTEL_ROOM_TYPE_TARGETS,
  },
  hotel_guest_type: {
    title: "Guest Types",
    description: "Guest types for hotel proposals and RFPs.",
    resource: SETTINGS,
    renameTargets: [col("hotelProposal", "guestType", inEvent), col("rfpHotelBlock", "guestType", (t) => ({ rfp: inEvent(t) }))],
  },
  hotel_amenity: {
    title: "Amenities",
    description: "Hotel amenities.",
    mergeable: { noun: "amenity" },
    resource: SETTINGS,
    renameTargets: [mergeTarget("hotel_amenity")],
  },
  hotel_charge: {
    title: "Guest Charges",
    description: "Charges hotels add to a guest's stay.",
    groups: { kind: "fixed", label: "Default scope", choices: CHARGE_SCOPES },
    resource: SETTINGS,
    renameTargets: [
      col("hotelCharge", "chargeType", (t) => ({
        kind: "GUEST",
        OR: [{ proposal: inEvent(t) }, { block: { proposal: inEvent(t) } }],
      })),
    ],
  },
  hotel_brand: {
    title: "Brands",
    description: "Hotel brands for venues.",
    resource: SETTINGS,
    renameTargets: [col("venue", "brand", inTenant)],
  },
  // Areas name their region in `group` (hotel_area's group source), so a
  // region rename also rewrites those groups — derived, not listed here.
  hotel_region: {
    title: "Regions",
    description: "Regions for events and RFPs.",
    resource: SETTINGS,
    renameTargets: [arrayCol("Event", "regions"), arrayCol("Rfp", "regions")],
  },
  hotel_area: {
    title: "Areas",
    description: "Areas within a region.",
    groups: { kind: "category", label: "Region", category: "hotel_region" },
    resource: SETTINGS,
    renameTargets: [col("venue", "area", inTenant), arrayCol("Event", "areas"), arrayCol("Rfp", "areas")],
  },
  rfp_concession: {
    title: "Concessions",
    description: "Concessions requested in RFPs.",
    groups: { kind: "fixed", label: "Heading", choices: CONCESSION_GROUPS, fallback: "OTHER" },
    mergeable: { noun: "concession" },
    resource: SETTINGS,
    renameTargets: [mergeTarget("rfp_concession")],
  },
  reservation_method: {
    title: "Reservation Methods",
    description: "How attendees reserve rooms.",
    resource: SETTINGS,
    renameTargets: [
      col("rfp", "reservationMethod", inEvent),
      col("eventSpecification", "reservationMethod", inEvent),
      col("hotelBlock", "reservationMethod", (t) => ({ proposal: inEvent(t) })),
    ],
  },
  rfp_service: {
    title: "Services",
    description: "What an Other services RFP is for.",
    resource: SETTINGS,
    renameTargets: [col("rfp", "service", inEvent)],
  },
  rfp_term: {
    title: "Terms",
    description: "Terms requested in RFPs.",
    mergeable: { noun: "RFP term" },
    resource: SETTINGS,
    renameTargets: [mergeTarget("rfp_term")],
  },
  cost_center: {
    title: "Cost Centers",
    description: "Cost centers for functions and exhibit booths.",
    resource: SETTINGS,
    renameTargets: [
      col("function", "costCenter", inEvent),
      col("exhibitBooth", "costCenter", inEvent),
      col("exhibitBoothGroup", "costCenter", inEvent),
    ],
  },
  event_type: {
    title: "Event Types",
    description: "Categories for events.",
    resource: SETTINGS,
    renameTargets: [col("eventSpecification", "eventType", inEvent)],
  },
  event_scope: {
    title: "Event Scope",
    description: "Citywide, single venue or multiple venues.",
    resource: SETTINGS,
    renameTargets: [col("eventSpecification", "eventScope", inEvent)],
  },
  event_frequency: {
    title: "Event Frequency",
    description: "How often an event recurs.",
    resource: SETTINGS,
    renameTargets: [col("eventSpecification", "eventFrequency", inEvent)],
  },
  per_facility_type: {
    title: "Facility Types",
    description: "Primary event facility type.",
    resource: SETTINGS,
    renameTargets: [col("eventPostEvent", "primaryFacilityType", inEvent)],
  },
  per_housing_provider: {
    title: "Housing Providers",
    description: "Who performed housing services.",
    resource: SETTINGS,
    renameTargets: [col("eventPostEvent", "housingPerformedBy", inEvent)],
  },
  per_av_setup: {
    title: "A/V Set-ups",
    description: "A/V set-up for the largest function.",
    resource: SETTINGS,
    renameTargets: [col("eventPostEvent", "largestFunctionAvSetup", inEvent)],
  },
  delivery_method: {
    title: "Delivery Methods",
    description: "How a media deliverable reaches the room.",
    resource: SETTINGS,
    renameTargets: [col("mediaDeliverable", "delivery", inEvent)],
  },
  media_type: {
    title: "Media Types",
    description: "Kinds of media deliverables.",
    resource: SETTINGS,
    renameTargets: [col("mediaDeliverable", "mediaType", inEvent)],
  },
  print_distribution: {
    title: "Print Distribution",
    description: "How printed items are distributed.",
    resource: SETTINGS,
    renameTargets: [col("printItem", "distributionMethod", (t) => ({ printOrder: inEvent(t) }))],
  },
  equipment_category: {
    title: "Equipment Categories",
    description: "Categories for equipment.",
    models: true,
    resource: PermissionResource.EQUIPMENT,
    renameTargets: [col("equipment", "category", inTenant)],
  },
  location_type: {
    title: "Location Types",
    description: "What a storage location is.",
    color: true,
    resource: PermissionResource.STORAGE_LOCATIONS,
    renameTargets: [col("storageLocation", "type", inTenant)],
  },
} as const satisfies Record<string, OptionCategoryDef>;

export type OptionCategory = keyof typeof OPTION_CATEGORIES;

// Every category-sourced group names a real category.
type GroupRef<K extends OptionCategory> = (typeof OPTION_CATEGORIES)[K] extends { groups: { kind: "category"; category: infer C } } ? C : never;
type UnknownGroupRef = Exclude<{ [K in OptionCategory]: GroupRef<K> }[OptionCategory], OptionCategory>;
const _groupRefsValid: [UnknownGroupRef] extends [never] ? true : UnknownGroupRef = true;
void _groupRefsValid;

const CATEGORY_KEYS = Object.keys(OPTION_CATEGORIES) as OptionCategory[];

// Every permission resource a list is edited under, for a page rendering any list.
export const OPTION_RESOURCES: PermissionResource[] = Array.from(new Set(CATEGORY_KEYS.map((c) => OPTION_CATEGORIES[c].resource)));

export function isOptionCategory(value: string): value is OptionCategory {
  return Object.hasOwn(OPTION_CATEGORIES, value);
}

// The entry for a category a caller passed in; an unknown one throws, so a
// Server Action can't be pointed at an arbitrary CustomOption.category.
export function optionCategory(category: string): OptionCategoryDef {
  if (!isOptionCategory(category)) throw new Error(`Unknown option category: ${category}`);
  return OPTION_CATEGORIES[category];
}

// Every area's lists name real categories, and every category has an area;
// so do the legacy redirects.
type ListedCategory = (typeof OPTION_SECTIONS)[OptionSection]["lists"][number];
type SectionRefErrors =
  | Exclude<ListedCategory, OptionCategory>
  | Exclude<OptionCategory, ListedCategory>
  | Exclude<(typeof LEGACY_SETTINGS_TABS)[keyof typeof LEGACY_SETTINGS_TABS], OptionCategory>;
const _sectionRefsValid: [SectionRefErrors] extends [never] ? true : SectionRefErrors = true;
void _sectionRefsValid;

export const categoriesInSection = (section: OptionSection): readonly OptionCategory[] => OPTION_SECTIONS[section].lists;

const SECTION_OF = Object.fromEntries(
  SECTION_KEYS.flatMap((s) => categoriesInSection(s).map((c) => [c, s])),
) as Record<OptionCategory, OptionSection>;

export const sectionOf = (category: OptionCategory): OptionSection => SECTION_OF[category];

// A list's own page in the admin area.
export const optionListHref = (category: OptionCategory) => `/settings/lists/${category}`;

// The legacy settings slug's list, if it had one.
export function legacySettingsTab(slug: string): OptionCategory | null {
  return Object.hasOwn(LEGACY_SETTINGS_TABS, slug) ? LEGACY_SETTINGS_TABS[slug as keyof typeof LEGACY_SETTINGS_TABS] : null;
}

// Lists whose options merge into one another (every use moves over).
export const MERGEABLE: readonly OptionCategory[] = CATEGORY_KEYS.filter((c) => "mergeable" in OPTION_CATEGORIES[c]);

export function isMergeable(category: OptionCategory): category is HotelLabelCategory {
  return MERGEABLE.includes(category);
}

// Where each list is edited, for messages naming it
// ("isn't in the amenity list (Settings › Hotels › Amenities)").
export const LIST_HOMES = Object.fromEntries(
  CATEGORY_KEYS.map((c) => [c, `Settings › ${OPTION_SECTIONS[sectionOf(c)].title} › ${OPTION_CATEGORIES[c].title}`]),
) as Record<OptionCategory, string>;

// ── Derived operations ──────────────────────────────────────────────────────

type Delegate = {
  updateMany(args: { where: object; data: object }): Promise<unknown>;
  groupBy(args: { by: string[]; where: object; _count: { _all: true } }): Promise<Record<string, unknown>[]>;
};
const delegate = (db: Db, model: ModelProp) => (db as unknown as Record<ModelProp, Delegate>)[model];

// Categories whose `group` holds this category's labels (areas → region).
const groupedBy = (category: OptionCategory) =>
  CATEGORY_KEYS.filter((c) => {
    const groups: GroupSource | undefined = (OPTION_CATEGORIES[c] as OptionCategoryDef).groups;
    return groups?.kind === "category" && groups.category === category;
  });

// When a CustomOption label is renamed, rewrite the old label on every row
// that stores it (and on options grouped under it). Every rewrite is scoped
// to the tenant: labels are only unique per tenant, so an unscoped update
// would rename another tenant's rows that happen to share the string. A
// mergeable list's target folds `from` into `to`, so this is its merge too.
export async function propagateLabelRename(tx: Db, tenantId: string, category: OptionCategory, from: string, to: string) {
  if (from === to) return;
  for (const target of OPTION_CATEGORIES[category].renameTargets as readonly RenameTarget[]) {
    if (target.kind === "custom") {
      await target.rename(tx, tenantId, from, to);
    } else {
      await delegate(tx, target.model).updateMany({
        where: { ...target.where(tenantId), [target.field]: from },
        data: { [target.field]: to },
      });
    }
  }
  for (const child of groupedBy(category)) {
    await tx.customOption.updateMany({ where: { tenantId, category: child, group: from }, data: { group: to } });
  }
}

// Clears a deleted option's label from the columns marked onDelete "clear".
export async function clearDeletedLabel(tx: Db, tenantId: string, category: OptionCategory, label: string) {
  for (const target of OPTION_CATEGORIES[category].renameTargets as readonly RenameTarget[]) {
    if (target.kind !== "column" || target.onDelete !== "clear") continue;
    await delegate(tx, target.model).updateMany({
      where: { ...target.where(tenantId), [target.field]: label },
      data: { [target.field]: null },
    });
  }
}

// How many records hold each label of a category, across every target that
// blocks a delete (and options grouped under it). Labels not on the list
// appear too: the off-list labels Settings offers to map or add.
export async function optionLabelUses(db: Db, tenantId: string, category: OptionCategory): Promise<Map<string, number>> {
  const uses = new Map<string, number>();
  const add = (label: unknown, n: number) => {
    if (typeof label === "string" && label) uses.set(label, (uses.get(label) ?? 0) + n);
  };
  const targets = (OPTION_CATEGORIES[category].renameTargets as readonly RenameTarget[]).filter(
    (t) => t.kind === "custom" || t.onDelete !== "clear",
  );
  const counted = await Promise.all(
    targets.map(async (target) => {
      if (target.kind === "custom") return Array.from(await target.uses(db, tenantId));
      const rows = await delegate(db, target.model).groupBy({
        by: [target.field],
        where: target.where(tenantId),
        _count: { _all: true },
      });
      return rows.map((r) => [r[target.field], (r._count as { _all: number })._all] as const);
    }),
  );
  counted.flat().forEach(([label, n]) => add(label, n));
  for (const child of groupedBy(category)) {
    const rows = await db.customOption.groupBy({
      by: ["group"],
      where: { tenantId, category: child, group: { not: null } },
      _count: { _all: true },
    });
    rows.forEach((r) => add(r.group, r._count._all));
  }
  return uses;
}

// Labels in use that aren't on the list, with how many records hold each.
export function offListLabels(uses: Map<string, number>, options: { label: string }[]): { label: string; uses: number }[] {
  const listed = new Set(options.map((o) => o.label));
  return Array.from(uses, ([label, n]) => ({ label, uses: n }))
    .filter((l) => !listed.has(l.label))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// The pickable groups of a category's options, resolved for one tenant.
export async function groupChoices(db: Db, tenantId: string, category: OptionCategory): Promise<GroupChoice[] | undefined> {
  const groups: GroupSource | undefined = (OPTION_CATEGORIES[category] as OptionCategoryDef).groups;
  if (!groups) return undefined;
  if (groups.kind === "fixed") return groups.choices.map((g) => ({ value: g.value, label: g.label }));
  const options = await db.customOption.findMany({
    where: { tenantId, category: groups.category },
    orderBy: { sortOrder: "asc" },
    select: { label: true },
  });
  return options.map((o) => ({ value: o.label, label: o.label }));
}
