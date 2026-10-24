// The option-category registry: every CustomOption list the app has, with
// what Settings needs to edit it and every column that stores its labels.
// Option references are by label, not FK, so a rename rewrites each rename
// target and a delete counts uses across them. A new category is one entry
// here (tsc refuses an entry without rename targets), its seed in
// prisma/tenantDefaults.mjs, and its reads.
//
// Plain server module (it reaches Prisma through the targets). Client
// components import its types only; pages hand them the resolved props.

import { PermissionResource, Prisma } from "@prisma/client";
import { FUNCTION_SPACES, MEAL_BUCKETS, SCHEDULE_ROLES } from "@/lib/esg/apex";
import { PROPOSAL_STAGES } from "@/lib/hotels";
import { CONCESSION_GROUPS } from "@/lib/rfp/sections";
import { hotelLabelUses, mergeHotelLabel, type HotelLabelCategory } from "@/lib/hotelLabels";
import { MAIN_SCHEDULE_GROUP } from "@/lib/scheduleTypes";

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

// Where a list is edited. `href` is the page; `home` names it in messages
// ("isn't in the amenity list (Settings › Hotels & RFPs)"). `settings` marks
// the sections /settings/[section] renders; the others have their own page
// under another permission.
export const OPTION_SECTIONS = {
  "event-planning": { title: "Event planning", href: "/settings/event-planning", home: "Settings › Event planning", settings: true },
  orders: { title: "Orders & services", href: "/settings/orders", home: "Settings › Orders & services", settings: true },
  status: { title: "Status & workflow", href: "/settings/status", home: "Settings › Status & workflow", settings: true },
  people: { title: "People & vendors", href: "/settings/people", home: "Settings › People & vendors", settings: true },
  hotels: { title: "Hotels & RFPs", href: "/settings/hotels", home: "Settings › Hotels & RFPs", settings: true },
  "post-event": { title: "Post-event", href: "/settings/post-event", home: "Settings › Post-event", settings: true },
  equipment: { title: "Equipment categories", href: "/equipment/categories", home: "Equipment › Categories", settings: false },
  storage: { title: "Location types", href: "/storage-locations/types", home: "Storage › Types", settings: false },
} as const satisfies Record<string, { title: string; href: string; home: string; settings: boolean }>;

export type OptionSection = keyof typeof OPTION_SECTIONS;

export const SETTINGS_SECTIONS = (Object.keys(OPTION_SECTIONS) as OptionSection[]).filter((s) => OPTION_SECTIONS[s].settings);

export function isSettingsSection(value: string): value is OptionSection {
  return Object.hasOwn(OPTION_SECTIONS, value) && OPTION_SECTIONS[value as OptionSection].settings;
}

// The settings tabs before the lists were grouped, for redirects.
export const LEGACY_SETTINGS_TABS: Record<string, OptionSection> = {
  functions: "event-planning",
  presentations: "event-planning",
  files: "event-planning",
  specifications: "event-planning",
  catering: "orders",
  contacts: "people",
  vendors: "people",
};

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

export const SUBSTATUS_GROUPS = [
  { value: "PENDING", label: "Pending Substatuses", description: "Specific states within the Pending top-level status (e.g., Expected, Requested)" },
  { value: "IN_PROGRESS", label: "In Progress Substatuses", description: "Specific states within the In Progress top-level status (e.g., Approved)" },
  { value: "COMPLETE", label: "Complete Substatuses", description: "Specific states within the Complete top-level status (e.g., Confirmed)" },
  { value: "CANCELLED", label: "Cancelled Substatuses", description: "Specific states used when cancelling an entity (e.g., Denied, Cancelled)" },
] as const;

// A file type's group: the type a feature files its own documents under
// (RFP: what a sent RFP's document is filed as), resolved by group so a
// renamed label still matches.
export const FILE_TYPE_GROUPS = [{ value: "RFP", label: "RFP documents" }] as const;

// ── The registry ────────────────────────────────────────────────────────────

