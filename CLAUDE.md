# Event Manager Tool

## Summary
Internal tool for managing conferences and events, with emphasis on speaker and facility management. Focused on backend processes:

- Contract and vendor management
- Facility/room scheduling
- Speaker logistics (travel, accommodations)
- Catering management
- Audio/video planning

Not attendee-facing; for internal staff use only.

## Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Styling**: Tailwind CSS
- **Deployment**: Docker Compose

## Data Models

### Core Entities
- **Event** - Top-level container (a conference or event)
- **Venue** - Physical location containing one or more rooms
- **Room** - Individual bookable space within a venue
- **Function** - Fundamental scheduling unit; represents a room setup/configuration for a time period
- **Contact** - Flexible contact model with roles (Speaker, Venue Contact, Vendor, Staff, Other)

### Function Subtypes
- **Meal/BEO** - Catering function with banquet event order details
- **Breakout Session** - Smaller concurrent sessions
- **Plenary Session** - Main stage/all-attendee sessions

### Key Relationships
- Event has many Functions
- Function belongs to one or more Rooms (combined rooms supported)
- Function has a fixed setup; if location moves, create new Function
- Function can span multiple time slots (e.g., daily staff hospitality room)
- Contacts are assigned to Functions (many-to-many) with role
- Contacts can be linked to Venues (e.g., venue sales contact)
- Meals, Breakouts, and Plenaries extend Function

### Future Entities (not MVP)
- Vendor
- Contract
- Travel Arrangement
- Accommodation

## AV Requirements
Functions include high-level AV needs (projector, screen, microphone, etc.) as checklist/notes. Designed to generate handoff reports for venue/AV providers rather than track inventory.

## Architecture Principles
- Mobile-first responsive design
- Single-tenant (no multi-org access controls for now)
- Modular structure for future extensibility
- Lightweight Docker deployment

## Project Structure
```
/app              # Next.js App Router pages
/components       # React components
  /ui             # Base UI components (buttons, inputs, etc.)
  /features       # Feature-specific components
/lib              # Utilities, helpers
/prisma           # Schema and migrations
/types            # Shared TypeScript types
```

## Commands
```bash
npm run dev       # Start development server
npm run build     # Production build
npm run db:push   # Push schema changes to database
npm run db:studio # Open Prisma Studio
docker compose up # Run full stack in containers
```

## Vendor Model Types

Vendors are tagged with one or more "model types" that indicate which order types they service. This drives vendor picker filtering so users only see relevant vendors.

### Where things live

- **`ModelType` union** — `src/app/vendors/actions.ts` (exported type, line ~210):
  ```ts
  export type ModelType = "CATERING_ORDER" | "AV_ORDER" | "SETUP_ORDER";
  ```
- **Display constants** — `src/app/vendors/model-types.ts` (no `"use server"` directive, importable by client components):
  ```ts
  export const MODEL_TYPES = [
    { value: "CATERING_ORDER", label: "Catering Order" },
    { value: "AV_ORDER", label: "AV Order" },
    { value: "SETUP_ORDER", label: "Setup Order" },
  ] as const;

  export const MODEL_LABELS: Record<string, string> = Object.fromEntries(
    MODEL_TYPES.map(({ value, label }) => [value, label])
  );
  ```
  Always import from this file for display — never re-declare the array or labels inline.

### Filter behavior

`searchAssignedEventVendors(query, eventId, modelType?)` in `src/app/vendors/actions.ts` applies:
```ts
OR: [{ models: { isEmpty: true } }, { models: { has: modelType } }]
```
Vendors with an empty `models` array are treated as general-purpose and appear in every picker regardless of `modelType`.

### Adding a new model type

1. Add the string value to `ModelType` in `src/app/vendors/actions.ts`
2. Add a `{ value, label }` entry to `MODEL_TYPES` in `src/app/vendors/model-types.ts` — `MODEL_LABELS` is derived automatically
3. In the new order type's page/component, pass the new `ModelType` value to `searchAssignedEventVendors`
4. No changes needed to `VendorPanel`, `EventVendorList`, or the filter logic — they handle any `ModelType` generically

## Order List & Bulk Edit Pattern

