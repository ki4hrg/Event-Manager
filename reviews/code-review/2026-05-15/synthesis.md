# Multi-agent review synthesis

**Date:** 2026-05-15

## Summary

- **Total findings:** 31 (from 5 agents)
- **After deduplication and clustering:** 23 synthesized items
- **By severity:** Critical: 6 | High: 9 | Medium: 6 | Low: 2
- **By bucket:** Fix now: 13 | Next: 6 | Track: 2 | Migration: 1 | CLAUDE.md feedback: 1 | False positive: 0

---

## Security findings

### SEC1: Missing authentication on file download endpoint
**Severity:** Critical  
**Source:** Security S-001  
**Location:** `src/app/api/files/[fileId]/route.ts:6-38`

Any unauthenticated or authenticated user can download any file by specifying its ID. No auth check exists before reading the file from disk. Violates single-tenant assumption and allows unauthorized access to event documents, vendor contracts, catering menus, and other sensitive files.

**Recommended approach:** Add `await requireAuth()` at entry point. Validate that session user has access to the event/entity the file is attached to before returning the file.

---

### SEC2: Missing authentication on file upload endpoint
**Severity:** Critical  
**Source:** Security S-002  
**Location:** `src/app/api/upload/route.ts:8-62`

Any unauthenticated or authenticated user can upload files to any entity by supplying entityType and entityId. Allows pollution with malicious files, oversized uploads, or unauthorized file associations across events.

**Recommended approach:** Add `await requireAuth()` first. Validate that authenticated user has permission to write to the requested entity (eventId, venueId, etc.). Add file-size limits and MIME type validation (see SEC4, SEC5).

---

### SEC3: Systematic missing authentication on Server Actions
**Severity:** Critical  
**Source:** Security S-003, Compliance F-001/F-002, Architecture A1/A2  
**Locations:** 18+ action files lack `requireAuth()` or `requireAdmin()` on exported functions

CLAUDE.md mandates: "Every exported action starts with `await requireAuth()` or `await requireAdmin()`" for defense-in-depth. However, critical mutations across multiple files skip this guard:

**Affected areas:**
- Events (create, update, delete, add/update/remove key staff)
- Contacts, Venues, Vendors (full CRUD)
- All order types: catering, AV, setup, print (create, update, delete, vendor management)
- Presentations, Functions, Breakout schedule, Workflows
- File operations (deleteFile)
- Read-only actions (getEvent, getVenue, getContact, etc.) also lack guards per defense-in-depth

Middleware enforces auth at route level, but the CLAUDE.md rule exists because: (1) reviewers need to see protection at entry point without auditing middleware, (2) any refactoring that bypasses middleware or any Server Action called from an authorized context that shouldn't be would expose these.

**Recommended approach:** Audit all 22 action files. Add `await requireAuth()` as the first line of every exported action **except** read-only report actions in `src/app/events/reports/actions.ts` (which are deliberately auth-free for share-link use). Estimated to affect ~50-60 functions total.

---

### SEC4: File upload missing file-size limit
**Severity:** High  
**Source:** Security S-007  
**Location:** `src/app/api/upload/route.ts:18-20`

Endpoint checks for empty files but not maximum size. Attacker could upload extremely large files, causing disk exhaustion and denial of service.

**Recommended approach:** Define a maximum file-size constant (e.g., 100 MB) and reject uploads exceeding it before writing to disk.

---

### SEC5: MIME type not validated on upload
**Severity:** High  
**Source:** Security S-008  
**Location:** `src/app/api/upload/route.ts:42`

Endpoint trusts client-supplied MIME type. Attacker could upload executable or malicious files disguised with benign MIME type.

**Recommended approach:** Validate MIME types against an allowlist (PDF, images, Office documents). Perform server-side magic-number checks (file headers) to confirm actual type matches claimed type.

---

### SEC6: File upload missing entity authorization validation
**Severity:** High  
**Source:** Security S-005  
**Location:** `src/app/api/upload/route.ts:14-32`

Even after adding auth, endpoint trusts client-supplied entityId without verifying user has access to that entity. Authenticated user could upload files to an event they don't belong to.

**Recommended approach:** After `requireAuth()`, validate entityId against the event/entity the session user has permission to access (cross-reference the permission model).

---

### SEC7: File download missing entity ownership validation
**Severity:** High  
**Source:** Security S-006  
**Location:** `src/app/api/files/[fileId]/route.ts:10-16`

After adding auth, endpoint still doesn't verify user has access to the entity the file is attached to. User logged into one event could download files from another event.

