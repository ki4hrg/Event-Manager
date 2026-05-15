# Bug Review — 2026-05-15

## Bugs Found

---

> **[B-001]** `parseInt(...) || 1` pattern converts quantity 0 to 1
> **Severity:** Medium
> **Location:** `src/app/events/av-orders/actions.ts:404`, `src/app/events/av-orders/actions.ts:421`
> **Issue:** When a user enters `0` as a quantity, `parseInt("0") || 1` evaluates to `1` because `parseInt("0")` is falsy. This silently overwrites user input: if they want zero quantity (e.g., removing an item), the system saves 1 instead. This affects both `createMonitorOutput` and `updateMonitorOutput`. The same pattern appears in presentations and breakout-schedule.
> **Evidence:**
> ```ts
> // av-orders/actions.ts:404
> quantity: parseInt(formData.get("quantity") as string) || 1,
> 
> // Same bug at av-orders/actions.ts:421
> quantity: parseInt(formData.get("quantity") as string) || 1,
> 
> // Same pattern in presentations/actions.ts:154, :206, :604
> // and breakout-schedule/actions.ts:476
> ```
> **Suggested approach:** Use ternary: `formData.get("quantity") ? parseInt(...) : null` or `formData.get("quantity") ? parseInt(...) : 0` depending on whether 0 is valid. Check schema to see if quantity is optional or has a min constraint.
> **Confidence:** High

---

> **[B-002]** Date-only string parsing ignores event timezone, creates wrong local date
> **Severity:** High
> **Location:** `src/app/events/functions/FunctionTableView.tsx:139`, `src/app/events/functions/FunctionTableView.tsx:143`
> **Issue:** `new Date(filters.dateFrom + "T00:00:00")` treats the string as UTC, not the event's timezone. For a date like "2026-02-28" in America/Chicago, this creates midnight UTC = 6pm Feb 27 Chicago local time. Comparisons against `earliest` (stored in UTC from database) then fail silently — filters show no results or wrong functions. CLAUDE.md explicitly warns: "Date-only strings like `"2026-02-28"` parsed with `new Date(dateKey)` = midnight UTC = wrong local date."
> **Evidence:**
> ```ts
> if (filters.dateFrom) {
>   const from = new Date(filters.dateFrom + "T00:00:00");  // UTC, not event timezone
>   if (!earliest || earliest < from) return false;
> }
> if (filters.dateTo) {
>   const to = new Date(filters.dateTo + "T23:59:59");      // UTC, not event timezone
>   if (!earliest || earliest > to) return false;
> }
> ```
> **Suggested approach:** The function does not have access to timezone; lift both the dateFrom/dateTo filtering and the timezone from the parent page component (`src/app/events/[id]/functions/page.tsx`), or fetch the event in the client component. Use `new Date(dateKey + "T12:00:00Z")` as a workaround if keeping the current structure, or use `Intl.DateTimeFormat` with the event timezone to normalize local midnight to UTC.
> **Confidence:** High

---

> **[B-003]** Unhandled promise rejection in EventSidebar.useEffect
> **Severity:** Medium
> **Location:** `src/components/EventSidebar.tsx:336`
> **Issue:** `getSidebarItems(eventId, currentSection).then((data) => ...)` has no `.catch()` handler. If the server action throws, the error is silently swallowed and the sidebar remains in a stale or blank state. Users won't see an error message and may think the app is frozen.
> **Evidence:**
> ```ts
> getSidebarItems(eventId, currentSection).then((data) => {
>   if (!cancelled) setItems(data);
> });
> // No .catch() — errors are silent
> ```
> **Suggested approach:** Add `.catch((error) => { if (!cancelled) { console.error(error); setError(error.message); } })` or use `async/await` with try/catch inside an async effect wrapper.
> **Confidence:** High

---