Every order type follows this structure. When adding a new order type, replicate it exactly.

### File layout
- `src/app/events/[order-type]/[OrderType]List.tsx` — `"use client"` component with list view, table view, selection, and bulk edit
- `src/app/events/[order-type]/actions.ts` — server actions including `get*`, `delete*`, `delete*s` (bulk), and `bulkUpdate*`
- `src/app/events/[id]/[order-type]/page.tsx` — thin server component: fetches data, defines inline `"use server"` wrapper actions, renders `<[OrderType]List>`

### Selection state
- `useState<Set<string>>` for row selection
- Selection bar appears when `selected.size > 0`; shows count, "Bulk edit" toggle, "Delete selected", "Clear selection"
- `showBulkEdit` state controls the inline edit panel below the bar

### Bulk edit panel
- Status: `EDIT_STATUS_OPTIONS` from `src/lib/statusConstants.ts`
- Substatus: `getSubstatusOptions()` from `src/app/settings/actions.ts` → `CustomOption[]`, filtered by selected status via `group` field
- Vendor: `getResponsiblePartyVendors(eventId, "X_ORDER")` + `flattenResponsiblePartyOptions()` — vendor replace pattern: `deleteMany` then `createMany` on the junction table
- Function link: `getFunctionOptions(eventId)` — for many:many junctions (PrintOrder, SetupOrder), bulk-add is safe (skip existing). For 1:1 FK (CateringOrder), bulk-replace the FK directly
- Presentation link: same 1:1 FK pattern (AVOrder, PrintOrder via FK)
- After apply: call server action, reset state, `router.refresh()`

### Vendor replace pattern (many:many)
```ts
await prisma.xOrderVendor.deleteMany({ where: { xOrderId: { in: ids } } });
await prisma.xOrderVendor.createMany({ data: ids.map(id => ({ xOrderId: id, vendorId })) });
```

### Status filter — null sentinel
Status filter selects include an `(blank)` option with `value="__blank__"` to filter rows where `status` is null. The filter logic pattern:
```ts
if (filters.status === "__blank__") {
  if (o.status != null) return false;
} else if (filters.status && o.status !== filters.status) return false;
```
Empty string (`""`) means "All / no filter". Never use `null` or `undefined` as a select option value — use the `__blank__` sentinel instead.

### ModelType values
`"AV_ORDER"`, `"CATERING_ORDER"`, `"SETUP_ORDER"`, `"PRINT_ORDER"` — declared in `src/app/vendors/actions.ts`

## Report Layout Pattern

Every report under `/events/[id]/reports/[name]/` must render cleanly on mobile, print without UI chrome, and work in the unauthenticated `/share/[token]/` view. Equipment Responsibility and Vendor Handoff are the reference implementations — replicate their structure.

### File layout
- `src/app/events/reports/actions.ts` — shared server actions for all reports. Report data actions must **NOT** call `requireAuth()` (the share route is unauthenticated)
- `src/app/events/[id]/reports/[name]/page.tsx` — server component; fetches data and renders the filter bar + report
- `src/app/events/[id]/reports/[name]/ReportFilters.tsx` — `"use client"`; accepts `shareButton?`, `hidePrint?`, `basePath?` props for share-view reuse
- `src/app/events/[id]/reports/[name]/[Name]Report.tsx` — report body component; consumed by both `/events/[id]/reports/...` and `/share/[token]/` so changes apply everywhere automatically
- `src/app/events/[id]/reports/[name]/print/page.tsx` — dedicated PDF route using `PrintHeader`

### Required: mobile-friendly tables
Every table in a report renders BOTH a mobile card layout and a desktop/print table:
```tsx
<>
  <div className="sm:hidden print:hidden border border-gray-200 dark:border-gray-700 rounded divide-y divide-gray-200 dark:divide-gray-700 text-xs">
    {rows.map((row) => (
      <div key={...} className="p-2">
        {/* bold item name, qty right-aligned, role/provider/operator stacked muted, italic notes */}
      </div>
    ))}
  </div>
  <div className="hidden sm:block print:block overflow-x-auto">
    <table className="w-full text-sm border-collapse">{/* same data */}</table>
  </div>
</>
```
Tables with ≤ 2 simple columns (e.g. presentation time/room) may skip the mobile card if they fit naturally at 360 px. A `table-fixed` table without a mobile card variant is wrong on mobile — `overflow-x-auto` does nothing because the table never exceeds the viewport width.

