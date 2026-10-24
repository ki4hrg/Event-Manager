// Field map for ESG Part I (Narrative), sections A–X of the APEX Event
// Specifications Guide. One config drives the Specifications page form, the
// FormData parser, the core's write whitelist, the completeness check and
// the report labels. Labels are short field names, not the template's
// instruction text.
//
// storage "column"    → a real EventSpecification column (structured data)
// storage "narrative" → a key in EventSpecification.narrative (free text)
// Derived entries are read from data the app already holds and are never
// written from this page.

import type { OptionCategory } from "@/lib/optionCategories";

export type EsgFieldKind =
  | "text"
  | "textarea"
  | "richtext"
  | "int"
  | "bool"
  | "date"
  | "datetime"
  | "option"
  | "providedBy"
  | "vendor"
  | "contact"
  | "function";

export type EsgFieldDef = {
  key: string;
  label: string;
  kind: EsgFieldKind;
  storage: "column" | "narrative";
  required?: boolean;
  optionCategory?: OptionCategory;
  hint?: string;
  // Render across the full card width (long text).
  wide?: boolean;
  // A date / datetime start: the field in the same section that can't precede it.
  endKey?: string;
};

export type EsgDerivedSource =
  | "eventName"
  | "eventDates"
  | "primaryFacility"
  | "expectedAttendance"
  | "membership"
  | "keyContacts"
  | "supplierContacts"
  | "emergencyContact"
  | "fbAttendance"
  | "signatories"
  | "housingBlocks"
  | "hotelConcessions"
  | "exhibitBooths";

export type EsgDerivedDef<D extends string = EsgDerivedSource> = {
  source: D;
  label: string;
  required?: boolean;
};

// ESG grids plus the Post-Event Report's (future dates, distribution log).
export const SPEC_GRIDS = ["vips", "shuttles", "transfers", "shipments", "coverage", "keys", "futureDates", "distributions"] as const;
export type SpecGrid = (typeof SPEC_GRIDS)[number];

export type EsgGridRef = { grid: SpecGrid; label: string; required?: boolean };

export type EsgSectionDef<D extends string = EsgDerivedSource> = {
  letter: string;
  title: string;
  // Entry-page jump nav label when the title is long.
  short?: string;
  fields: EsgFieldDef[];
  derived?: EsgDerivedDef<D>[];
  grids?: EsgGridRef[];
};

const col = (key: string, label: string, kind: EsgFieldKind, extra: Partial<EsgFieldDef> = {}): EsgFieldDef => ({
  key,
  label,
  kind,
  storage: "column",
  ...extra,
});
const txt = (key: string, label: string, kind: "text" | "textarea" | "richtext" = "text", extra: Partial<EsgFieldDef> = {}): EsgFieldDef => ({
  key,
  label,
  kind,
  storage: "narrative",
  wide: kind !== "text",
  ...extra,
});

// Header fields ("Date Originated*", "Date Revised*") sit above section A.
export const ESG_HEADER_FIELDS: EsgFieldDef[] = [
  col("dateOriginated", "Date originated", "date", { required: true }),
  col("dateRevised", "Date revised", "date", { required: true }),
];

