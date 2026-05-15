# Unfinished items from 2026-05-15 review

All Fix Now items from `synthesis.md` landed in this PR. The items below were triaged into other buckets and remain open.

Source IDs refer to the per-agent reports in this folder.

## Next (sprint backlog)

1. **Vendor picker pattern on order form pages** — F-004
   - Replace `searchAssignedEventVendors` with `getResponsiblePartyVendors(eventId, "X_ORDER") + flattenResponsiblePartyOptions()` on:
     - `src/app/events/[id]/catering-orders/[cateringOrderId]/page.tsx:50`
     - `src/app/events/[id]/av-orders/[avOrderId]/page.tsx:30`
     - `src/app/events/[id]/print-orders/[printOrderId]/page.tsx:27`
     - `src/app/events/[id]/setup-orders/[setupOrderId]/page.tsx:34`
   - 4 files, mechanical change.

2. **Outdated TODO about color class maps** — Q1
   - `src/app/events/[id]/agenda/AgendaGrid.tsx:96-97` — TODO claims duplication that no longer exists. Remove or replace with a note explaining why `entryColorClasses` stays separate from `src/lib/colors.ts` (the drag-handle keys).

3. **Refactor large report aggregation function** — Q3 (optional)
   - `src/app/events/[id]/reports/vendor-handoff/VendorHandoffReport.tsx:254-330` — `buildEquipmentSummary` is 77 lines with deeply nested loops. Extract per-order-type helpers (`addCateringItems`, `addAVOrderItems`, `addSetupOrderItems`).

4. **Breadcrumbs on event detail page** — F-006
   - `src/app/events/[id]/page.tsx` may be a deliberate exception as the top-level entity landing page. Decide whether top-level detail pages are exempt and either add breadcrumbs here or clarify the rule in CLAUDE.md.

5. **Password field exclusion comment** — S-015
   - `src/app/users/actions.ts:42-51` — current defensive pattern is correct; add a one-line comment so the next reader sees the intent.

## Track (longer-term backlog)

1. **JWT max age (30 days)** — S-016
   - `src/lib/auth.ts:60-62`. Acceptable for single-tenant internal tool; revisit if posture changes or DB-backed sessions are introduced.

2. **Comment `dangerouslySetInnerHTML` call sites** — S-017
   - 4 sites render RichTextEditor HTML and are safe per CLAUDE.md. Adding a one-line `// safe: RichTextEditor output` comment at each site would speed up security reviews.
   - Locations: `src/app/events/catering-orders/MenuSectionTable.tsx:186`, `CateringOrderDetails.tsx:124`, and two other report files.

## Migration candidates

1. **Auth-guard linting** — derived from SEC3
   - SEC3 was resolved file-by-file; preventing regressions warrants a lint rule (or a pre-commit grep) that flags `export async function` in any `actions.ts` not preceded by `requireAuth()` / `requireAdmin()`, with an allowlist for `events/reports/actions.ts`.

## CLAUDE.md feedback

1. **Route handler auth pattern** — observation from this pass
   - CLAUDE.md lists the three legitimate route handlers but doesn't yet show the auth pattern. Worth adding a brief snippet alongside the Server Action guidance so future route handlers don't repeat the pre-fix mistake.

2. **`parseDateTimeInTimezone` is now canonical** — informational
   - Lifted to `src/lib/timezones.ts`. Action files in the timezone-sensitive paths should import it; CLAUDE.md could call this out under the timezone section.

3. **Upload env var + allowlist + ID sanitizer** — informational
   - `src/lib/uploads.ts` now exports `MAX_UPLOAD_BYTES`, `ALLOWED_UPLOAD_MIME_TYPES`, and `isValidEntityId`. The env var is the second one going through `lib/uploads`; worth documenting alongside `UPLOAD_DIR`.

## Notes for next review

From `synthesis.md` section of the same name (paraphrased for the backlog):

- **Cluster recurrence**: missing auth guards, timezone-naive date parsing, and unhandled async rejections each surfaced from multiple agents. A lint rule for the first would prevent ~50 future findings; a shared timezone helper (now in place) addresses the second; an `useServerAction()` hook template would address the third.
- **Hotspots** (in order of finding density): file upload/download routes; Server Actions broadly; catering/functions timezone handling; client-side `useEffect` server-action chains.
- **`parseInt(...) || N` antipattern** — 5 sites fixed this pass. Worth adding to lint or a CLAUDE.md anti-pattern note so it doesn't recur.