export type OptionCategoryDef = {
  title: string;
  section: OptionSection;
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
    section: "event-planning",
    description: "Categories for scheduled functions.",
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
    section: "event-planning",
    description: "Types of schedule items for functions (e.g., Setup, Rehearsal, Main Event).",
    color: true,
    // MAIN anchors a function's date and is the default for new schedules.
    groups: { kind: "fixed", label: "Role", choices: [{ value: MAIN_SCHEDULE_GROUP, label: "Main" }, ...SCHEDULE_ROLES] },
    resource: SETTINGS,
    renameTargets: [col("functionSchedule", "type", (t) => ({ function: inEvent(t) }))],
  },
  setup_type: {
    title: "Setup Types",
    section: "event-planning",
    description: "Room setup configurations for Setup Orders.",
    resource: SETTINGS,
    renameTargets: [
      col("setupOrder", "setupType", inEvent),
      col("rfpSpaceRequest", "setup", (t) => ({ rfp: inEvent(t) })),
      col("function", "defaultSetup", inEvent),
    ],
  },
  booth_type: {
    title: "Booth Types",
    section: "event-planning",
    description: "Booth / stand types.",
    resource: SETTINGS,
    renameTargets: [col("exhibitBooth", "boothType", inEvent), col("exhibitBoothGroup", "boothType", inEvent)],
  },
  presenter_role: {
    title: "Presenter Roles",
    section: "event-planning",
    description: "Roles for speakers in presentations (e.g., Presenter, Co-Presenter, Moderator)",
    resource: SETTINGS,
    renameTargets: [col("presentationContact", "role", (t) => ({ presentation: inEvent(t) }))],
  },
  presentation_type: {
    title: "Presentation Types",
    section: "event-planning",
    description: "Types of presentations (e.g., Breakout, Plenary)",
    color: true,
    resource: SETTINGS,
    renameTargets: [col("presentation", "type", inEvent)],
  },
  contact_role: {
    title: "Contact Roles",
    section: "people",
    description: "Roles that can be assigned to contacts (e.g., Speaker, Vendor, Staff)",
    resource: SETTINGS,
    renameTargets: [arrayCol("Contact", "roles")],
  },
  service_style: {
    title: "Service Styles",
    section: "orders",
    description: "Catering service styles for Catering Orders (e.g., Plated, Buffet, Stations)",
    resource: SETTINGS,
    renameTargets: [col("cateringOrder", "serviceStyle", inEvent)],
  },
  meal_type: {
    title: "Meal Types",
    section: "orders",
    description: "Meal period for Catering Orders.",
    groups: { kind: "fixed", label: "Report bucket", choices: MEAL_BUCKETS },
    resource: SETTINGS,
    renameTargets: [
      col("cateringOrder", "mealType", inEvent),
      col("rfpSpaceRequest", "functionType", (t) => ({ kind: "FB", rfp: inEvent(t) })),
      col("hotelProposalMeal", "mealType", (t) => ({ proposal: inEvent(t) })),
    ],
  },
  vendor_contact_type: {
    title: "Vendor Contact Types",
    section: "people",
    description: "Roles for vendor contacts (e.g., Sales, Billing, Technical)",
    resource: SETTINGS,
    renameTargets: [col("vendorContact", "contactType", (tenantId) => ({ vendor: { tenantId } }))],
  },
  file_type: {
    title: "File Types",
    section: "event-planning",
    description: "Categories for file attachments (e.g., Proposal, Invoice, Contract)",
    groups: { kind: "fixed", label: "Used for", choices: FILE_TYPE_GROUPS },
    resource: SETTINGS,
    renameTargets: [col("fileUpload", "fileType", fileInTenant)],
  },
  substatus: {
    title: "Substatuses",
    section: "status",
    description: "",
    groups: { kind: "fixed", label: "Status", choices: SUBSTATUS_GROUPS, split: true },
    resource: SETTINGS,
    renameTargets: SUBSTATUS_TARGETS,
  },
  proposal_status: {
    title: "Proposal Statuses",
    section: "hotels",
    description: "Stage drives the workflow.",
    color: true,
    groups: { kind: "fixed", label: "Stage", choices: PROPOSAL_STAGES },
    resource: SETTINGS,
    renameTargets: [col("hotelProposal", "status", inEvent)],
  },
  hotel_room_type: {
    title: "Room Types",
    section: "hotels",
    description: "",
    resource: SETTINGS,
    renameTargets: HOTEL_ROOM_TYPE_TARGETS,
  },
  hotel_guest_type: {
    title: "Guest Types",
    section: "hotels",
    description: "",
    resource: SETTINGS,
    renameTargets: [col("hotelProposal", "guestType", inEvent), col("rfpHotelBlock", "guestType", (t) => ({ rfp: inEvent(t) }))],
  },
  hotel_amenity: {
    title: "Amenities",
    section: "hotels",
    description: "",
    mergeable: { noun: "amenity" },
    resource: SETTINGS,
    renameTargets: [mergeTarget("hotel_amenity")],
  },
  hotel_brand: {
    title: "Brands",
    section: "hotels",
    description: "",
    resource: SETTINGS,
    renameTargets: [col("venue", "brand", inTenant)],
  },
  // Areas name their region in `group` (hotel_area's group source), so a
  // region rename also rewrites those groups — derived, not listed here.
  hotel_region: {
    title: "Regions",
    section: "hotels",
    description: "",
    resource: SETTINGS,
    renameTargets: [arrayCol("Event", "regions"), arrayCol("Rfp", "regions")],
  },
  hotel_area: {
    title: "Areas",
    section: "hotels",
    description: "",
    groups: { kind: "category", label: "Region", category: "hotel_region" },
    resource: SETTINGS,
    renameTargets: [col("venue", "area", inTenant), arrayCol("Event", "areas"), arrayCol("Rfp", "areas")],
  },
  rfp_concession: {
    title: "Concessions",
    section: "hotels",
    description: "",
    groups: { kind: "fixed", label: "Heading", choices: CONCESSION_GROUPS, fallback: "OTHER" },
    mergeable: { noun: "concession" },
    resource: SETTINGS,
    renameTargets: [mergeTarget("rfp_concession")],
  },
  reservation_method: {
    title: "Reservation Methods",
    section: "hotels",
    description: "",
    resource: SETTINGS,
    renameTargets: [
      col("rfp", "reservationMethod", inEvent),
      col("eventSpecification", "reservationMethod", inEvent),
      col("hotelBlock", "reservationMethod", (t) => ({ proposal: inEvent(t) })),
    ],
  },
  rfp_service: {
    title: "RFP Services",
    section: "hotels",
    description: "What an Other services RFP is for",
    resource: SETTINGS,
    renameTargets: [col("rfp", "service", inEvent)],
  },
  rfp_term: {
    title: "RFP Terms",
    section: "hotels",
    description: "",
    mergeable: { noun: "RFP term" },
    resource: SETTINGS,
    renameTargets: [mergeTarget("rfp_term")],
  },
  event_type: {
    title: "Event Types",
    section: "event-planning",
    description: "",
    resource: SETTINGS,
    renameTargets: [col("eventSpecification", "eventType", inEvent)],
  },
  event_scope: {
    title: "Event Scope",
    section: "event-planning",
    description: "Citywide, single venue, multiple venue, etc.",
    resource: SETTINGS,
    renameTargets: [col("eventSpecification", "eventScope", inEvent)],
  },
  event_frequency: {
    title: "Event Frequency",
    section: "event-planning",
    description: "",
    resource: SETTINGS,
    renameTargets: [col("eventSpecification", "eventFrequency", inEvent)],
  },
  per_facility_type: {
    title: "Facility Types",
    section: "post-event",
    description: "Primary event facility type.",
    resource: SETTINGS,
    renameTargets: [col("eventPostEvent", "primaryFacilityType", inEvent)],
  },
  per_housing_provider: {
    title: "Housing Providers",
    section: "post-event",
    description: "Who performed housing services.",
    resource: SETTINGS,
    renameTargets: [col("eventPostEvent", "housingPerformedBy", inEvent)],
  },
  per_av_setup: {
    title: "A/V Set-ups",
    section: "post-event",
    description: "A/V set-up for the largest function.",
    resource: SETTINGS,
    renameTargets: [col("eventPostEvent", "largestFunctionAvSetup", inEvent)],
  },
  delivery_method: {
    title: "Delivery Methods",
    section: "orders",
    description: "How a media deliverable reaches the room.",
    resource: SETTINGS,
    renameTargets: [col("mediaDeliverable", "delivery", inEvent)],
  },
  media_type: {
    title: "Media Types",
    section: "orders",
    description: "Kinds of media deliverables.",
    resource: SETTINGS,
    renameTargets: [col("mediaDeliverable", "mediaType", inEvent)],
  },
  print_distribution: {
    title: "Print Distribution",
    section: "orders",
    description: "How printed items are distributed.",
    resource: SETTINGS,
    renameTargets: [col("printItem", "distributionMethod", (t) => ({ printOrder: inEvent(t) }))],
  },
  equipment_category: {
    title: "Equipment Categories",
    section: "equipment",
    description: "Categories for organizing equipment (e.g., AV, Tables, Chairs).",
    models: true,
    resource: PermissionResource.EQUIPMENT,
    renameTargets: [col("equipment", "category", inTenant)],
  },
  location_type: {
    title: "Location Types",
    section: "storage",
    description: "What a location is (e.g., Shelf, Pallet, Tote, Trailer).",
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

export function isOptionCategory(value: string): value is OptionCategory {
  return Object.hasOwn(OPTION_CATEGORIES, value);
}

// The entry for a category a caller passed in; an unknown one throws, so a
// Server Action can't be pointed at an arbitrary CustomOption.category.
export function optionCategory(category: string): OptionCategoryDef {
  if (!isOptionCategory(category)) throw new Error(`Unknown option category: ${category}`);
  return OPTION_CATEGORIES[category];
}

export const categoriesInSection = (section: OptionSection): OptionCategory[] =>
  CATEGORY_KEYS.filter((c) => OPTION_CATEGORIES[c].section === section);

// Lists whose options merge into one another (every use moves over).
export const MERGEABLE: readonly OptionCategory[] = CATEGORY_KEYS.filter((c) => "mergeable" in OPTION_CATEGORIES[c]);

export function isMergeable(category: OptionCategory): category is HotelLabelCategory {
  return MERGEABLE.includes(category);
}

// Where each list is edited, for messages naming it.
export const LIST_HOMES = Object.fromEntries(
  CATEGORY_KEYS.map((c) => [c, OPTION_SECTIONS[OPTION_CATEGORIES[c].section].home]),
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
// appear too — they are the off-list labels of a strict list.
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
