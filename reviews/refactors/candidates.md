# Refactor candidates

Parking lot for refactors flagged during a `/simplify` (or ad-hoc) review pass that are real and worth doing but too big to bundle with the change in flight. Processed during periodic refactor sweeps.

Format: `- [area] one-line description (file references, originating PR/commit if useful)`

## Open

### Small, no decision needed

- [types] `"BREAKOUT_BLOCK"` is a magic string in 18 files (38 occurrences). Extract `const FUNCTION_TYPE = { BREAKOUT_BLOCK: "BREAKOUT_BLOCK", ... } as const` (or a `FunctionType` union) and migrate; the schema column stays a free `String`.
- [buttons] `src/lib/buttonStyles.ts` has no small-primary variant; `px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700` (and near-variants, ±`disabled:opacity-50`) is inlined ~80 times across ~50 files. Add `btnPrimarySm` next to `btnDangerSm` and migrate in one mechanical pass. (moved from claudemd/candidates.md)
- [dnd] `src/app/settings/OptionList.tsx` still uses a bare `PointerSensor` on whole rows; switch to `MouseSensor` + `TouchSensor` (press delay) like `BreakoutGrid.tsx` and the agenda grid, unless it moves to a `touch-none` grip (the agenda room-reorder grip keeps `PointerSensor`). (moved from claudemd/candidates.md)
- [config-pages] `/equipment` is gridded (`EquipmentList.tsx:142`); `/settings/*` (OptionList cards two-up — rows must stay vertical, they use `verticalListSortingStrategy`) and `/storage-locations/*` are still single-column stacks. (found in the 2026-08-24 Chrome design pass)
- [venues] `src/app/hotels/HotelHistory.tsx` still duplicates `RfpHistoryPanel` on the venue page — fold it in (proposals without an RFP as their own rows).
- [ui] Underline tab-link style is hand-rolled in ~15 places (`RfpTabs`, `DateTabs`, `SpecDocHeader`, `InboxOfferTabs`, `UsersTabs`, `EquipmentTabs`, `StorageLocationTabs`, the `[id]/forms` and `[id]/rfps` strips, `hotels/reports`, `SettingsTabs`); extract a shared `TabLink` (or widen `src/components/DetailTabs.tsx`).
- [rfps] Hotel and vendor RFP detail pages (`[id]/hotels/rfps/[rfpId]/page.tsx`, `[id]/rfps/[rfpId]/page.tsx`) still duplicate the reply-to card, files panel and action closures.
- [components] Add an `editable` prop to `src/components/RichTextEditor.tsx` so read-only views stop swapping in a stored-HTML render (`RfpForm`, `SpecFieldInput`).
- [autosave] Form-ref + payload + version wiring around `useAutosave` is now copied in 11 forms (`RfpForm`, the four `Rfp*Editor`s, `SpecSectionCard`, `SpecGridTable` RowEditor, `FunctionEsgCard`, `VendorQuoteForm`, `ProposalForm`, `BlockForm`); candidate `useFormAutosave(action)` hook in `src/lib/`.
- [hotels] `getPickupPattern` (`src/app/hotels/actions.ts`) reads the active tenant via `hotelSession`; the RFP document/fill call it from event pages where the active tenant matches the event. A tenant-explicit plain loader would remove that coupling. (RFP PR)
- [uploads] The staff upload route (`src/app/api/upload/route.ts`) trusts the client MIME type and stores under the client's extension; reuse `sniffPublicUpload` (widened to the staff allowlist: gif, doc/xls/ppt, text, csv, eml/msg) so the stored type comes from the bytes. Files are served `attachment` + `nosniff`, so this is hardening, not an open hole.

### Waiting on a third occurrence

- [vendors] `VendorPanel.tsx` and `VendorLinkControl.tsx` both derive `unassignedVendors` and render a "Select vendor..." `<select>`. At a third occurrence, extract `getUnassignedVendors()` in `src/app/vendors/vendor-utils.ts` and a `<VendorAddDropdown>` primitive. (commit 4c34e19)
- [icons] Two inline chevron-down SVGs: `AdminDropdown.tsx`, `GroupTabsClient.tsx`. At a third, extract `<ChevronDownIcon />` in `src/components/ui/`.
- [docx] The shared docx primitives live in `src/lib/esg/renderDocx.ts` and are imported by `src/lib/rfp/renderDocx.ts`; move them to a neutral `src/lib/docx.ts` if a third document type appears (RFP PR)

### Needs a decision first

