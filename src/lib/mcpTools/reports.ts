import { PermissionResource } from "@prisma/client";
import { requirePermissionForUser } from "@/lib/permissions";
import {
  getEsgData,
  getPostEventReportData,
  getEquipmentResponsibilityData,
  getEventProfileData,
  getOrderAssignedVendors,
  getVendorHandoffData,
  getRoomScheduleData,
  getFunctionDetailData,
  getFunctionPickerOptions,
  getBreakoutScheduleData,
  getBreakoutGroupOptions,
  getEventScheduleData,
  getPackingListData,
} from "@/app/events/reports/data";
import type { McpToolDefinition } from "./types";
import { optionalStringArray, requireString } from "./types";

// The underlying report actions are deliberately auth-free (reused by the
// unauthenticated /share/[token] route per the carve-out documented in
// CLAUDE.md). MCP callers always have a resolved user identity, so each
// wrapper gates access with requirePermissionForUser(EVENTS, VIEW, eventId)
// before delegating.
async function gate(userId: string, eventId: string) {
  await requirePermissionForUser(userId, PermissionResource.EVENTS, "VIEW", eventId);
}

const eventOnlySchema = {
  type: "object" as const,
  properties: { eventId: { type: "string" } },
  required: ["eventId"],
  additionalProperties: false,
};

