# Refactor candidates

Parking lot for refactors flagged during a `/simplify` (or ad-hoc) review pass that are real and worth doing but too big to bundle with the change in flight. Processed during periodic refactor sweeps.

Format: `- [area] one-line description (file references, originating PR/commit if useful)`

## Open

### Trigger met — ready to do

- [report-day-grouping] Four day-grouping variants now exist: `groupByDay` in `EventScheduleReport.tsx` (keys from `startTime` via `getDateKeyInTimezone`), `RoomScheduleReport.tsx` (pre-computed `dayKey`, sorts by `start`), `src/app/events/[id]/reports/esg/EsgReport.tsx`, and `groupScheduleItemsByDay` in `EventProfileReport.tsx`. The parked "extract at a fourth report" trigger has fired: extract a generic `groupByDay<T>(items, keyFn, sortFn)` in `src/lib/agendaUtils.ts`. (originating from event-schedule report)
- [report-filters] Twelve `ReportFilters.tsx` copies under `src/app/events/[id]/reports/*/` share the chip-toggle helper, `pushWith` URLSearchParams handling, `paramPrefix` plumbing, mobile collapse and clear-filters (the parked trigger was five). Design a `useUrlChipFilter()` hook or `<FilterChipGroup>` primitive; each report's filter shape differs, so the API needs a design pass before migrating. (originating from event-schedule report)

### Small, no decision needed

- [types] `"BREAKOUT_BLOCK"` is a magic string in 18 files (39 occurrences). Extract `const FUNCTION_TYPE = { BREAKOUT_BLOCK: "BREAKOUT_BLOCK", ... } as const` (or a `FunctionType` union) and migrate; the schema column stays a free `String`.
- [equipment] `EquipmentTable` lives under `src/app/events/catering-orders/` but is shared by setup, AV, booths and booth groups, and still defaults `resource` to `CATERING_ORDERS`. Move it to `src/components/` and make `resource` required on editable use (read-only report call sites pass no actions). The setup/AV call sites were fixed to pass their resource in 70cf82d; the move and required prop remain.
- [buttons] `src/lib/buttonStyles.ts` has no small-primary variant; `px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded` (and near-variants) is inlined across ~15 files (`FileUploadPanel`, `EntityStatusPanel`, `VendorPanel`, `VendorLinkControl`, `KeyStaffList`, `ShareReportButton`, ...). Add `btnPrimarySm` and migrate. (moved from claudemd/candidates.md)
- [share-view] `intersect(input, validSet)` is defined in both `src/app/share/[token]/page.tsx` and `src/app/share/group/[token]/page.tsx`. Lift to `src/lib/shareLinks.ts`. (moved from claudemd/candidates.md)
- [dnd] Touch scrolling cancels a bare `PointerSensor`; `BreakoutGrid.tsx` switched to `MouseSensor` + `TouchSensor` (press delay), but `AgendaGrid.tsx` and `src/app/settings/OptionList.tsx` still use `PointerSensor`. Align them, then document the sensor pair as the rule. (moved from claudemd/candidates.md)
- [config-pages] `/equipment` is now gridded (`EquipmentList.tsx:142`); `/settings/*` (OptionList cards two-up — rows must stay vertical, they use `verticalListSortingStrategy`) and `/storage-locations/*` are still single-column stacks. (found in the 2026-08-24 Chrome design pass)

### Waiting on a third occurrence

- [vendors] `VendorPanel.tsx` and `VendorLinkControl.tsx` both derive `unassignedVendors` and render a "Select vendor..." `<select>`. At a third occurrence, extract `getUnassignedVendors()` in `src/app/vendors/vendor-utils.ts` and a `<VendorAddDropdown>` primitive. (commit 4c34e19)
- [icons] Two inline chevron-down SVGs: `AdminDropdown.tsx`, `GroupTabsClient.tsx`. At a third, extract `<ChevronDownIcon />` in `src/components/ui/`.

### Needs a decision first