export const ESG_SECTIONS: EsgSectionDef[] = [
  {
    letter: "A",
    title: "Event Profile",
    derived: [{ source: "eventName", label: "Event name", required: true }],
    fields: [
      txt("hostOrgName", "Organizer / host organization"),
      txt("hostOrgPhone", "Organization phone", "text", { required: true }),
      txt("hostOrgAddress1", "Mailing address line 1", "text", { required: true }),
      txt("hostOrgAddress2", "Mailing address line 2"),
      txt("hostOrgCity", "City", "text", { required: true }),
      txt("hostOrgState", "State / province", "text", { required: true }),
      txt("hostOrgPostalCode", "Postal / ZIP code", "text", { required: true }),
      txt("hostOrgCountry", "Country", "text", { required: true }),
      txt("hostOrgWebsite", "Organization web address"),
      txt("eventWebsite", "Event web address"),
      col("eventType", "Event type", "option", { required: true, optionCategory: "event_type" }),
      col("eventScope", "Event scope", "option", { optionCategory: "event_scope" }),
      col("eventFrequency", "Event frequency", "option", { optionCategory: "event_frequency" }),
      col("isMandatory", "Mandatory for attendees", "bool"),
      col("spousesInvited", "Spouses & guests invited", "bool"),
      col("childrenInvited", "Children invited", "bool"),
      txt("hostOrgOverview", "Organization overview (mission, philosophy)", "richtext"),
      txt("eventObjectives", "Event objectives", "richtext"),
      txt("profileComments", "Other event profile comments", "richtext"),
    ],
  },
  {
    letter: "B",
    title: "Key Dates, Times & Locations",
    short: "Key Dates",
    derived: [
      { source: "eventDates", label: "Published start / end", required: true },
      { source: "primaryFacility", label: "Primary event facility" },
    ],
    fields: [
      col("preMeetingAt", "Pre-event meeting", "datetime", { required: true }),
      txt("preMeetingLocation", "Pre-event meeting location", "text", { required: true }),
      txt("preMeetingAttendees", "Pre-event meeting attendees", "textarea", { required: true }),
      col("postMeetingAt", "Post-event meeting", "datetime", { required: true }),
      txt("postMeetingLocation", "Post-event meeting location", "text", { required: true }),
      txt("postMeetingAttendees", "Post-event meeting attendees", "textarea", { required: true }),
      col("moveInRequired", "Pre-event move-in & set-up required", "bool"),
      txt("moveInScheduleBy", "Move-in schedule provided by", "text", { hint: "e.g. name of contractor" }),
      txt("datesComments", "Other dates & times (e.g. registration hours)", "richtext"),
    ],
  },
  {
    letter: "C",
    title: "Key Event Contacts",
    derived: [
      { source: "keyContacts", label: "Organizer contacts (key staff)", required: true },
      { source: "supplierContacts", label: "Supplier partner contacts" },
    ],
    fields: [txt("contactsComments", "Other event contacts comments", "richtext")],
  },
  {
    letter: "D",
    title: "Attendee Profile",
    derived: [
      { source: "expectedAttendance", label: "Expected total attendance" },
      { source: "membership", label: "Membership" },
    ],
    fields: [
      col("preRegisteredCount", "Pre-registered attendees", "int"),
      col("domesticCount", "Domestic attendees", "int", { hint: "Live in the country where the event is held." }),
      col("internationalCount", "International attendees", "int"),
      txt("attendeeDemographics", "Demographics profile", "richtext"),
      txt("attendeeAccessibility", "Accessibility / special needs", "richtext", { required: true }),
      txt("attendeeComments", "Other attendee profile comments", "richtext"),
    ],
  },
  {
    letter: "E",
    title: "Exhibitor Profile",
    fields: [
      col("exhibitorCount", "Exhibitors attending", "int"),
      col("domesticExhibitors", "Domestic exhibitors", "int"),
      col("internationalExhibitors", "International exhibitors", "int"),
      col("exhibitingCompanies", "Exhibiting companies / organizations", "int"),
      txt("exhibitorDemographics", "Demographics profile", "richtext"),
      txt("exhibitorAccessibility", "Accessibility / special needs", "richtext", { required: true }),
      txt("exhibitorComments", "Other exhibitor profile comments", "richtext"),
    ],
  },
  {
    letter: "F",
    title: "Arrival / Departure",
    fields: [
      txt("majorArrivals", "Major arrivals", "textarea"),
      txt("majorDepartures", "Major departures", "textarea"),
      txt("groupArrivals", "Group arrivals / departures", "textarea"),
      txt("porterage", "Porterage / luggage delivery", "textarea"),
      txt("luggageStorage", "Luggage storage", "textarea"),
      txt("parkingInstructions", "Drive-in & parking instructions", "textarea"),
      txt("flyInInstructions", "Fly-in instructions", "textarea"),
      txt("arrivalComments", "Other arrival / departure comments", "richtext"),
    ],
  },
  {
    letter: "G",
    title: "Housing",
    derived: [{ source: "housingBlocks", label: "Room block(s)", required: true }],
    fields: [
      col("reservationMethod", "Reservation method", "option", { required: true, optionCategory: "reservation_method" }),
      col("thirdPartyHousing", "Third-party housing provider used", "bool"),
      txt("housingProviderName", "Housing provider company"),
      txt("suites", "Suites", "textarea"),
      txt("occupancy", "Double / single occupancy", "textarea"),
      txt("housingAccessibility", "Accessibility / special needs rooms", "richtext", { required: true }),
      txt("amenities", "Amenities", "textarea"),
      txt("inRoomDeliveries", "In-room deliveries", "textarea"),
      txt("roomDrops", "Room drops (outside doors)", "textarea"),
      txt("housingNotes", "Room blocks & other housing comments", "richtext"),
    ],
  },
  {
    letter: "H",
    title: "VIPs",
    fields: [],
    grids: [{ grid: "vips", label: "VIPs" }],
  },
  {
    letter: "I",
    title: "Function Space",
    fields: [
      txt("offsiteVenues", "Off-site venue(s)", "textarea"),
      txt("functionRooms", "Function rooms", "textarea"),
      txt("messageCenter", "Message center", "textarea"),
      txt("offices", "Office(s)", "textarea"),
      txt("registrationAreas", "Registration area(s)", "textarea"),
      txt("lounges", "Lounge(s)", "textarea"),
      txt("speakerReadyRooms", "Speaker ready room(s)", "textarea"),
      txt("pressRoom", "Press room", "textarea"),
      txt("storage", "Storage", "textarea"),
      txt("readerBoardInfo", "General reader board information", "textarea"),
      txt("functionSpaceComments", "Other function space comments", "richtext"),
    ],
  },
  {
    letter: "J",
    title: "Exhibits",
    derived: [{ source: "exhibitBooths", label: "Booths" }],
    fields: [
      col("masterExhibitFunctionId", "Exhibit function", "function"),
      txt("exhibitLocation", "Location(s) of exhibits"),
      txt("exhibitorRegLocation", "Exhibitor registration location(s)"),
      col("grossSqFt", "Gross square feet", "int"),
      col("netSqFt", "Net square feet", "int"),
      col("rulesAttached", "Exhibit rules & regulations attached", "bool"),
      txt("showHours", "Show dates & hours", "textarea"),
      txt("storageNeeds", "Storage needs", "textarea"),
      col("povDeliveries", "Anticipated POV deliveries", "int"),
      col("exhibitorMoveInStart", "Exhibitor move-in begins", "datetime", { endKey: "exhibitorMoveInEnd" }),
      col("exhibitorMoveInEnd", "Exhibitor move-in ends", "datetime"),
      col("exhibitorMoveOutStart", "Exhibitor move-out begins", "datetime", { endKey: "exhibitorMoveOutEnd" }),
      col("exhibitorMoveOutEnd", "Exhibitor move-out ends", "datetime"),
      col("contractorMoveInStart", "Service contractor move-in begins", "datetime", { endKey: "contractorMoveInEnd" }),
      col("contractorMoveInEnd", "Service contractor move-in ends", "datetime"),
      col("contractorMoveOutStart", "Service contractor move-out begins", "datetime", { endKey: "contractorMoveOutEnd" }),
      col("contractorMoveOutEnd", "Service contractor move-out ends", "datetime"),
      txt("exhibitsComments", "Other exhibits comments", "richtext"),
    ],
  },
  {
    letter: "K",
    title: "Utilities",
    fields: [txt("utilitiesNotes", "Engineering, rigging, electrical, water, telecommunications", "richtext")],
  },
  {
    letter: "L",
    title: "Safety, Security & First Aid",
    short: "Safety & Security",
    derived: [{ source: "emergencyContact", label: "Organizer contact in case of emergency / crisis", required: true }],
    fields: [
      txt("medicalInstructions", "Medical / emergency instructions", "richtext", { required: true }),
      txt("crisisInstructions", "Crisis & emergency instructions", "richtext", { required: true }),
      txt("commsProtocol", "On-site communications protocol", "richtext", { required: true }),
      col("securityProvider", "General security / surveillance", "providedBy"),
      col("securityVendorId", "Security vendor", "vendor"),
      col("firstAidProvider", "First-aid services", "providedBy"),
      col("firstAidVendorId", "First-aid vendor", "vendor"),
      txt("vipMovements", "VIP and/or police escorted movements", "textarea"),
      txt("securityComments", "Other security comments", "richtext"),
    ],
    grids: [
      { grid: "coverage", label: "Security & first-aid coverage" },
      { grid: "keys", label: "Keys" },
    ],
  },
  {
    letter: "M",
    title: "Food & Beverage",
    derived: [{ source: "fbAttendance", label: "Catered F&B total expected attendance", required: true }],
    fields: [
      txt("fbSpecialRequirements", "Special requirements", "richtext", { required: true }),
      txt("onsiteFb", "On-site F&B description", "textarea"),
      txt("offsiteFb", "Off-site F&B description", "textarea"),
      txt("outletUsage", "Anticipated outlet / concession usage", "textarea"),
      txt("fbComments", "Other food & beverage comments", "richtext"),
    ],
  },
  {
    letter: "N",
    title: "Special Activities",
    fields: [
      txt("recreational", "Recreational activities", "textarea"),
      txt("guestPrograms", "Guest programs", "textarea"),
      txt("tours", "Tours", "textarea"),
      txt("prePostPrograms", "Pre- & post-event programs", "textarea"),
      txt("entertainment", "Entertainment", "textarea"),
      txt("childrensPrograms", "Children's programs", "textarea"),
      txt("specialActivitiesComments", "Other special activities comments", "richtext"),
    ],
  },
  {
    letter: "O",
    title: "Audio / Visual",
    fields: [txt("avNotes", "Special A/V issues or situations", "richtext")],
  },
  {
    letter: "P",
    title: "Transportation",
    fields: [
      col("attendeeShuttle", "Attendee shuttle provided", "bool", { required: true }),
      col("transportationVendorId", "Transportation provider", "vendor"),
      col("offsiteShuttles", "Shuttles for off-site events", "bool"),
      txt("transportationComments", "Other transportation comments", "richtext"),
    ],
    grids: [
      { grid: "shuttles", label: "Shuttle routes" },
      { grid: "transfers", label: "Off-site function transfers" },
    ],
  },
  {
    letter: "Q",
    title: "In Conjunction With (ICW) Groups",
    short: "ICW Groups",
    fields: [txt("icwGroups", "ICW groups, contacts and rules", "richtext")],
  },
  {
    letter: "R",
    title: "Media / Press",
    fields: [txt("mediaPress", "Media / press arrangements", "richtext")],
  },
  {
    letter: "S",
    title: "Shipping / Receiving",
    short: "Shipping",
    fields: [
      txt("outboundShipping", "Expected outbound shipping requirements", "richtext", { required: true }),
      txt("dockUsage", "Dock usage", "textarea"),
      txt("freightElevator", "Freight elevator usage", "textarea"),
      txt("drayageBy", "Drayage handled by"),
      txt("shippingComments", "Other shipping / receiving comments", "richtext"),
    ],
    grids: [{ grid: "shipments", label: "Shipments", required: true }],
  },
  {
    letter: "T",
    title: "Housekeeping",
    fields: [txt("housekeeping", "Housekeeping instructions", "richtext")],
  },
  {
    letter: "U",
    title: "Front Desk",
    fields: [txt("frontDesk", "Front desk instructions", "richtext")],
  },
  {
    letter: "V",
    title: "Other Requirements",
    fields: [txt("otherRequirements", "Other requirements", "richtext")],
  },
  {
    letter: "W",
    title: "Billing Instructions",
    short: "Billing",
    derived: [{ source: "hotelConcessions", label: "Hotel concessions" }],
    fields: [
      col("finalBillContactId", "Final bill to be provided to", "contact", { required: true }),
      txt("finalBillAddress", "Final bill to be sent to (mailing address)", "textarea", { required: true }),
      txt("concessions", "Special concessions & negotiated items / services", "richtext", { required: true }),
      txt("onSiteBillReview", "On-site bill review instructions", "richtext"),
      txt("thirdPartyBilling", "Third-party billing instructions", "richtext"),
      col("taxExempt", "Group is tax-exempt", "bool", { required: true }),
      txt("taxExemptId", "Tax-exempt ID #"),
      col("roomTaxToMaster", "Room & tax to master", "bool", { required: true }),
      col("incidentalsToMaster", "Incidentals to master", "bool", { required: true }),
      col("guestsPayOwn", "Guests pay on own", "bool", { required: true }),
    ],
  },
  {
    letter: "X",
    title: "Authorized Signatories",
    short: "Signatories",
    derived: [{ source: "signatories", label: "Signatories (key staff with an approval authority)", required: true }],
    fields: [],
  },
];

