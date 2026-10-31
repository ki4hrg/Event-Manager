import { z } from "zod";
import { SHARE_REPORT_TYPES, type ShareReportType } from "@/lib/reportRegistry";
import type { ShareLinkFilters } from "@/lib/shareLinks";

// What a share link or dashboard item may store. The filters are written by a
// signed-in sharer and read by the public /share pages, which cast them to
// ShareLinkFilters; so each report type keeps only the keys its share view
// reads (unknown keys are dropped) and refuses a key of the wrong shape.

// Ids, labels, dates and enum values: short strings, never a nested object.
const value = z.string().max(200);
const list = z.array(value).max(1000);
const flag = z.boolean();

const FILTER_SCHEMAS = {
  EVENT_PROFILE: z.object({ days: list, sections: list, types: list }),
  EVENT_SCHEDULE: z.object({ types: list, includeNonPublic: flag, compact: flag }),
  ROOM_SCHEDULE: z.object({ days: list, rooms: list, usedOnly: flag }),
  FUNCTION_DETAIL: z.object({ functionIds: list }),
  BREAKOUT_GRID: z.object({ breakoutGroupIds: list }),
  BREAKOUT_ASSIGNMENTS: z.object({ breakoutGroupIds: list }),
  EQUIPMENT_RESPONSIBILITY: z.object({ vendorIds: list, modelTypes: list }),
  PACKING_LIST: z.object({
    rooms: list,
    packingStatuses: list,
    acquisitionStates: list,
    providers: list,
    hidePacked: flag,
  }),
  VENDOR_HANDOFF: z.object({ vendorId: value }),
  ESG: z.object({ parts: list, days: list, functionIds: list, showBlank: flag, includeBilling: flag }),
  POST_EVENT: z.object({ showBlank: flag }),
  HOTEL_INFO: z.object({ guestTypes: list }),
} satisfies Record<ShareReportType, z.ZodObject>;

// Event, dashboard and item ids as a client sends them.
export const shareLinkIdSchema = z.string().min(1).max(100);

export const shareReportTypeSchema = z.enum(SHARE_REPORT_TYPES);

/** The report's filters with every key optional, unknown keys dropped. */
export function shareLinkFiltersSchema(reportType: ShareReportType): z.ZodType<ShareLinkFilters> {
  return FILTER_SCHEMAS[reportType].partial();
}

export const shareLinkLabelSchema = z
  .string()
  .trim()
  .max(200)
  .nullish()
  .transform((s) => s || null);

// A date input's value ("2026-11-30") or an ISO timestamp; empty means never.
export const shareLinkExpirySchema = z
  .string()
  .max(40)
  .nullish()
  .transform((s, ctx) => {
    if (!s) return null;
    const date = new Date(s);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: "custom", message: "Not a date" });
      return z.NEVER;
    }
    return date;
  });
