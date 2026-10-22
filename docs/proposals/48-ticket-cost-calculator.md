# #48 — Add ticket cost calculator

## Problem

The title reads as: *"tell me what a ticket has to cost for this event to break even."*

What the code shows today is that we have almost none of the inputs.

- `Event` (`prisma/schema.prisma:318-352`) has **no** budget, revenue, ticket-price or
  attendee-count field. It carries name, dates, timezone, venue, series and relations.
- The only `Decimal` columns in the entire schema are three: `CateringOrderLineItem.unitPrice`
  (`prisma/schema.prisma:796`), and `CateringOrder.rentalMinimum` / `CateringOrder.fbMinimum`
  (`:623-624`).
- `AVOrder`, `SetupOrder`, `PrintOrder`, `SupplyOrder` and `MediaDeliverable` have **no cost
  fields at all** — not on the order, not on `EquipmentItem`, `PrintItem` or `SupplyOrderItem`.
- Head counts exist only per catering order (`expectedCount` / `confirmedCount` /
  `guaranteeCount`), resolved by `firmestGuestCount()` in `src/lib/cateringGuestCount.ts`.
  There is no event-wide attendee number.
- No rollup exists. `getEventOverviewStats()` (`src/app/events/[id]/actions.ts`) counts
  statuses and "needs attention" items only.

So this issue is really two pieces of work: **capture costs**, then **divide them**. The
calculator is the small half.

## Proposed model / UX

### 1. Capture (schema)

Two layers, because event costs split cleanly into "attached to an order" and "not":

- **Order-level estimates.** Add `estimatedCost Decimal?` to the five order models (`AVOrder`,
  `CateringOrder`, `SetupOrder`, `PrintOrder`, `SupplyOrder`). One field, editable from each
  order form, no new UI archetype.
- **Event cost lines.** New `EventCostLine` for everything with no order behind it — venue
  rental, insurance, staff travel, speaker fees:

  ```
  model EventCostLine {
    id, eventId (FK, Cascade), label String, category String?  // CustomOption "cost_category"
    amount Decimal, basis CostBasis @default(FIXED), notes String?
    updatedById, createdAt, updatedAt
  }
  enum CostBasis { FIXED PER_ATTENDEE }
  ```

  `basis` is what makes tiers work: `FIXED` lines do not move with attendance, `PER_ATTENDEE`
  lines do. Order estimates are treated as `FIXED` unless the owner wants a per-head flag there
  too (see open question 1).
- **Attendee count.** Add `expectedAttendees Int?` to `Event`, edited on
  `src/app/events/[id]/settings/page.tsx` via `EventForm`. It seeds the calculator; the
  calculator itself still takes a count from the URL so a what-if is shareable.

### 2. Calculate (UX)

A page at `/events/[id]/costs`, laid out like a report (`ReportNav`, `SectionDivider`,
`reportStyles`, dual mobile-card/desktop-table per CLAUDE.md § Reports) with a `print/` route:

- **Summary** — total fixed, total per-attendee, grand total at the current count.
- **Breakdown** — one row per order and per cost line, grouped by category, no `"Multiple"`
  rollups (§ Aggregation conventions).
- **Break-even tiers** — a table driven by `?attendees=250,400,600` (each value validated by a
  numeric parse before use, per § Pages and routing — an unvalidated list param silently empties
  the table and looks like a backend bug). Each row: attendance, total cost, break-even ticket
  price. With `?price=NNN` also given, add a margin column.

### 3. Auth — the one place this must *not* copy the report archetype

Report data actions in `src/app/events/reports/data.ts` are deliberately **auth-free** so
`/share/[token]` can reuse them. Budget numbers must not inherit that. Recommendation: add a
`COSTS` `PermissionResource` (event-scoped, seeded admin-only like `API_KEYS`), keep
`getEventCostRollup()` in a colocated `src/app/events/[id]/costs/actions.ts` that calls
`requirePermission("COSTS", "VIEW", eventId)`, and do **not** wire the five share surfaces from
`docs/checklists/share-report-integration.md`.

## Two readings

- **(A) Break-even calculator** — roll up costs, divide by attendance, show tiers. This is the
  literal title and what is proposed above. **Recommended.**
- **(B) Per-attendee cost viewer** — no ticket concept, just "this event costs $X per head."
  Strictly a subset of (A); if (A) is right, (B) comes free.

The real fork is *where costs come from*: typed estimates (above) or invoice actuals from #53.
Recommendation: build the reader so each cost source is a function returning
`{ label, amount, basis, sourceHref }[]`, and let #53 add an invoice source later that
**supersedes** the estimate for the same order. One rule, stated once, prevents double-counting.

## Files touched

| File | Change |
|---|---|
| `prisma/schema.prisma` | `EventCostLine` + `CostBasis`; `Event.expectedAttendees`; `estimatedCost` on 5 order models; `COSTS` in `PermissionResource` |
| `prisma/seed.mjs` | `COSTS` in `EVENT_RESOURCES` + `ADMIN_ONLY_RESOURCES`; `cost_category` options |
| `src/app/users/roles/resources.ts` | `COSTS` in `EVENT_SCOPED_RESOURCES` |
| `src/app/events/EventForm.tsx`, `src/app/events/actions.ts`, `src/app/events/core.ts` | `expectedAttendees` field + parse (`formData.get("x") ? parseInt(...) : null` — not blanket `\|\| null`) |
| `src/app/events/[id]/costs/{page.tsx,actions.ts,CostSummary.tsx,CostFilters.tsx,print/page.tsx}` | new — Archetype D shape, authenticated action |
| `src/app/events/[id]/costs/CostLinesPanel.tsx` | CRUD for `EventCostLine`; props-in server actions like `LinkedItemsPanel` |
| `src/components/EventSidebar.tsx` | `NAV` entry with `resource: "COSTS"` |
| `src/app/events/[id]/actions.ts` | optional: total-cost tile on the overview |
| `src/lib/mcpTools/events.ts` | optional: `get_event_cost_summary` (Decimals already serialize as strings via `src/lib/mcpSerialize.ts`) |

Closest archetype: **D (report)** for the page shape, **B (form + server action)** for the
cost-line editor.

## Open questions for the owner

1. Should order-level costs also carry a per-attendee basis (e.g. catering priced per plate), or
   is per-head cost only ever expressed as an `EventCostLine`?
2. Is the output break-even price, or margin against a ticket price you already set? (Decides
   whether we need `Event.ticketPrice` or only a URL param.)
3. Does attendee count belong on `Event` as a planning number, or is it purely a calculator
   input that is never persisted?
4. Should the cost summary ever be shareable through `/share/[token]`, or is admin-only correct?

## Alternatives considered

- **Compute from catering line items only** — `unitPrice` already exists there. Rejected: it
  answers "what does food cost per head," not the issue.
- **Wait for #53 and source everything from invoices** — cleanest data, but invoices arrive after
  the decisions this calculator is meant to inform. Estimates first, actuals later.
- **A `Budget` model with versioned line items and approvals** — over-built for a single-tenant
  internal tool with no approval flow.

## Estimate

**Medium–Large, ~2–3 days.** Schema + permission wiring ~0.5d; cost-line CRUD ~0.5d; rollup
reader + summary/tier page with mobile + print layouts ~1–1.5d; sidebar / overview / MCP ~0.5d.
Excludes #53.
