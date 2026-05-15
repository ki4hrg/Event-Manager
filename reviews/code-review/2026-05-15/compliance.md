# CLAUDE.md Compliance Review — 2026-05-15

## Rules being checked

1. **App Router only** — no `pages/` directory (line 26)
2. **Server Actions are the mutation channel** — JSON CRUD handlers forbidden (line 27)
3. **No `new PrismaClient()` at runtime** — only in `lib/prisma` or scripts (line 28)
4. **Auth is defense-in-depth** — every exported mutation action starts with `await requireAuth()` or `await requireAdmin()` (line 29; report actions exception documented)
5. **No global client state** — no Zustand / Jotai / Redux / SWR / React Query (line 30)
6. **Single-tenant** — no multi-org access controls (line 31)
7. **`export const dynamic = "force-dynamic"`** on authenticated pages (line 80; exceptions: login, share, settings redirect)
8. **`params: Promise<{...}>`** — async params on pages and route handlers (line 81)
9. **No `error.tsx`, `not-found.tsx`, `loading.tsx` files** — use `notFound()` (line 83)
10. **Filter state in URL search params** — not `useState` alone on list/table pages (line 84)
11. **No `revalidateTag`** — use `revalidatePath` only (line 94)
12. **No `useActionState`, `{ success, error }` envelopes** — throw on error, redirect with `?success=` (line 97)
13. **No `useOptimistic`** — use `await action(); router.refresh()` (line 107)
14. **No `cn()` / `clsx` / `tailwind-merge`** — use template literals (line 124)
15. **No `console.error` for logging** — intentionally no structured logger (line 141)
16. **`process.env` only in `lib/prisma`, `lib/auth`, `lib/uploads`** (line 136)
17. **No `NEXT_PUBLIC_*` variables** (line 137)
18. **`dangerouslySetInnerHTML` only for RichTextEditor-sourced content** (line 113)
19. **No cookies/localStorage for per-user state** — use `UserSetting` table (line 119)
20. **Breadcrumbs on entity detail pages** — required structure documented (line 86)
21. **`cache()` from React only when reader called 2+ times per request** (line 99)
22. **Import via `@/...` across feature boundaries** (line 87)
23. **Modal dialogs forbidden for delete/cancel** — use inline state (line 106)
24. **`window.print()` only on `/print` routes** — link to print page elsewhere (line 132)
25. **Reports dual layout** — mobile card + desktop table (line 130)
26. **Print routes use `PrintHeader`** (line 205)
27. **Reports must not call `requireAuth()`** — carve-out for share routes (line 156)
28. **`formatBreakoutSessionName` applied to BREAKOUT_BLOCK functions** (line 303-313)
29. **`searchAssignedEventVendors` only for vendor pickers** — order forms use `getResponsiblePartyVendors` + `flattenResponsiblePartyOptions` (line 280)

---

## Findings

### [F-001] Missing `requireAuth()` on mutation Server Actions

**Severity:** Critical  
**Locations:** (17 violations)
- `src/app/events/actions.ts:22` (createEvent)
- `src/app/events/actions.ts:45` (updateEvent)
- `src/app/events/actions.ts:70` (deleteEvent)
- `src/app/events/actions.ts:92` (addEventKeyStaff)
- `src/app/events/actions.ts:103` (updateEventKeyStaff)
- `src/app/events/actions.ts:118` (removeEventKeyStaff)
- `src/app/events/actions.ts:123` (createContactAndAddKeyStaff)
- `src/app/contacts/actions.ts:22` (createContact)
- `src/app/contacts/actions.ts:44` (updateContact)
- `src/app/contacts/actions.ts:65` (deleteContact)
- `src/app/venues/actions.ts:16` (createVenue)
- `src/app/venues/actions.ts:39` (updateVenue)
- `src/app/venues/actions.ts:80` (updateVenueVendorDetails)
- `src/app/vendors/actions.ts:56` (createVendor)
- `src/app/vendors/actions.ts:73` (updateVendor)
- `src/app/vendors/actions.ts:87` (deleteVendor)
- `src/app/files/actions.ts:3` (deleteFile)

**Pattern:** Mutation functions (create/update/delete/add/remove/bulk) exported without `await requireAuth()` or `await requireAdmin()` as their first line.

**Evidence:**
```tsx
// src/app/events/actions.ts:22
export async function createEvent(formData: FormData) {
  const name = formData.get("name") as string;
  // ... no requireAuth() call
  await prisma.event.create(...)
}
```

**Rule violated:** 4 (Auth is defense-in-depth)  
**Confidence:** High

---

### [F-002] Missing `requireAuth()` on vendor-related mutation actions