export const ESG_SECTION_LETTERS = ESG_SECTIONS.map((s) => s.letter);

export function getEsgSection(letter: string): EsgSectionDef | undefined {
  return ESG_SECTIONS.find((s) => s.letter === letter);
}

// Every writable field, for the core's whitelist.
export const ESG_WRITABLE_FIELDS: EsgFieldDef[] = [...ESG_HEADER_FIELDS, ...ESG_SECTIONS.flatMap((s) => s.fields)];

// Grid columns. Kinds reuse EsgFieldKind; "function" picks one of the
// event's functions.
// `endKey` marks a start column and names the column that can't precede it.
// A sequence chains them, each column to the next (departure → drop-off → return).
export type SpecGridColumn = { key: string; label: string; kind: EsgFieldKind; required?: boolean; endKey?: string };

export const SPEC_GRID_COLUMNS: Record<SpecGrid, SpecGridColumn[]> = {
  vips: [
    { key: "name", label: "Name", kind: "text", required: true },
    { key: "title", label: "Title", kind: "text" },
    { key: "employer", label: "Employer", kind: "text" },
    { key: "arrivalAt", label: "Arrival", kind: "datetime", endKey: "departureAt" },
    { key: "departureAt", label: "Departure", kind: "datetime" },
    { key: "amenities", label: "Amenities", kind: "text" },
    { key: "upgrades", label: "Upgrades", kind: "text" },
    { key: "relationship", label: "Relationship to event", kind: "text" },
    { key: "comments", label: "Comments", kind: "text" },
  ],
  shuttles: [
    { key: "routeName", label: "Route", kind: "text", required: true },
    { key: "startAt", label: "Start", kind: "datetime", endKey: "endAt" },
    { key: "endAt", label: "End", kind: "datetime" },
    { key: "frequency", label: "Frequency", kind: "text" },
  ],
  transfers: [
    { key: "label", label: "Off-site function", kind: "text", required: true },
    { key: "functionId", label: "Linked function", kind: "function" },
    { key: "departureLocation", label: "Departure location", kind: "text" },
    { key: "departureAt", label: "Departure", kind: "datetime", endKey: "dropoffAt" },
    { key: "dropoffLocation", label: "Drop-off location", kind: "text" },
    { key: "dropoffAt", label: "Drop-off", kind: "datetime", endKey: "returnAt" },
    { key: "returnLocation", label: "Return location", kind: "text" },
    { key: "returnAt", label: "Return", kind: "datetime" },
    { key: "provider", label: "Provider", kind: "text" },
  ],
  shipments: [
    { key: "fromText", label: "From (contact & address)", kind: "text" },
    { key: "toText", label: "To (contact & address)", kind: "text" },
    { key: "shipper", label: "Shipper", kind: "text" },
    { key: "itemCount", label: "# of items", kind: "int" },
    { key: "expectedDelivery", label: "Expected delivery", kind: "date" },
  ],
  coverage: [
    { key: "kind", label: "Service", kind: "option", required: true },
    { key: "location", label: "Location", kind: "text" },
    { key: "startAt", label: "Start", kind: "datetime", endKey: "endAt" },
    { key: "endAt", label: "End", kind: "datetime" },
  ],
  keys: [
    { key: "location", label: "Location", kind: "text" },
    { key: "functionId", label: "Function", kind: "function" },
    { key: "startAt", label: "Start", kind: "datetime", endKey: "endAt" },
    { key: "endAt", label: "End", kind: "datetime" },
    { key: "quantity", label: "# of keys", kind: "int" },
    { key: "rekeyed", label: "Re-keyed", kind: "bool" },
  ],
  futureDates: [
    { key: "startDate", label: "Start", kind: "date", endKey: "endDate" },
    { key: "endDate", label: "End", kind: "date" },
    { key: "facility", label: "Facility", kind: "text" },
    { key: "city", label: "City", kind: "text" },
    { key: "state", label: "State / province", kind: "text" },
    { key: "country", label: "Country", kind: "text" },
    { key: "comments", label: "Comments", kind: "text" },
  ],
  distributions: [
    { key: "action", label: "Report", kind: "option", required: true },
    { key: "actionDate", label: "Date", kind: "date" },
    { key: "byName", label: "By (full name)", kind: "text" },
    { key: "byTitle", label: "Title", kind: "text" },
    { key: "byEmployer", label: "Employer", kind: "text" },
    { key: "method", label: "Delivered via", kind: "text" },
    { key: "deliveredOn", label: "Delivered on", kind: "date" },
    { key: "recipients", label: "Recipients (name, title, employer — one per line)", kind: "textarea" },
  ],
};

export const DISTRIBUTION_ACTIONS = [
  { value: "COMPLETED", label: "Completed" },
  { value: "REVISED", label: "Revised" },
] as const;

export const COVERAGE_KINDS = [
  { value: "SECURITY", label: "Security / surveillance" },
  { value: "FIRST_AID", label: "First aid" },
] as const;