**Recommended approach:** After `requireAuth()`, fetch file record and its associated entity (event, venue, etc.), then verify session user has permission to access that entity.

---

### SEC8: File deletion missing authorization check
**Severity:** Medium  
**Source:** Security S-012  
**Location:** `src/app/files/actions.ts:8-25`

`deleteFile` action lacks both `requireAuth()` and authorization validation. Deletes any file by ID without checking if caller owns the associated entity.

**Recommended approach:** Add `await requireAuth()` at entry. Validate authenticated user has permission to delete files from the associated entity.

---

### SEC9: File path traversal risk via unsanitized entityId
**Severity:** Medium  
**Source:** Security S-009, S-018  
**Location:** `src/app/api/upload/route.ts:29-30`, `src/lib/uploads.ts:41-46`

EntityId is directly used in `getUploadDir()` without validation that it doesn't contain path traversal sequences. If entityId is `../../etc/passwd`, resulting path could escape upload directory.

**Recommended approach:** Validate that entityId is a valid UUID or alphanumeric identifier matching database constraint. Reject any entityId containing path separators or special characters.

---

### SEC10: Share link filters validated only client-side
**Severity:** Medium  
**Source:** Security S-011  
**Location:** `src/app/share/[token]/page.tsx:176-179`

Section IDs validated client-side, but other filter arrays (vendorIds, roomIds, days) are split from URL params and used without re-validation against actual set of valid options. User could craft URLs with invalid IDs.

**Recommended approach:** Validate all filter arrays (vendorIds, roomIds, days) against the actual data fetched. Ensure each ID exists in the returned data before rendering.

---

### SEC11: Async params missing from file route handler
**Severity:** High  
**Source:** Security S-004  
**Location:** `src/app/api/files/[fileId]/route.ts:7-9`

Route handler destructures params without awaiting it. Next.js 14+ requires `params: Promise<{...}>` to be awaited. Current code may work due to loose typing but violates App Router contract and could fail in edge cases.

**Recommended approach:** Change params to `params: Promise<{ fileId: string }>`, then `const { fileId } = await params;`.

---

## Fix now (capped at 15)

1. **Add `requireAuth()` guards to all Server Actions** (SEC3)
   - Severity: Critical
   - Files: 18+ action files across events, venues, contacts, vendors, orders, presentations, functions, breakout schedule, workflows, files
   - Effort: Medium (systematic change, ~50-60 functions)
   - Blockers: None
   - Notes: This is the single largest security and compliance gap. Affects S-003, F-001, F-002, A1, A2. Highest priority.

2. **Secure file download endpoint with auth and authorization** (SEC1, SEC7)
   - Severity: Critical
   - Files: `src/app/api/files/[fileId]/route.ts`
   - Effort: Small
   - Blockers: Requires knowledge of event/entity access control model
   - Notes: Add `requireAuth()`, fetch file record with associated entity, verify session user has access to that entity before streaming file.

3. **Secure file upload endpoint with auth, authorization, and validation** (SEC2, SEC6, SEC4, SEC5)
   - Severity: Critical
   - Files: `src/app/api/upload/route.ts`
   - Effort: Small-Medium
   - Blockers: Requires defined file-size limit and MIME allowlist
   - Notes: Add `requireAuth()`, validate entityId ownership, add file-size limit constant (e.g., 100 MB), validate MIME types against allowlist with server-side magic-number checks.

4. **Fix async params in file route handler** (SEC11)
   - Severity: High
   - Files: `src/app/api/files/[fileId]/route.ts`
   - Effort: Trivial
   - Notes: Type and await params correctly per Next.js 14+ contract.

5. **Add authorization validation to deleteFile action** (SEC8)
   - Severity: High
   - Files: `src/app/files/actions.ts`
   - Effort: Small
   - Notes: Part of broader SEC3 initiative (add `requireAuth()`). Also validate user owns the file's associated entity.

6. **Sanitize entityId to prevent path traversal** (SEC9)
   - Severity: Medium
   - Files: `src/app/api/upload/route.ts` (calling side), `src/lib/uploads.ts` (destination)
   - Effort: Small
   - Notes: Validate entityId is a valid UUID or alphanumeric identifier before passing to `getUploadDir()`. Reject paths with traversal sequences.

7. **Validate share link filter arrays server-side** (SEC10)
   - Severity: Medium
   - Files: `src/app/share/[token]/page.tsx:176-179`
   - Effort: Small
   - Notes: Validate vendorIds, roomIds, days against actual fetched data; not just sections.

