import { PermissionResource } from "@prisma/client";
import { requirePermissionForUser } from "@/lib/permissions";
import {
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
} from "@/app/events/reports/actions";
import type { McpToolDefinition } from "./types";
import { requireString } from "./types";

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
      "Aggregated equipment list across all order types, grouped by responsible vendor/contact (provider/operator). Mirrors the Equipment Responsibility report.",
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
      "List of vendors that are assigned to at least one order on the event. Useful as a picker for vendor-scoped reports.",
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
      "Vendor-facing report: every order on the event that vendor is on, plus per-item responsibility. Mirrors the Vendor Handoff report.",
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
    name: "get_function_picker_options",
    description:
      "Compact list of functions on the event ({ value, label, typeValue, typeLabel, firstStart }) — picker source for filtering.",
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
];
