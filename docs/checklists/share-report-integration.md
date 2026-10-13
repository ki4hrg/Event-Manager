# Share-view integration for a new report

Adding a new report means wiring **five share-link surfaces** (plus the `REPORT_TITLES` maps noted in step 3–4). Miss one of the group surfaces and the dashboard switch falls through to `_exhaustive: never` and throws `Unhandled report type: <X>` at runtime when a saved item references the new type. `EVENT_SCHEDULE` (commits 721f199, aef1f20) is the most recent end-to-end reference.

1. **`src/lib/shareLinks.ts`** — add a `<TYPE>: "<Label>"` entry to `SHARE_REPORT_LABELS`. Add any new filter field (e.g. `includeNonPublic?: boolean`) to `ShareLinkFilters`.
2. **`src/app/events/[id]/share-links/dashboards/[groupId]/DashboardEditor.tsx`** — add the new type to `REPORT_PATHS`. The "Add report" picker iterates `Object.keys(REPORT_PATHS)`, so this single line surfaces it in the picker, builds the `?addToDashboard=` link, and lets the per-item edit row resolve its route.
3. **`src/app/share/[token]/page.tsx`** — add an `if (link.reportType === "<TYPE>")` branch (single-report share). Also add the type to this file's `REPORT_TITLES` map (it drives the tab title; missing entries fall back to "Shared report"). Import the report component and its `ReportFilters` (with the `<Xs>ReportFilters` alias convention). Pass `basePath={`/share/${token}`}` + `hidePrint` (the `ShareShell` header already provides Print). Resolve stored vs URL filters with `storedFilters`/`getString(sp.X)` and `resolveSharedBoolean` for booleans. Run `getOptions` and the data action in `Promise.all`.
4. **`src/app/share/[token]/print/page.tsx`** — mirror the same branch in the print page. It has its own `REPORT_TITLES` map too. `Promise.all` the data + lookup fetches.
5. **`src/app/share/group/[token]/page.tsx`** and **`src/app/share/group/[token]/[itemId]/print/page.tsx`** — add a `case "<TYPE>":` to the switch in each. The group surfaces namespace filter params per item via `paramPrefix={prefix}` (`i_${itemId}_`), so the `ReportFilters` component must accept and prepend a `paramPrefix?: string` prop to every URL key it reads/writes (see `src/app/events/[id]/reports/room-schedule/ReportFilters.tsx` for the canonical wiring).

## Additional invariants
- The report data action stays auth-free (the share routes reuse it).
- `stripUpdatedBy(...)` runs on the result for share surfaces (not on the authenticated page).
- Filter intersection (`intersect(effectiveX, new Set(...))`) runs only when `!filtersLocked`, after the data fetch — same shape as the existing branches.