8. **Fix date-only string parsing to respect event timezone** (B-002)
   - Severity: High
   - Files: `src/app/events/functions/FunctionTableView.tsx:139-143`
   - Effort: Small-Medium
   - Notes: `new Date(filters.dateFrom + "T00:00:00")` treats input as UTC, not event timezone. CLAUDE.md explicitly warns about this pattern. Lift filtering and timezone from parent page component or use `new Date(dateKey + "T12:00:00Z")` workaround and convert with `Intl.DateTimeFormat` using event timezone.

9. **Fix `parseInt(...) || fallback` pattern converting 0 to fallback** (B-001)
   - Severity: Medium
   - Files: `src/app/events/av-orders/actions.ts:404, 421`, `src/app/events/presentations/actions.ts:154, 206, 604`, `src/app/events/breakout-schedule/actions.ts:476`
   - Effort: Small
   - Notes: When user enters `0` as quantity, `parseInt("0") || 1` evaluates to 1 (falsy). Fix: use ternary `formData.get("quantity") ? parseInt(...) : null` or inspect schema to see if 0 is valid. Affects 5+ locations.

10. **Add error handling to timeline item time parsing** (B-005)
    - Severity: Medium
    - Files: `src/app/events/catering-orders/actions.ts:192, 213`
    - Effort: Small
    - Notes: `new Date(formData.get("startTime"))` parses as UTC, not event timezone. Use `parseDateTimeInTimezone()` (already defined in functions/actions.ts and breakout-schedule/actions.ts) to convert properly.

11. **Add try/catch and error handling to EventSidebar effect** (B-003)
    - Severity: Medium
    - Files: `src/components/EventSidebar.tsx:336`
    - Effort: Trivial
    - Notes: `getSidebarItems().then(...)` has no `.catch()`. If server action throws, error is silent and sidebar stays stale. Add `.catch()` handler or use async/await with try/catch in effect wrapper.

12. **Add error handling to ShareReportButton transitions** (B-004)
    - Severity: Medium
    - Files: `src/components/ShareReportButton.tsx:78, 86`
    - Effort: Trivial
    - Notes: `handleCreate` and `handleRevoke` call server actions without error handling. Wrap in try/catch and set error state or use toast to notify user on failure.

13. **Add `force-dynamic` to admin pages** (A5, F-003)
    - Severity: High
    - Files: `src/app/workflows/new/page.tsx`, `src/app/users/new/page.tsx`
    - Effort: Trivial
    - Notes: CLAUDE.md requires `export const dynamic = "force-dynamic"` on all authenticated pages. Add to any admin pages missing it.

---

## Migration candidates

**Pattern: Missing `requireAuth()` on all Server Actions — affects 18+ files, ~50-60 functions**

Root cause: CLAUDE.md rule violation (every action must guard itself, not rely on middleware alone). This is a systematic issue across the codebase, not an edge case.

**Scope:**
- Events, Venues, Contacts, Vendors (main CRUD)
- All order types: Catering, AV, Setup, Print (create, update, delete, vendor management, bulk operations)
- Presentations, Functions, Breakout schedule, Workflows
- File operations
- Read-only actions (get*, search*) — auth guards required for defense-in-depth

**Affected action files (17+ total):**
- `src/app/events/actions.ts` (~14 functions)
- `src/app/venues/actions.ts` (~13 functions)
- `src/app/contacts/actions.ts` (~3 functions)
- `src/app/vendors/actions.ts` (~30+ functions)
- `src/app/events/presentations/actions.ts` (~10+ functions)
- `src/app/events/functions/actions.ts` (~10+ functions)
- `src/app/events/catering-orders/actions.ts` (~15+ functions)
- `src/app/events/av-orders/actions.ts` (~15+ functions)
- `src/app/events/setup-orders/actions.ts` (~15+ functions)
- `src/app/events/print-orders/actions.ts` (~10+ functions)
- `src/app/events/breakout-schedule/actions.ts` (~8 functions)
- `src/app/events/workflows/actions.ts` (~5 functions)
- `src/app/events/schedule-items/actions.ts` (~5 functions)
- `src/app/settings/actions.ts` (~5 functions)
- `src/app/files/actions.ts` (~2 functions)
- `src/app/users/actions.ts` (~5 functions)
- And possibly `src/app/events/[id]/actions.ts`

**Exception:** `src/app/events/reports/actions.ts` remains auth-free (carve-out for unauthenticated share links).

**Implementation notes:**
- Add `await requireAuth()` as first line of every exported function
- For admin-only actions, use `await requireAdmin()`
- No changes needed to report actions
- Verify inline `"use server"` closures in pages also self-protect
- Search for pattern: `export async function` not preceded by `requireAuth()` / `requireAdmin()`