> **[B-004]** ShareReportButton unhandled errors in server action calls
> **Severity:** Medium
> **Location:** `src/components/ShareReportButton.tsx:78`, `src/components/ShareReportButton.tsx:86`
> **Issue:** Inside `handleCreate` and `handleRevoke`, calls to `listShareLinksForReport` after a mutation have no error handling. If the second fetch fails (e.g., network error, server error), the UI shows a stale list and the user may think the action succeeded when it didn't. The component also doesn't catch errors from `createShareLink` or `revokeShareLink` themselves, only from the list refresh.
> **Evidence:**
> ```ts
> function handleCreate() {
>   startTransition(async () => {
>     const link = await createShareLink({...});  // No error handling
>     setCreatedToken(link.token);
>     const updated = await listShareLinksForReport(eventId, reportType);  // Error silently swallowed
>     setExistingLinks(updated as ExistingLink[]);
>   });
> }
> 
> async function handleRevoke(id: string) {
>   setRevoking(id);
>   await revokeShareLink(id);  // No error handling
>   const updated = await listShareLinksForReport(eventId, reportType);  // Error silently swallowed
>   setExistingLinks(updated as ExistingLink[]);
>   setRevoking(null);
> }
> ```
> **Suggested approach:** Wrap calls in try/catch and set an error state (or use a toast component) to notify the user. Example: `try { const updated = await listShareLinksForReport(...); setExistingLinks(updated); } catch (e) { setError(e.message); }`.
> **Confidence:** High

---

> **[B-005]** Timeline item creation uses raw Date constructor on time input
> **Severity:** Medium
> **Location:** `src/app/events/catering-orders/actions.ts:192`, `src/app/events/catering-orders/actions.ts:213`
> **Issue:** `new Date(formData.get("startTime") as string)` directly parses a `<input type="time">` or `<input type="datetime-local">` string without converting it to the event's timezone. If the form sends "14:30" or "2026-02-28T14:30", this is treated as UTC, not the event's local time. The same issue appears in `updateTimelineItem`.
> **Evidence:**
> ```ts
> export async function createTimelineItem(cateringOrderId: string, eventId: string, formData: FormData) {
>   const startTime = new Date(formData.get("startTime") as string);  // UTC parse
>   const endTimeStr = formData.get("endTime") as string;
>   // ...
>   await prisma.timelineItem.create({
>     data: { startTime, endTime: endTimeStr ? new Date(endTimeStr) : null, ... }
>   });
> }
> ```
> **Suggested approach:** Fetch the event's timezone from the database and use `parseDateTimeInTimezone()` (already defined in `src/app/events/functions/actions.ts` and `src/app/events/breakout-schedule/actions.ts`) to convert the input properly. For catering timeline items, the user likely expects local time entry, so this is a real data integrity issue.
> **Confidence:** High

---

> **[B-006]** Possible undefined access after Promise.all in presentations
> **Severity:** Low
> **Location:** `src/app/events/presentations/actions.ts:480`
> **Issue:** After `Promise.all([getResponsiblePartyVendors(...), findUnique(...)])`, the code assumes `presentation?.speakers` exists. If the presentation is deleted between the query and the mapping, `presentation` will be null and `presentation?.speakers.map()` safely returns undefined (due to optional chaining), but the subsequent code assigns `??[]` which salvages it. This is not a bug per se, but it's a pattern that could hide race conditions: if a concurrent deletion occurs, the component silently renders an empty array instead of showing an error.
> **Evidence:**
> ```ts
> const [options, presentation] = await Promise.all([
>   getResponsiblePartyVendors(eventId),
>   prisma.presentation.findUnique({...}),
> ]);
> const contacts =
>   presentation?.speakers.map(s => ...) ?? [];
> ```
> **Suggested approach:** If presentation is null, return early with an error or empty state. This is a "could become a bug" scenario, not a current bug, so file as Low.
> **Confidence:** Medium

---

## Summary

**6 findings:**
- **Critical:** 0
- **High:** 3 (B-002 date parsing, B-003 unhandled promise, B-004 share button errors)
- **Medium:** 2 (B-001 parseInt pattern, B-005 timeline dates)
- **Low:** 1 (B-006 race condition possibility)

**Key themes:**
1. **Number parsing:** `parseInt(...) || fallback` silently converts 0 to fallback.
2. **Timezone handling:** Multiple locations parse date strings as UTC instead of event timezone.
3. **Unhandled promises:** Client-side async operations lack error handling.