export const reportTools: McpToolDefinition[] = [
  {
    name: "get_equipment_responsibility_report",
    description:
      "Aggregated equipment list across all order types and exhibit booths (booth-group inventory counted once per booth), grouped by responsible vendor/contact (provider/operator). Mirrors the Equipment Responsibility report.",
    inputSchema: eventOnlySchema,
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      await gate(userId, eventId);
      return getEquipmentResponsibilityData(eventId);
    },
  },
  {
    name: "get_event_profile_report",
    description:
      "Full event profile: key staff, functions, breakout groups, catering, print, schedule. Mirrors the Event Profile report.",
    inputSchema: eventOnlySchema,
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      await gate(userId, eventId);
      return getEventProfileData(eventId);
    },
  },
  {
    name: "get_order_assigned_vendors",
    description:
      "List of vendors that are assigned to at least one order on the event (including print orders and print item designer/printer) or provide/operate exhibit booth equipment. Useful as a picker for vendor-scoped reports.",
    inputSchema: eventOnlySchema,
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      await gate(userId, eventId);
      return getOrderAssignedVendors(eventId);
    },
  },
  {
    name: "get_vendor_handoff_report",
    description:
      "Vendor-facing report: every order on the event that vendor is on (catering, AV, setup, supply, print), the exhibit booths and booth groups whose equipment it provides or operates, plus per-item responsibility. Mirrors the Vendor Handoff report.",
    inputSchema: {
      type: "object",
      properties: { eventId: { type: "string" }, vendorId: { type: "string" } },
      required: ["eventId", "vendorId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      const vendorId = requireString(args, "vendorId");
      await gate(userId, eventId);
      return getVendorHandoffData(eventId, vendorId);
    },
  },
  {
    name: "get_room_schedule_report",
    description:
      "Room-by-room schedule across the event. Mirrors the Room Schedule report.",
    inputSchema: eventOnlySchema,
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      await gate(userId, eventId);
      return getRoomScheduleData(eventId);
    },
  },
  {
    name: "get_function_detail_report",
    description:
      "Per-function detail including linked orders, presentations, workflow status. Mirrors the Function Detail report.",
    inputSchema: eventOnlySchema,
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      await gate(userId, eventId);
      return getFunctionDetailData(eventId);
    },
  },
  {
    name: "get_esg_report",
    description:
      "APEX Event Specifications Guide for the event as a normalized document: Part I narrative (sections A–X), Part II function schedule (times in US & military, function #, facility, room, set-up, set for, posting, 24-hour hold) and Part IIIa set-up orders per function. Mirrors the ESG report.",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        parts: { type: "array", items: { type: "string", enum: ["I", "II", "IIIa", "IIIb"] }, description: "Default: all." },
        days: { type: "array", items: { type: "string" }, description: "YYYY-MM-DD in event timezone." },
        functionIds: { type: "array", items: { type: "string" }, description: "Limit Part IIIa set-up orders." },
        showBlank: { type: "boolean", description: "Include empty template fields. Default false." },
        includeBilling: { type: "boolean", description: "Include §W billing / §X signatories and per-function billing. Default true." },
      },
      required: ["eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      await gate(userId, eventId);
      const data = await getEsgData(eventId, {
        parts: optionalStringArray(args, "parts").filter((p): p is "I" | "II" | "IIIa" | "IIIb" => ["I", "II", "IIIa", "IIIb"].includes(p)),
        days: optionalStringArray(args, "days"),
        functionIds: optionalStringArray(args, "functionIds"),
        showBlank: args.showBlank === true,
        includeBilling: args.includeBilling !== false,
      });
      return data?.document ?? null;
    },
  },
  {
    name: "get_post_event_report",
    description:
      "APEX Post-Event Report for the event as assembled sections I–IX (event information with attendance and % of membership, contacts, hotel rooms, room blocks, F&B # held / # guar / # fed, function space, exhibits, future dates, distribution log). Mirrors the Post-Event Report.",
    inputSchema: {
      type: "object",
      properties: { eventId: { type: "string" }, showBlank: { type: "boolean" } },
      required: ["eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      await gate(userId, eventId);
      return getPostEventReportData(eventId, { showBlank: args.showBlank === true });
    },
  },
  {
    name: "get_function_picker_options",
    description:
      "Compact list of functions on the event ({ value, label, functionNumber, typeValue, typeLabel, firstStart }) — picker source for filtering. `label` carries the ESG number prefix (\"#12 · Name\") when one is assigned.",
    inputSchema: eventOnlySchema,
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      await gate(userId, eventId);
      return getFunctionPickerOptions(eventId);
    },
  },
  {
    name: "get_breakout_schedule_report",
    description:
      "Breakout-session grid: groups → sessions → room/presentation assignments. Mirrors the Breakout Schedule report.",
    inputSchema: eventOnlySchema,
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      await gate(userId, eventId);
      return getBreakoutScheduleData(eventId);
    },
  },
  {
    name: "get_breakout_group_options",
    description:
      "Compact list of breakout groups on the event ({ id, name }) — picker source.",
    inputSchema: eventOnlySchema,
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      await gate(userId, eventId);
      return getBreakoutGroupOptions(eventId);
    },
  },
  {
    name: "get_event_schedule_report",
    description:
      "Event-wide chronological schedule across functions, presentations, and schedule items.",
    inputSchema: eventOnlySchema,
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      await gate(userId, eventId);
      return getEventScheduleData(eventId);
    },
  },
  {
    name: "get_packing_list_report",
    description:
      "Destination-centric packing list: every supply and print item on the event grouped room -> order, with packing status (NEEDED/IN_TRANSIT/DELIVERED), acquisition state (ON_HAND/TO_PROCURE/DROP_SHIP), a counts summary, and a procurement rollup of everything still TO_PROCURE grouped by provider. Optional filters narrow by room id (\"__blank__\" for no room), packing status, acquisition state, provider label (\"__blank__\" for none), and hidePacked (drops anything past NEEDED). Mirrors the Packing List report.",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        rooms: { type: "array", items: { type: "string" } },
        packingStatuses: { type: "array", items: { type: "string" } },
        acquisitionStates: { type: "array", items: { type: "string" } },
        providers: { type: "array", items: { type: "string" } },
        hidePacked: { type: "boolean" },
      },
      required: ["eventId"],
      additionalProperties: false,
    },
    handler: async (args, { userId }) => {
      const eventId = requireString(args, "eventId");
      await gate(userId, eventId);
      return getPackingListData(eventId, {
        rooms: optionalStringArray(args, "rooms"),
        packingStatuses: optionalStringArray(args, "packingStatuses"),
        acquisitionStates: optionalStringArray(args, "acquisitionStates"),
        providers: optionalStringArray(args, "providers"),
        hidePacked: args.hidePacked === true,
      });
    },
  },
];