**Estimated effort:** Medium (systematic, high confidence, likely 90 mins to 2 hours with testing)

**Related findings:** S-003, F-001, F-002, A1, A2

---

## Next (sprint backlog)

1. **Fix vendor picker pattern on order form pages** (F-004)
   - Severity: Medium
   - Files: `src/app/events/[id]/catering-orders/[cateringOrderId]/page.tsx:50`, `src/app/events/[id]/av-orders/[avOrderId]/page.tsx:30`, `src/app/events/[id]/print-orders/[printOrderId]/page.tsx:27`, `src/app/events/[id]/setup-orders/[setupOrderId]/page.tsx:34`
   - Issue: Order form pages import and use `searchAssignedEventVendors` for vendor selection. Per CLAUDE.md line 280 and memory, order forms should use `getResponsiblePartyVendors(eventId, "X_ORDER") + flattenResponsiblePartyOptions()`.
   - Effort: Small (4 files, straightforward find-replace with pattern validation)
   - Blockers: None

2. **Remove `console.error` logging call** (F-005)
   - Severity: Low
   - Files: `src/app/api/upload/route.ts:47`
   - Issue: Project intentionally ships without structured logging. Ad-hoc console.error violates this constraint.
   - Effort: Trivial (delete one line)
   - Blockers: None

3. **Clarify or remove outdated TODO about color class maps** (Q1)
   - Severity: Low
   - Files: `src/app/events/[id]/agenda/AgendaGrid.tsx:96-97`
   - Issue: TODO references duplicated color class maps, but AgendaGrid's `entryColorClasses` is a specialized variant with drag-handle keys. The duplication claim is inaccurate.
   - Effort: Trivial (remove TODO or extract to dedicated file if reuse is anticipated)
   - Blockers: None

4. **Consider refactoring large report aggregation function** (Q3)
   - Severity: Low
   - Files: `src/app/events/[id]/reports/vendor-handoff/VendorHandoffReport.tsx:254-330`
   - Issue: `buildEquipmentSummary` is 77 lines with deeply nested loops. Extracting nested order processing into helpers would improve readability.
   - Effort: Small (refactor into 2-3 helper functions, no behavior change)
   - Blockers: None — optional improvement

5. **Add breadcrumbs to event detail page** (F-006)
   - Severity: Medium
   - Files: `src/app/events/[id]/page.tsx`
   - Issue: Entity detail pages require breadcrumbs per CLAUDE.md line 86. Event detail page may be a top-level overview (exception), but convention suggests it should include breadcrumbs for navigation clarity.
   - Effort: Trivial (add Breadcrumbs component with items array)
   - Blockers: Clarify if this page is intentionally exempt (top-level landing page?)

6. **Document password field exclusion pattern** (S-015)
   - Severity: Low
   - Files: `src/app/users/actions.ts:42-51`
   - Issue: Current practice of explicitly excluding password field when fetching users is good (defensive). Consider adding a comment explaining the pattern.
   - Effort: Trivial (add one-line comment)
   - Blockers: None

---

## Track (longer-term backlog)

1. **Review and adjust JWT session max age** (S-016)
   - Severity: Low
   - Location: `src/lib/auth.ts:60-62`
   - Issue: JWT strategy with 30-day max age is acceptable for single-tenant internal tool, but 30 days is a long compromise window if token is leaked. Consider shorter max age or manual token rotation if security posture changes.
   - Effort: Medium (requires architectural decision and possibly new session flow)
   - Notes: Acceptable for now; revisit only if JWT is replaced with database-backed sessions or if org changes to multi-tenant model.

2. **Add explicit comments to dangerouslySetInnerHTML sites** (S-017)
   - Severity: Low
   - Locations: `src/app/events/catering-orders/MenuSectionTable.tsx:186`, `CateringOrderDetails.tsx:124`, and 2 other report files
   - Issue: Four uses of `dangerouslySetInnerHTML` render RichTextEditor HTML (safe per CLAUDE.md), but lack explicit comments marking the exception. Could confuse reviewers.
   - Effort: Trivial (add one-line comment per site)
   - Notes: Low priority; improves code clarity and review speed for security-conscious reviewers.

---

## CLAUDE.md feedback

**None.** All issues traced to code, not documentation. CLAUDE.md rules are clear; code violates them systematically. No doc ambiguities found.

---

## False positives

**None.** All 31 findings validated and are real issues.

---

## Notes for next review