### Required: nav, anchors, section dividers
- Render `<ReportNav links={...} />` from `src/components/ReportNav.tsx` as the first child of the report body. It's `sticky top-2 z-10` with `id="top"`, so every section divider can link back to it
- Use `<SectionDivider id="..." title="..." />` from `src/components/SectionDivider.tsx` to group logical regions (Summary, Details, Unscheduled, etc.). Each divider includes a `↑ Top` link automatically
- Every anchored card must include `scroll-mt-24` so jumped-to sections land below the sticky nav rather than under it

### Anchor ID conventions
- Top-level sections: kebab-case (`top`, `summary`, `key-contacts`, `function-schedule`, `equipment-summary`, `details`, `unscheduled`)
- Per-entity: `${kind}-${id}` (`function-${fn.id}`, `presentation-${presentation.id}`, `party-${partyId}`)
- Never use raw composite keys containing `:` or other CSS-unfriendly characters as HTML IDs — compute a clean anchor id separately from the React `key`

### Filter bar conventions
- `ReportFilters` accepts `hidePrint?: boolean` — pass `hidePrint` from `src/app/share/[token]/page.tsx` so only the `ShareShell` header Print button shows
- On mobile (`sm:hidden`), filter chips collapse behind a "Show filters / X active" toggle button. Actions (Clear, Share, Print) remain always visible. Desktop layout unchanged (`hidden sm:flex`)
- Filter state lives in URL search params (bookmarkable, share-friendly, server-rendered)

### Aggregation conventions
- When summarizing items across multiple sources, **never** use `"Multiple"` rollups in the display. Split rows along the dimension that produced the ambiguity (e.g. by `(item, role, provider)`) so each row is concrete
- Sort order: category → item name → role priority (Provider & Operator > Provider > Operator) → provider name

### Print/PDF conventions
- Dedicated print route (`/print`); do NOT print the interactive screen directly
- Use `PrintHeader` (`src/components/print/PrintHeader.tsx`) with `eventName`, `title`, `backHref`
- Filter controls are not rendered on print pages — the URL carries them in
- "Print / Save PDF" button in `ReportFilters` is an `<a href="${basePath}/print?...">`, never `window.print()`
- Use Tailwind class strings from `src/lib/reportStyles.ts` (`reportTh`, `reportTd`, `reportSectionCard`, `reportOrderCard`, `reportGroupRow`, `reportFooterText`) — do not re-declare inline

### Share-view integration
For the full share-link wiring checklist (new `reportType` value, share route branch, `ShareReportButton` prop, etc.), see the existing implementations in `src/app/share/[token]/page.tsx`. Key points:
- Report data actions must be auth-free (no `requireAuth()` calls)
- `basePath={`/share/${token}`}` passed to `ReportFilters` in the share branch
- `hidePrint` passed in the share branch — `ShareShell` already provides Print

### Shared components reference
| Component | Location | Purpose |
|---|---|---|
| `ReportNav` | `src/components/ReportNav.tsx` | Sticky jump-to nav with `id="top"` |
| `SectionDivider` | `src/components/SectionDivider.tsx` | Labeled section ruler with back-to-top link |
| `PrintHeader` | `src/components/print/PrintHeader.tsx` | Print page header (event name, title, back link) |
| `ShareReportButton` | `src/components/ShareReportButton.tsx` | Create/manage share links from a report page |
| `ShareShell` | `src/app/share/[token]/ShareShell.tsx` | Layout shell for the share route (header, Print button, footer) |
| Report style classes | `src/lib/reportStyles.ts` | `reportTh`, `reportTd`, etc. |

## Code Conventions
- Use named exports for components
- Colocate component-specific logic
- Prefer server components; use 'use client' only when needed
- API routes in /app/api following REST conventions
- After creating a new record, redirect to list view (not detail view)
- After updating a record, stay on detail view with success toast
