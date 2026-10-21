// Field map for the APEX Post-Event Report (sections I–IX). Same shape as the
// ESG config (src/lib/esg/fields.ts): drives the Post-Event page, the core's
// whitelist and the report. Expected / actual attendance and membership are
// Event fields; housing comes through the hotels seam.

import type { EsgFieldDef, EsgFieldKind, EsgSectionDef } from "@/lib/esg/fields";

export type PerDerivedSource =
  | "eventSummary"
  | "attendance"
  | "lastOccurrence"
  | "keyContacts"
  | "housingSummary"
  | "roomBlocks"
  | "fbSchedule"
  | "largestFb"
  | "largestFunction"
  | "breakouts"
  | "exhibitSummary"
  | "nextInSeries";

const col = (key: string, label: string, kind: EsgFieldKind, extra: Partial<EsgFieldDef> = {}): EsgFieldDef => ({
  key,
  label,
  kind,
  storage: "column",
  ...extra,
});
const txt = (key: string, label: string, kind: "text" | "textarea" | "richtext" = "richtext", extra: Partial<EsgFieldDef> = {}): EsgFieldDef => ({
  key,
  label,
  kind,
  storage: "narrative",
  wide: kind !== "text",
  ...extra,
});

export const PER_SECTIONS: EsgSectionDef<PerDerivedSource>[] = [
  {
    letter: "I",
    title: "Event Information",
    short: "Event",
    derived: [
      { source: "eventSummary", label: "Event", required: true },
      { source: "attendance", label: "Attendance", required: true },
      { source: "lastOccurrence", label: "Last time the event occurred" },
    ],
    fields: [
      col("primaryFacilityType", "Primary event facility type", "option", { required: true, optionCategory: "per_facility_type" }),
      col("offsiteVenueUsed", "Off-site venue(s) used", "bool"),
      col("onSiteRegistrations", "Total on-site registrations", "int"),
      col("noShows", "No-shows", "int"),
      col("exhibitorsAttending", "Exhibitors attending", "int"),
      col("domesticAttendees", "Domestic attendees", "int"),
      col("internationalAttendees", "International attendees", "int"),
      col("shuttleProvided", "Shuttle service provided for attendees", "bool"),
      col("usedDmcPco", "Used a DMC or PCO", "bool"),
      col("guestPrograms", "Guest tours / programs offered", "bool"),
      txt("eventInfoComments", "Event information comments (circumstances that affected attendance)"),
    ],
  },
  {
    letter: "II",
    title: "Contact Information",
    short: "Contacts",
    derived: [{ source: "keyContacts", label: "Event contacts", required: true }],
    fields: [],
  },
  {
    letter: "III",
    title: "Hotel Room Information",
    short: "Hotel Rooms",
    derived: [{ source: "housingSummary", label: "From the Hotels module" }],
    fields: [
      col("usedSleepingRooms", "Event used sleeping rooms", "bool", { required: true }),
      col("hotelCount", "Number of hotels used", "int"),
      col("peakNightRooms", "Total rooms used on peak night", "int"),
      col("housingPerformedBy", "Housing services performed by", "option", { optionCategory: "per_housing_provider" }),
      txt("housingFirmName", "Management firm / housing bureau name", "text"),
      txt("hotelComments", "Hotel room comments"),
    ],
  },
  {
    letter: "IV",
    title: "Room Block Information",
    short: "Room Blocks",
    derived: [{ source: "roomBlocks", label: "Room blocks by hotel" }],
    fields: [txt("roomBlockComments", "Room block comments (per hotel, HQ first: contracted vs final block, cut-off, pick-up)")],
  },
  {
    letter: "V",
    title: "Food & Beverage Information",
    short: "Food & Beverage",
    derived: [
      { source: "fbSchedule", label: "F&B function schedule (# held / # guar / # fed)" },
      { source: "largestFb", label: "Largest F&B function" },
    ],
    fields: [
      col("icwFunctions", "In conjunction with (ICW) F&B functions", "bool"),
      txt("icwFbNotes", "ICW F&B functions", "textarea"),
      txt("fbComments", "F&B comments (green meetings provisions, food bank donations, …)"),
    ],
  },
  {
    letter: "VI",
    title: "Function Space Information",
    short: "Function Space",
    derived: [
      { source: "largestFunction", label: "Largest function" },
      { source: "breakouts", label: "Concurrent breakout sessions" },
    ],
    fields: [
      col("largestFunctionAvSetup", "A/V set-up for the largest function", "option", { optionCategory: "per_av_setup" }),
      col("extensiveAvRooms", "Rooms with extensive A/V or technology requirements", "int"),
      col("registrationAreas", "Registration areas", "int"),
      col("lounges", "Lounges", "int"),
      col("offices", "Offices", "int"),
      col("moveInDays", "Move-in days", "int"),
      col("moveOutDays", "Move-out days", "int"),
      col("teardownDays", "Tear-down days", "int"),
      txt("utilitiesRequired", "Function space utilities required", "textarea"),
      txt("functionSpaceComments", "Function space comments"),
    ],
  },
  {
    letter: "VII",
    title: "Exhibit Space Information",
    short: "Exhibit Space",
    derived: [{ source: "exhibitSummary", label: "Exhibits" }],
    fields: [
      col("gscUsed", "General service contractor (GSC) used", "bool"),
      col("gscMoveInDays", "GSC move-in days", "int"),
      col("exhibitorsWithFb", "Exhibitors that required F&B", "int"),
      col("extensiveAvExhibitors", "Exhibitors with extensive A/V or technology requirements", "int"),
      txt("exhibitComments", "Exhibit space comments"),
    ],
  },
  {
    letter: "VIII",
    title: "Future Event Dates",
    derived: [{ source: "nextInSeries", label: "Next event in this series" }],
    fields: [
      col("futureDatesConfirmed", "Future dates confirmed", "bool", { required: true }),
      txt("nextOpenDate", "Next open date", "text"),
      txt("futureDatesComments", "Future dates comments"),
    ],
    grids: [{ grid: "futureDates", label: "Future dates" }],
  },
  {
    letter: "IX",
    title: "Report Distribution Tracking",
    short: "Distribution",
    fields: [],
    grids: [{ grid: "distributions", label: "Completed / revised and delivered to", required: true }],
  },
];

export const PER_SECTION_LETTERS = PER_SECTIONS.map((s) => s.letter);
export const PER_WRITABLE_FIELDS: EsgFieldDef[] = PER_SECTIONS.flatMap((s) => s.fields);

export function getPerSection(letter: string) {
  return PER_SECTIONS.find((s) => s.letter === letter);
}

export const PER_ATTRIBUTION =
  "Based on the APEX Post-Event Report. Copyright © 2003 by Convention Industry Council (now Events Industry Council). Refer to the on-line version of this report, located at www.conventionindustry.org for the most up-to-date content.";
