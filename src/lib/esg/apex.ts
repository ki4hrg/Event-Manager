// Fixed APEX keys that tenant-editable CustomOption lists map onto through
// CustomOption.group. Labels stay free for admins to rename; ESG / PER grids
// bucket on these keys instead.

export const MEAL_BUCKETS = [
  { value: "CONTINENTAL", label: "Continental breakfast" },
  { value: "BREAKFAST", label: "Breakfast" },
  { value: "BRUNCH", label: "Brunch" },
  { value: "LUNCH", label: "Lunch" },
  { value: "DINNER", label: "Dinner" },
  { value: "BREAK", label: "Break" },
  { value: "RECEPTION", label: "Reception" },
  { value: "HOSPITALITY", label: "Hospitality" },
] as const;

export type MealBucket = (typeof MEAL_BUCKETS)[number]["value"];

export const SCHEDULE_ROLES = [
  { value: "SETUP", label: "Set up by" },
  { value: "TEARDOWN", label: "Dismantle no later than" },
] as const;

export type ScheduleRole = (typeof SCHEDULE_ROLES)[number]["value"];

// Function-type group: which ESG §I function-space line a function of that type
// is listed under. Untagged types count as function rooms.
export const FUNCTION_SPACES = [
  { value: "REGISTRATION", label: "Registration area" },
  { value: "OFFICE", label: "Office" },
  { value: "SPEAKER_READY", label: "Speaker ready room" },
  { value: "PRESS", label: "Press room" },
  { value: "LOUNGE", label: "Lounge" },
  { value: "MESSAGE_CENTER", label: "Message center" },
  { value: "STORAGE", label: "Storage" },
] as const;

export type FunctionSpace = (typeof FUNCTION_SPACES)[number]["value"];

export const PROVIDED_BY_LABELS = {
  NOT_REQUIRED: "Not required",
  GROUP: "Group to provide",
  VENUE: "Venue to provide",
  OUTSIDE_VENDOR: "Outside vendor to provide",
} as const;

export const APEX_ATTRIBUTION =
  "Based on the APEX Event Specifications Guide. Copyright © 2004, 2005 by Convention Industry Council (now Events Industry Council).";