- [mobile-toolbars] The list-page toolbar (title + ViewToggle + filter selects + actions) is copy-pasted across FunctionList, AVOrderList, SetupOrderList, PrintOrderList, CateringOrderList, MediaDeliverableList, SupplyOrderList, PresentationList and ScheduleItemList, and the copies have drifted. Extract a shared `ListToolbar` carrying the reports' "Show filters / N active" mobile collapse. UX call: adopt the reports' collapse on list pages or just unify the wrap behavior. (2026-08-24 Chrome design pass)
- [report-styles] `reportOrderCard` already includes `print:break-inside-avoid`, but the class is still appended inline 27 times across 13 files and `reportSectionCard` has none. Decide per report whether section cards should avoid breaks (RoomSchedule deliberately uses `print:break-after-page`), then fold the default into the shared class. (vendor-handoff page-break fix)
- [packing-status-pill] `PACKING_STATUS_CLASS` / `PACKING_STATUS_LABEL` lookups are hand-rendered in 8 components with three UX shapes (select in `SupplyOrderItemPanel`, badge in `PrintItemPanel`, tap-to-cycle in `PackingListClient`, plus `PackingStatusPanel`, `PackingStatusRollup`). Design `<PackingStatusPill variant="select" | "badge" | "cycle">`. (Packing List rollout)
- [supply-orders-naming] `SupplyOrder` names its junctions `functions` / `presentations` (`prisma/schema.prisma:1741-1742`); every other order type uses `functionLinks` / `presentationLinks`. Rename (relation-field rename only, but touches ~7 call sites plus MCP tools). (Function Detail / Equipment Responsibility SupplyOrder wiring) Renaming also changes MCP tool output field names.
- [print-orders] Consider modeling `PrintOrder` like `MediaDeliverable` (1 order = 1 item): most orders have one `PrintItem`, and collapsing would remove the item/order packing indirection. Data-model decision. (SupplyOrder.packingStatus removal discussion 2026-05-25)
- [event-import] Order pull-along is not implemented — `importFromEventCore` copies functions, presentations, breakout groups, tracks, event vendors, key staff and status defaults, but no orders (`src/app/events/import/core.ts:8`). The six order types carry ~25 child tables; needs a per-type table of what copies vs resets (money, dates, packing/acquisition state reset; `inventoryItemId` / `sourceLocationId` never copy) and handling for both M:M junctions and the 1:1 `CateringOrder.functionId` / `PrintOrder.presentationId` FKs. (PR #89) Related: #162 (hotel blocks, RFPs, form links).

### Conditional

- [packing-polling-cost] `PackingListClient.tsx` polls every 15 s via `router.refresh()`, re-running the whole event layout including `EventSidebar`'s expanded-section queries. Only if observed to dominate event-route load: poll a data-only reader and `setState` the payload instead. (Packing List rollout)
- [mcp-tools] Every `list_*` description now ends with the summary-shape suffix (commit 8425847). Still open: whether to add structural `summary_fields` / `full_fields` metadata to tool definitions. Probably not worth it unless an MCP client starts mis-using list results.

### Filed as issues

- [vendor-handoff/reports] Vendor Handoff and Equipment Responsibility omit print orders and exhibit booth equipment → filed as #200
- [report-filters] Shared `ReportFilters` primitive (chips, URL params, `paramPrefix`, mobile "Show filters" shell) for the 12 copies → filed as #201
- [schedule-types] `getMainStart` anchors on a "main" substring of the schedule-type label → filed as #202
- [security] Shared limiter for public endpoints (forgot-password, OAuth register, public forms) → filed as #203

## Resolved

<!-- Move entries here once landed, with the commit hash. Prune entries older than ~6 months. -->
- [av-rollup] Deleted the unused `AVOrderEquipmentRollup.tsx`. (70cf82d)
- [docker/next] Dropped `output: "standalone"` — the image runs `next start` from the full build because its CMD also needs the Prisma CLI for baseline + migrate + seed. (70cf82d)
- [styling] Added `labelMicroCaps` to `src/lib/reportStyles.ts`; migrated FunctionDetailReport, EventProfileReport, GroupTabsClient, PackingListClient. (70cf82d)
- [party-label] AVOrderDetails, VendorHandoffReport and `src/lib/esg/assemble.ts` now use `@/lib/partyLabel` (call sites append `?? "—"` where a placeholder is wanted). (70cf82d)
- [events-list] `hideCompleted` moved to `?completed=hide|show` alongside `?series=`; absent keeps the "hide only when something is upcoming" default. (70cf82d)
- [debounced-search] Extracted `useDebouncedSearch` (`src/lib/useDebouncedSearch.ts`), standardized on derived results, added stale-response dropping; migrated EventStaffList, EventAccessPanel, VendorPanel. (70cf82d)
- [timezones] Retired: `formatDateTimeForInput` now exists only in `ScheduleList.tsx`; `TimelineTable.tsx` uses a different time-only helper, so there is no duplication left.
- [catering] Retired: guest-count display moved out of `CateringOrderList` / `CateringOrderDetails` into `GuestCountsCard.tsx`.
- [event-import] Won't do: the import is not idempotent by design (`src/app/events/import/core.ts:8-13`); per-row provenance was rejected because a snapshot goes stale when the source event is rescheduled. Revisit with a nullable `importedFromId` FK used only for dedupe if duplicates become a practical problem. (PR #89)
- [ui] Done: every `confirm()` delete/unlink prompt now uses the inline `InlineConfirmButton` (`src/components/InlineConfirmButton.tsx`) or `InlineDeleteButton` (ux-sweep).
- [styles] Done: report toolbar buttons (Print / Save PDF, Office downloads, Share, Copy) use `btnOutlinedXs` from `src/lib/buttonStyles.ts` (ux-sweep).
