# Refactor candidates

Parking lot for refactors flagged during a `/simplify` (or ad-hoc) review pass that are real and worth doing but too big to bundle with the change in flight. Processed during periodic refactor sweeps.

Format: `- [area] one-line description (file references, originating PR/commit if useful)`

## Open

- [vendors] `VendorPanel.tsx` and `VendorLinkControl.tsx` both derive `unassignedVendors` from `(availableVendors, assignedVendors)` and render a `<select>` of "Select vendor... + per-vendor option" — same shape, different surrounding flows (notes/no-notes, immediate-select vs explicit-Add, model-badges in option text). At a third occurrence, extract a shared `getUnassignedVendors()` helper in `src/app/vendors/vendor-utils.ts` and a `<VendorAddDropdown>` primitive. (commit 4c34e19)
- [party-label] `src/app/events/av-orders/AVOrderDetails.tsx:11-18` has a local `partyLabel` with a different return contract (`string` with `"—"` fallback) vs the canonical `src/lib/partyLabel.ts` (`string | null`). `src/app/events/[id]/reports/vendor-handoff/VendorHandoffReport.tsx` has a local `partyName` with the same `"—"`-fallback contract. Migrating means touching all call sites to append `?? "—"`. The verbatim-duplicate `vendorOrContactName` in `FunctionDetailReport.tsx` was migrated to `@/lib/partyLabel` already; AVOrderDetails and VendorHandoffReport are the remaining holdouts. Originating from /simplify pass after the `partyLabel` extraction (post-f1c8adf RSC proxy bug fix).
- [timezones] `formatDateTimeForInput(date, timezone)` for `datetime-local` defaultValue is duplicated in `src/app/events/functions/ScheduleList.tsx:60-77` and now `src/app/events/catering-orders/TimelineTable.tsx`. Extract to `src/lib/timezones.ts` next to `parseDateTimeInTimezone` and migrate both call sites.
- [av-rollup] `src/app/events/av-orders/AVOrderEquipmentRollup.tsx` is unused — the AV order overview rolls up via `EquipmentTable`'s `readOnlyItems` prop instead. Delete the dead file (or repurpose if a standalone rollup card is wanted later).
- [report-styles] Page-break behavior on report `sectionCard`s is ad-hoc: VendorHandoff appends `print:break-inside-avoid` per call site, EquipmentResponsibility hardcodes its own card string, RoomSchedule deliberately uses `print:break-after-page`, BreakoutGrid mixes both. Consider folding `print:break-inside-avoid` into `reportSectionCard` in `src/lib/reportStyles.ts` as the default and overriding only where breaks are intentional (RoomSchedule). Requires auditing every report's intent before changing the shared class. (originating from vendor-handoff page-break fix)
- [styling] `text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400` (micro-caps label) is now used in 3 places: `FunctionDetailReport.tsx:1017`, `EventProfileReport.tsx:432`, and `GroupTabsClient.tsx:65`. Extract as `labelMicroCaps` in `src/lib/reportStyles.ts` (or new `labelStyles.ts`) and migrate. (originating from dashboard "Report:" label addition)
- [types] `"BREAKOUT_BLOCK"` is a magic string repeated across 20+ files (queries, type guards, render branches). Extract a `FunctionType` string-union or `const FUNCTION_TYPE = { BREAKOUT_BLOCK: "BREAKOUT_BLOCK", ... } as const` and migrate call sites. Schema column stays a free `String` for now.
- [catering] `CateringOrderList.tsx` and `CateringOrderDetails.tsx` still hand-roll guest-count display. With `src/lib/cateringGuestCount.ts` now landed, both could share the precedence logic — though their UX shows multiple counts rather than the firmest, so the migration may want a sibling helper (`guestCountRows(order)`) rather than direct reuse.
- [icons] Two chevron-down SVGs live inline: `AdminDropdown.tsx` (path `M19 9l-7 7-7-7`) and `GroupTabsClient.tsx` (polyline `6 9 12 15 18 9`). At a third call site, extract a shared `<ChevronDownIcon />` in `src/components/ui/`. (originating from dashboard dropdown polish)

## Resolved

<!-- Move entries here once landed, with the commit hash. Prune entries older than ~6 months. -->