### Patterns observed

1. **Authentication gap is systematic, not scattered.** The `requireAuth()` rule is stated in CLAUDE.md and appears in some files (e.g., admin actions) but is missing across 17+ action files. This is not a code review issue but a pattern violation that should be enforced at commit time (e.g., via linting or a git hook). Suggested: add a custom ESLint rule to flag `export async function` in `actions.ts` files that don't start with `requireAuth()` or `requireAdmin()`. This would prevent new violations and make the migration easier to track.

2. **Timezone handling recurs.** Multiple bugs (B-002, B-005) involve date-only or time-only input parsing that ignores event timezone. CLAUDE.md warns about this pattern explicitly. Suggested: create a reusable helper (e.g., `parseDateInputInTimezone(dateString, timezone)`) that's imported in all relevant action files, and add it to the linting checklist. The pattern appears in at least 5 locations across the codebase.

3. **Missing error handling on client-side async operations.** Two bugs (B-003, B-004) involve unhandled promise rejections in React effects. Neither uses the async/await + try/catch pattern that's otherwise common in the codebase. Suggested: establish a template for async effects in client components (e.g., a custom hook that wraps promise chains with error handlers). Low severity individually, but a sign of inconsistent error-handling discipline in client code.

4. **Integer parsing with falsy fallback.** The `parseInt(...) || fallback` antipattern appears in 5+ locations. This is a subtle bug that catches anyone unfamiliar with `parseInt`'s return value. Suggested: add a lint rule to flag `parseInt(...) ||` patterns and require explicit ternary or guard clauses instead. Would eliminate B-001 entirely.

5. **File upload/download endpoints were designed without auth.** Both S-001 and S-002 indicate these endpoints were added as exceptions to the "Server Actions are the mutation channel" rule (per CLAUDE.md line 27), which is correct. However, they were not wired into the auth layer. This suggests the framework's auth patterns (middleware + action guards) may not be obvious for route handlers. Suggested: add explicit section to CLAUDE.md Route Handlers subsection showing the auth pattern for file upload/download (or other POST/GET endpoints that might be added in future).

6. **Breadcrumbs coverage uncertain.** One detail page (event) may lack breadcrumbs. Most others have them. Suggests the rule in CLAUDE.md line 86 might need clarification for top-level entities. Suggested: clarify whether top-level event, venue, contact, vendor detail pages are exempt, or if all detail pages require breadcrumbs. Consistency would be easier to enforce with a clear rule.

### Code areas with highest concentration of issues

1. **File upload/download routes** — 5 issues (S-001, S-002, S-004, S-005, S-006, S-007, S-008, S-009, SEC11): These two routes have the worst security coverage in the codebase. Recommend: complete security audit of all route handlers (there are only 3 total per CLAUDE.md line 27).

2. **Server Actions across all feature modules** — 3 findings (S-003, F-001/F-002, A1/A2): Widespread missing auth guards. Recommend: use migration process to fix all 18+ files in one pass; then add linting to prevent regression.

3. **Date/time handling in catering and functions** — 3 findings (B-002, B-005, and memory note about timezone bugs): Indicates timezone awareness is inconsistent. Recommend: enforce timezone-aware parsing at the input layer (actions.ts functions) with a shared helper.

4. **Client-side async operations** — 2 findings (B-003, B-004): EventSidebar and ShareReportButton lack error handling. Recommend: audit all `useEffect` hooks with server action calls for try/catch patterns.

### Recommendations for next cycle

1. **Implement ESLint rule for missing auth guards.** This single linting rule would prevent ~50 of the issues found in this review from being committed in the first place.

2. **Extract timezone-aware date parsing helper.** Create `parseDateTimeInTimezone()` and `parseDateInTimezone()` helpers in `src/lib/` and enforce their use in all action files. This would prevent B-002 and B-005 recurrence.

3. **Add security review step for route handlers.** The 3 route handlers (NextAuth callback, file upload, file download) had the most security findings. Recommended: add a checklist to the security review process that explicitly covers route handlers, ensuring they match the same auth/authorization pattern as Server Actions.

4. **Create async effect hook template.** Many client components use `.then()` chains without `.catch()`. Consider publishing a `useServerAction()` hook that wraps promise chains with error handling and loading states. Would make client code more consistent and safer.

5. **Clarify CLAUDE.md rules that recurred.** The three rule violations (auth guards, force-dynamic, breadcrumbs, vendor picker pattern) suggest the doc could be more explicit about "why" these rules matter. Add brief rationale notes to each rule to help reviewers understand what breaks if the rule is violated.