- [mobile-toolbars] The list-page toolbar (title + ViewToggle + filter selects + actions) is copy-pasted across FunctionList, AVOrderList, SetupOrderList, PrintOrderList, CateringOrderList, MediaDeliverableList, SupplyOrderList, PresentationList and ScheduleItemList, and the copies have drifted. Extract a shared `ListToolbar` carrying the reports' "Show filters / N active" mobile collapse. UX call: adopt the reports' collapse on list pages or just unify the wrap behavior. (2026-08-24 Chrome design pass)
- [report-styles] `reportOrderCard` already includes `print:break-inside-avoid`, but the class is still appended inline 27 times across 13 files and `reportSectionCard` has none. Decide per report whether section cards should avoid breaks (RoomSchedule deliberately uses `print:break-after-page`), then fold the default into the shared class. (vendor-handoff page-break fix)
- [vendor-handoff] `VendorHandoffReport.tsx` has Catering / AV / Setup / Supply sections but no `PrintOrderSection`, so print orders are invisible to their vendors. Needs a section mirroring `SupplyOrderSection`, wiring at the function / presentation / unscheduled render sites, and a decision on whether print items join `buildEquipmentSummary`. (commit 4dac246)
- [reports] Equipment Responsibility (`getEquipmentResponsibilityData`) and Vendor Handoff (`getVendorHandoffData`) in `src/app/events/reports/actions.ts` don't include exhibit booth inventory (`EquipmentItem.exhibitBoothId` / `exhibitBoothGroupId`). Widen their model-type unions; decide how booths appear in Vendor Handoff. (ESG Part IIIb PR)
- [packing-status-pill] `PACKING_STATUS_CLASS` / `PACKING_STATUS_LABEL` lookups are hand-rendered in 8 components with three UX shapes (select in `SupplyOrderItemPanel`, badge in `PrintItemPanel`, tap-to-cycle in `PackingListClient`, plus `PackingStatusPanel`, `PackingStatusRollup`). Design `<PackingStatusPill variant="select" | "badge" | "cycle">`. (Packing List rollout)
- [schedule-types] `getMainStart` in `src/app/events/functions/scheduleUtils.ts:15` picks the anchor schedule via `s.type.toLowerCase().includes("main")` on the CustomOption label — renaming "Main Event" silently changes grouping. Make it data-driven via `CustomOption.group` (same pattern as substatus / meal_type). Needs a schema-free settings UI choice. (/simplify pass on function-list grouping)
- [supply-orders-naming] `SupplyOrder` names its junctions `functions` / `presentations` (`prisma/schema.prisma:1677-1678`); every other order type uses `functionLinks` / `presentationLinks`. Rename (relation-field rename only, but touches ~7 call sites plus MCP tools). (Function Detail / Equipment Responsibility SupplyOrder wiring)
- [mcp-tools] Every `list_*` description now ends with the summary-shape suffix (commit 8425847). Still open: whether to add structural `summary_fields` / `full_fields` metadata to tool definitions. Probably not worth it unless an MCP client starts mis-using list results.
- [print-orders] Consider modeling `PrintOrder` like `MediaDeliverable` (1 order = 1 item): most orders have one `PrintItem`, and collapsing would remove the item/order packing indirection. Data-model decision. (SupplyOrder.packingStatus removal discussion 2026-05-25)
- [event-import] Order pull-along is not implemented — `importFromEventCore` copies functions, presentations, breakout groups, tracks, event vendors, key staff and status defaults, but no orders (`src/app/events/import/core.ts:8`). The six order types carry ~25 child tables; needs a per-type table of what copies vs resets (money, dates, packing/acquisition state reset; `inventoryItemId` / `sourceLocationId` never copy) and handling for both M:M junctions and the 1:1 `CateringOrder.functionId` / `PrintOrder.presentationId` FKs. (PR #89)

### Conditional

- [packing-polling-cost] `PackingListClient.tsx` polls every 15 s via `router.refresh()`, re-running the whole event layout including `EventSidebar`'s expanded-section queries. Only if observed to dominate event-route load: poll a data-only reader and `setState` the payload instead. (Packing List rollout)

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
- [docx] The shared docx primitives live in `src/lib/esg/renderDocx.ts` and are imported by `src/lib/rfp/renderDocx.ts`; move them to a neutral `src/lib/docx.ts` if a third document type appears (RFP PR)
- [hotels] `getPickupPattern` (src/app/hotels/actions.ts) reads the active tenant via `hotelSession`; the RFP document/fill call it from event pages where the active tenant matches the event. A tenant-explicit plain loader would remove that coupling (RFP PR)
- [styles] Add `btnDangerSm` to src/lib/buttonStyles.ts; inline confirms hand-roll small red buttons (`DeleteButton.tsx`, `IssueEsgPanel.tsx`)
- [autosave] Form-ref + payload + version wiring around `useAutosave` is copied in `RfpForm`, `SpecSectionCard`, `SpecGridTable` (RowEditor), `FunctionEsgCard`; candidate `useFormAutosave(action)` hook in src/lib/
- [venues] Fold src/app/hotels/HotelHistory.tsx into `RfpHistoryPanel` (proposals without an RFP as their own rows) to end the duplicate listing on the venue page
- [ui] Underline tab-link style is copied in src/app/events/rfps/RfpTabs.tsx, the RFP list `?kind=` strip, src/app/events/[id]/agenda/DateTabs.tsx and SpecDocHeader; extract a shared `TabLink`
- [rfps] Hotel and vendor RFP detail pages (`[id]/hotels/rfps/[rfpId]/page.tsx`, `[id]/rfps/[rfpId]/page.tsx`) still duplicate the reply-to card, files panel and action closures
- [components] Add an `editable` prop to src/components/RichTextEditor.tsx so read-only views stop swapping in a stored-HTML render (RfpForm, SpecFieldInput)
- [hotels] `RoomGrid` (src/app/events/hotels/RoomGrid.tsx) is no longer rendered; fold `GridNight` into `RoomGridEditor` and delete the file
- [reports] The mobile "Show filters / N active" toggle + actions block is copied across ~10 `ReportFilters`; extract one shared shell
- [security] No rate limiter exists; public forms throttle with DB counts per link (`assertLinkHasCapacity` in src/lib/forms/links.ts). A shared per-IP limiter would also cover /forgot-password and OAuth register
- [uploads] The staff upload route (src/app/api/upload/route.ts) buffers before checking size and trusts client MIME/extension; reuse `sniffPublicUpload` + a Content-Length precheck
- [workflows] Move recomputeEntityStatus/updateEntityStatus out of the "use server" src/app/events/workflows/actions.ts into core.ts and replace the four 9-way entityType switches (assertEntityInEvent, filterEntityIdsInEvent, revalidateEntity, updateEntityStatus) with one per-type delegate map in entity-types/core; lets autoAssignDefaultWorkflowsCore apply template pending status and makes adding RFP/hotel/inbox entity types a one-place change
