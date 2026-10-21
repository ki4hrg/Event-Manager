# Share-view integration for a new report

Adding a new report means one registry entry plus **five share-link surfaces**. Miss one of the group surfaces and the dashboard switch falls through to `_exhaustive: never` and throws `Unhandled report type: <X>` at runtime when a saved item references the new type. `EVENT_SCHEDULE` (commits 721f199, aef1f20) is the most recent end-to-end reference.

1. **`src/lib/reportRegistry.ts`** — add the type to `SHARE_REPORT_TYPES` and a `REPORTS` entry (label, path, category, optional gating `resource`, description). This one entry feeds the event Reports hub (`/events/[id]/reports`), `SHARE_REPORT_LABELS`, the share-page titles, and the dashboard editor's "Add report" picker and per-item route.
2. **`src/lib/shareLinks.ts`** — add any new filter field (e.g. `includeNonPublic?: boolean`) to `ShareLinkFilters`.
3. **`src/app/share/[token]/page.tsx`** — add an `if (link.reportType === "<TYPE>")` branch (single-report share). Import the report component and its `ReportFilters` (with the `<Xs>ReportFilters` alias convention). Pass `basePath={`/share/${token}`}` + `hidePrint` (the `ShareShell` header already provides Print). Resolve stored vs URL filters with `storedFilters`/`getString(sp.X)` and `resolveSharedBoolean` for booleans. Run `getOptionsForEvent(eventId, ...)` (never the session-bound `getOptions`, which returns `[]` with no active tenant) and the data action in `Promise.all`.
4. **`src/app/share/[token]/print/page.tsx`** — mirror the same branch in the print page. `Promise.all` the data + lookup fetches.
5. **`src/app/share/group/[token]/page.tsx`** and **`src/app/share/group/[token]/[itemId]/print/page.tsx`** — add a `case "<TYPE>":` to the switch in each. The group surfaces namespace filter params per item via `paramPrefix={prefix}` (`i_${itemId}_`), so the `ReportFilters` component must accept and prepend a `paramPrefix?: string` prop to every URL key it reads/writes (see `src/app/events/[id]/reports/room-schedule/ReportFilters.tsx` for the canonical wiring).

## Additional invariants
- The report data action stays auth-free (the share routes reuse it).
- A new boolean toggle (e.g. `usedOnly`) is a string-boolean query param plus an optional `ShareLinkFilters` field, threaded through the page, `/print`, and all four share surfaces.
- `ShareLink.reportType` is a plain `String` column, so a new type needs no migration — the `_exhaustive` checks in the group switches are what catch a missed surface.
- `stripUpdatedBy(...)` runs on the result for share surfaces (not on the authenticated page).
- Filter intersection (`intersect(effectiveX, new Set(...))`) runs only when `!filtersLocked`, after the data fetch — same shape as the existing branches.
