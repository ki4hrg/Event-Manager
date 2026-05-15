# Architecture Review — 2026-05-15

## Findings

---

> **A1** Server Actions missing auth guards on mutation functions

> **Severity:** Critical

> **Location:** `src/app/events/actions.ts`, `src/app/venues/actions.ts`, `src/app/contacts/actions.ts`, `src/app/vendors/actions.ts`, `src/app/events/presentations/actions.ts`, `src/app/events/functions/actions.ts`, `src/app/events/catering-orders/actions.ts`, `src/app/events/av-orders/actions.ts`, `src/app/events/setup-orders/actions.ts`, `src/app/events/print-orders/actions.ts`, `src/app/events/breakout-schedule/actions.ts`, `src/app/events/workflows/actions.ts`, `src/app/events/schedule-items/actions.ts`, `src/app/events/[id]/actions.ts`, `src/app/files/actions.ts` (and possibly more)

> **Issue:** The architecture rule states: "Every exported action with `await requireAuth()` (or `await requireAdmin()` for admin-gated actions)." CLAUDE.md line 92 explicitly allows only report actions (`src/app/events/reports/actions.ts`) to skip this. However, 15+ action files contain unprotected mutations (`createEvent`, `updateVenue`, `deleteContact`, etc.) that are called directly from client forms without any auth check.

> **Evidence:** Examples of exposed mutations:
> - `src/app/events/actions.ts:22-43`: `createEvent()` has no `requireAuth()` guard; called from `src/app/events/[id]/page.tsx:48-50`
> - `src/app/venues/actions.ts:26-51`: `createVenue()` exposed; called as Server Action from forms
> - `src/app/contacts/actions.ts:19-42`: `createContact()` exposed without auth
> 
> The pattern affects every order type (catering, AV, setup, print), functions, presentations, breakout schedule, and workflows. 16 `actions.ts` files lack `requireAuth()` or `requireAdmin()` at the start of exported functions.

> **Suggested approach:** Add `await requireAuth()` to every exported mutation function across all 16 affected action files. Read-only actions (get*, search*) are lower priority but should also guard if they expose sensitive event/vendor details. Verify that report actions in `src/app/events/reports/actions.ts` remain auth-free (intentional carve-out for share links).

> **Confidence:** High — CLAUDE.md explicitly states the rule; code demonstrably violates it; mutations are reachable from client forms without auth interception.

---

> **A2** Missing `await requireAuth()` on read-only server actions in non-report modules

> **Severity:** High

> **Location:** `src/app/events/actions.ts:8-20` (`getEvents`, `getEvent`), `src/app/venues/actions.ts:7-24` (`getVenues`, `getVenue`), `src/app/contacts/actions.ts:7-17` (and similar in all 15 affected files)

> **Issue:** CLAUDE.md section "Server Actions" states auth guards are required for "every exported action." While read-only actions might not mutate data, they fetch sensitive event, venue, contact, and vendor information. In a single-tenant tool, unauthenticated read access is still a security boundary violation.

> **Evidence:** `src/app/events/actions.ts:8-20` exports `getEvents()` and `getEvent()` without auth. These are called by authenticated pages (which have middleware protection), but the action itself is unguarded — if called directly via form submission or imported into a client component, it would read event data without re-checking auth.

> **Suggested approach:** Wrap all non-report read actions with `await requireAuth()` at the top. Report actions in `src/app/events/reports/actions.ts` remain the documented carve-out.

> **Confidence:** High — follows defense-in-depth pattern; CLAUDE.md cites "reviewer can see the protection at the top of the file" as the reason.

---

> **A3** Inline "use server" closures in pages don't re-apply auth guards

> **Severity:** High

> **Location:** `src/app/events/[id]/page.tsx:48-50`, `src/app/events/[id]/functions/[functionId]/page.tsx` (and similar event-scoped detail pages)