**Severity:** Critical  
**Locations:** (16 violations)
- `src/app/vendors/actions.ts:136` (createAndAddVendorContact)
- `src/app/vendors/actions.ts:156` (addVendorContact)
- `src/app/vendors/actions.ts:172` (updateVendorContact)
- `src/app/vendors/actions.ts:184` (removeVendorContact)
- `src/app/vendors/actions.ts:193` (addVendorToEvent)
- `src/app/vendors/actions.ts:207` (removeVendorFromEvent)
- `src/app/vendors/actions.ts:215` (removeDefaultVendor)
- `src/app/vendors/actions.ts:223` (addVendorToAVOrder)
- `src/app/vendors/actions.ts:232` (updateAVOrderVendor)
- `src/app/vendors/actions.ts:242` (removeVendorFromAVOrder)
- `src/app/vendors/actions.ts:251` (addVendorToCateringOrder)
- `src/app/vendors/actions.ts:260` (updateCateringOrderVendor)
- `src/app/vendors/actions.ts:270` (removeVendorFromCateringOrder)
- `src/app/vendors/actions.ts:279` (addVendorToSetupOrder)
- `src/app/vendors/actions.ts:288` (updateSetupOrderVendor)
- `src/app/vendors/actions.ts:298` (removeVendorFromSetupOrder)
- `src/app/vendors/actions.ts:307` (addVendorToPrintOrder)
- `src/app/vendors/actions.ts:316` (updatePrintOrderVendor)
- `src/app/vendors/actions.ts:326` (removeVendorFromPrintOrder)

**Pattern:** Vendor junction/linking operations without `requireAuth()` guard.

**Rule violated:** 4 (Auth is defense-in-depth)  
**Confidence:** High

---

### [F-003] Missing `export const dynamic = "force-dynamic"` on authenticated pages

**Severity:** High  
**Locations:**
- `src/app/workflows/new/page.tsx` (line ~6)
- `src/app/users/new/page.tsx` (line ~6)

**Issue:** These are authenticated pages that fetch and render dynamic content but lack the required `export const dynamic = "force-dynamic"` declaration. Per CLAUDE.md line 80, every authenticated page must declare this.

**Evidence:**
```tsx
// src/app/workflows/new/page.tsx:6
export default async function NewWorkflowPage() {
  await requireAdmin();
  // ... page logic
}
// Missing: export const dynamic = "force-dynamic"
```

**Rule violated:** 7 (force-dynamic on authenticated pages)  
**Confidence:** High

---

### [F-004] `searchAssignedEventVendors` used on order form pages instead of `getResponsiblePartyVendors` + `flattenResponsiblePartyOptions`

**Severity:** Medium  
**Locations:**
- `src/app/events/[id]/catering-orders/[cateringOrderId]/page.tsx:50` (searchAssignedEventVendors import)
- `src/app/events/[id]/av-orders/[avOrderId]/page.tsx:30` (searchAssignedEventVendors import)
- `src/app/events/[id]/print-orders/[printOrderId]/page.tsx:27` (searchAssignedEventVendors import)
- `src/app/events/[id]/setup-orders/[setupOrderId]/page.tsx:34` (searchAssignedEventVendors import)

**Pattern:** Order form pages import and use `searchAssignedEventVendors` for vendor selection. Per CLAUDE.md line 280, order forms should use `getResponsiblePartyVendors(eventId, "X_ORDER") + flattenResponsiblePartyOptions()`.

**Evidence:**
```tsx
// src/app/events/[id]/catering-orders/[cateringOrderId]/page.tsx:39-50
import { getResponsiblePartyVendors } from "@/app/vendors/actions"; // imported but...
// ...
import { searchAssignedEventVendors } from "@/app/vendors/actions"; // ...this is used instead
```

**Rule violated:** 29 (vendor picker pattern)  
**Confidence:** High

---

### [F-005] `console.error` used for logging

**Severity:** Low  
**Location:** `src/app/api/upload/route.ts:47`

**Issue:** The file uses `console.error("Upload error:", error)` which violates the intent that the project ships without structured logging (line 141).

**Evidence:**
```tsx
console.error("Upload error:", error);
```

**Rule violated:** 15 (no console.error logging)  
**Confidence:** High

---

### [F-006] Event detail page missing breadcrumbs

**Severity:** Medium  
**Location:** `src/app/events/[id]/page.tsx` (no `<Breadcrumbs>` component)

**Issue:** This is an entity detail page but does not render breadcrumbs as required by line 86. Other event-scoped detail pages (functions, presentations, catering orders) all have breadcrumbs; this appears to be the top-level event overview, which may be an exception, but the convention is that detail pages should include them for navigation clarity.

**Evidence:**
```tsx
// src/app/events/[id]/page.tsx:26-74
// No Breadcrumbs import or render
export default async function EventPage({ params }: ...) {
  // Renders PageHeader but no breadcrumbs
}
```

**Rule violated:** 20 (breadcrumbs on entity detail pages)  
**Confidence:** Medium

---

## Summary

The codebase has one **critical** architectural violation: mutation Server Actions across multiple files are missing their required `requireAuth()` / `requireAdmin()` guards. This is a defense-in-depth breach — while middleware gates the routes, the CLAUDE.md explicitly requires self-protection on every action for reviewability and consistency.

Additionally:
- 2 authenticated pages are missing `export const dynamic = "force-dynamic"`
- 4 order form pages use the wrong vendor picker pattern
- 1 logging call violates observability constraints
- 1 detail page may be missing breadcrumbs (though context is ambiguous)

The missing `requireAuth()` calls should be the immediate priority; the other issues are clearer violations in isolated contexts.