> **Issue:** CLAUDE.md Archetype C documents wrapping remote Server Actions in inline `"use server"` arrow closures that bind context. However, when a page imports an unprotected action and wraps it in an inline closure, the outer page's auth (enforced by middleware) does not automatically transfer to the action's execution. If the imported action lacks its own `requireAuth()` guard, the closure is unprotected.

> **Evidence:** `src/app/events/[id]/page.tsx:8-16` imports `updateEvent`, `deleteEvent`, etc. Lines 48-50 wrap `updateEvent` in an inline `"use server"` closure but do not call `await requireAuth()` inside it. The action itself (`src/app/events/actions.ts:45-68`) also lacks a guard.

> **Suggested approach:** Either (a) add `await requireAuth()` to the imported action itself, or (b) call `await requireAuth()` in the inline closure before delegating to the imported action. (a) is preferred per CLAUDE.md — actions protect themselves, not their callers.

> **Confidence:** High — pattern is documented; code shows the gap.

---

> **A4** Cross-feature action imports without validation of auth layer

> **Severity:** Medium

> **Location:** `src/app/events/presentations/actions.ts:7-9` (imports `getResponsiblePartyVendors` from `@/app/vendors/actions`), `src/app/events/presentations/actions.ts:9` (imports from `@/app/events/workflows/actions`)

> **Issue:** Presentation actions import vendor and workflow actions across feature boundaries. If the imported actions lack auth guards (which they do), the importer's use of them is not re-protected. This creates a dependency on upstream module correctness without assertion.

> **Evidence:** `src/app/events/presentations/actions.ts:7-8` calls `getResponsiblePartyVendors` (unguarded read) and `flattenResponsiblePartyOptions`. Line 9 calls `autoAssignDefaultWorkflows` (unguarded in workflows module). Neither caller nor callee has auth checks documented.

> **Suggested approach:** As part of A1/A2, ensure all actions have guards. For cross-feature calls, reviewers should verify the imported function is guarded. Consider adding a comment at the call site if the importer is guarded but the imported action is not.

> **Confidence:** Medium — the issue is real but will be resolved by A1/A2. Flagging to surface the dependency pattern.

---

> **A5** `export const dynamic = "force-dynamic"` missing from admin-protected pages

> **Severity:** Medium

> **Location:** `src/app/workflows/new/page.tsx` (and potentially other admin pages in `/workflows` and `/settings` segments)

> **Issue:** CLAUDE.md line 80 states: "Every authenticated `page.tsx` declares `export const dynamic = 'force-dynamic'`. The only carve-outs are `src/app/login/page.tsx`, `src/app/share/[token]/page.tsx` (both unauthenticated), and `src/app/settings/page.tsx` (pure redirect, no body)." `src/app/workflows/new/page.tsx` does not declare `dynamic = "force-dynamic"`.

> **Evidence:** `src/app/workflows/new/page.tsx:1-72` has no `export const dynamic` declaration. It calls `requireAdmin()` at line 7 (auth + admin check) and fetches no data, but the rule is stated as universal for authenticated pages with no exceptions other than the three listed.

> **Suggested approach:** Add `export const dynamic = "force-dynamic"` to `src/app/workflows/new/page.tsx` and any other authenticated pages in admin segments that lack it.

> **Confidence:** Medium — rule is explicit, code violates it, but the practical impact is low (page has no data to cache).

---

## Summary

The codebase has a **critical auth gap**: 15+ action files lack `requireAuth()` guards on all exported functions (both reads and mutations). CLAUDE.md explicitly requires this on every action; only report actions are exempt. This violates the "defense in depth" model. Inline closures in pages that wrap unprotected actions don't re-apply auth, compounding the issue. 

A secondary issue: `export const dynamic = "force-dynamic"` is missing from one or more admin pages, violating the rule for authenticated pages.

**Remediation priority:** A1 (critical mutations) > A2 (critical reads) > A3 (closure pattern) >> A4 (cross-feature awareness) >> A5 (force-dynamic).
