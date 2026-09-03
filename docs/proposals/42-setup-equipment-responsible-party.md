# Proposal — #42 Responsible party on equipment rows populated from the setup table

Status: draft for owner review. No code written.

## Problem

A `SetupOrder` carries three independent row collections, and they have wildly
uneven capacity to say who is responsible for a row:

| Collection | Party fields today | File |
|---|---|---|
| `EquipmentItem` (`setupOrderId`) | provider vendor **or** contact, operator vendor **or** contact — four FKs | `prisma/schema.prisma:667-704` |
| `SetupTable` | `providerVendorId` only | `prisma/schema.prisma:755-773` |
| `SetupOrderDetail` | `responsiblePartyVendorId` only | `prisma/schema.prisma:774-789` |
| `SetupOrder` header | **nothing** — only the `SetupOrderVendor` many:many ("vendors involved") | `prisma/schema.prisma:705-731` |

The Equipment Responsibility report is where this hurts.
`getEquipmentResponsibilityData` (`src/app/events/reports/actions.ts:145`) explodes
each `SetupTable` row into up to two equipment rows (`table:<type>` and
`chair:<type>`, `actions.ts:368-412`) and hardcodes:

```ts
attributionContactId: null,
attributionContactName: null,
```

So a setup-table row can never be attributed to a Contact, only to a Vendor. And
because there is no order-level provider to fall back on, every row with a blank
`providerVendorId` lands in the single `__unassigned__` bucket
(`actions.ts:481-487`) — indistinguishable from a row someone deliberately left
open.

That is the mixed case in the issue title. One setup table for one ballroom
routinely mixes house tables and chairs the venue owns, specialty pieces rented
from a third party, and a couple of things we trucked in ourselves. Today the only
way to express the mix is to set the vendor on every single row by hand, with no
default, no operator, and no way for the report to say "these came from the venue's
own stock" versus "these are on a rental invoice".

Note that "venue-owned vs rental" is *already expressible* in the vendor
vocabulary: `ResponsiblePartyOptions` (`src/app/vendors/actions.ts:39-70`)
segregates `systemVendor` (`Vendor.isSystemVendor` — us), `venueVendor`
(`Venue.vendor`, the 1:1 in `prisma/schema.prisma:1083`), and everything else.
`ResponsiblePartyField` already renders those as three option groups. What is
missing is not a new ownership concept — it is per-row capacity plus a default.

## Two readings of the title

**(A) Narrow — capacity + inheritance.** Give `SetupTable` the same party-carrying
capacity `EquipmentItem` already has, add an order-level default that flows down
to un-overridden rows, and teach the report to render the venue/rental distinction
from the vendor identity it already has.

**(B) Broad — a new ownership axis.** Add an explicit enum on the row
(`VENUE_OWNED` / `RENTAL` / `OWN_STOCK`) orthogonal to "who provides".

**Recommended: (A).** (B) stores the same fact twice — a row whose provider is the
`venueVendor` and whose enum says `RENTAL` is a contradiction the database will
happily accept, and someone has to reconcile it forever. The `Equipment` /
`InventoryItem` decision in `reviews/claudemd/candidates.md` made the same call:
model the thing once and derive the label.

## Proposed model

**1. Schema (`prisma/schema.prisma`).** All nullable, no backfill.

- `SetupOrder` gains `providerVendorId` / `providerContactId` (+ indexes) —
  the exact shape `SupplyOrder` already carries (`schema.prisma:1477-1481`).
- `SetupTable` gains `providerContactId`, and (see open question 1)
  `operatorVendorId` / `operatorContactId` — mirroring the `partySelect` quad
  used in `src/app/events/reports/actions.ts:852-856`.
- `SetupOrderDetail` gains `responsiblePartyContactId`. Keep the existing column
  name; renaming it costs a migration for no gain.

**2. Inheritance is resolved at read time, never denormalized.** Copy
`resolveProvider` from `src/app/events/supply-orders/SupplyOrderItemPanel.tsx:512`
verbatim in spirit:

```ts
own ?? inherited  // plus an `inherited: boolean` the UI renders as muted text
```

Writing the order default onto the row at create time would mean changing the
order default no longer moves the rows that never opted out — which is the whole
point of having a default.

**3. Form UI.** Replace `ResponsiblePartyField` with `PartyField`
(`src/app/events/av-orders/party-field.tsx`) in `SetupTableList`'s `RowForm`
(`src/app/events/setup-orders/SetupTableList.tsx:86-206`) and in
`SetupOrderDetailTable`. Feed it from `getResponsibleParties({ eventId,
modelType: "SETUP_ORDER", functionIds, presentationIds })`
(`src/lib/responsibleParties.ts`) — the same pooled vendor+contact source the AV
order forms use, which already pulls speakers and function contacts into range.
A row with no own value renders `Provider: Grand Hyatt · from order` in muted text,
matching how `SupplyOrderItemPanel` shows inherited providers.

**4. Report.** In the `setupTables` loop (`actions.ts:368-412`), replace the
hardcoded nulls with the resolved row-or-order party. Add
`partyKind: "system" | "venue" | "vendor" | "contact" | "unassigned"` to
`ResponsiblePartyGroup` (`actions.ts:39-44`), derived by comparing the party id
against `getResponsiblePartyVendors`'s `systemVendor` / `venueVendor`. The report
body then badges or splits venue-provided versus rental **without** a `"Multiple"`
rollup and without a stored enum — every row stays concrete, per CLAUDE.md
§ Reports § Aggregation conventions.

## Files touched

- `prisma/schema.prisma` — 5 nullable FKs + indexes on `SetupOrder`, `SetupTable`, `SetupOrderDetail`
- `src/app/events/setup-orders/core.ts` — `SetupTableWriteArgs` (:294), `SetupOrderDetailWriteArgs` (:355), `createSetupTableCore` (:303), `updateSetupTableCore` (:322), and the setup-order header write
- `src/app/events/setup-orders/actions.ts` — `parseSetupTableData` (:217), the detail parser (:251), `getSetupOrder`'s include (:64)
- `src/app/events/setup-orders/SetupTableList.tsx` — `RowForm` party field, row display, inherited badge
- `src/app/events/setup-orders/SetupOrderDetailTable.tsx` — same
- `src/app/events/setup-orders/SetupOrderForm.tsx` — order-level default provider
- `src/app/events/[id]/setup-orders/[setupOrderId]/page.tsx` — swap `getResponsiblePartyVendors` for `getResponsibleParties`, pass the pool down
- `src/app/events/reports/actions.ts` — `getEquipmentResponsibilityData` setupTables loop (:368-412), `ResponsiblePartyGroup` (:39), `getVendorHandoffData`'s `tables` include (:975-978)
- `src/app/events/[id]/reports/equipment-responsibility/EquipmentResponsibilityReport.tsx` — venue/rental badge, mobile card + desktop table
- `src/app/events/[id]/reports/vendor-handoff/VendorHandoffReport.tsx` — setup tables now reachable by contact-provider
- `src/lib/mcpTools/` — setup-order tool shapes if the party fields should be readable over MCP

## Open questions for the owner

1. Does a setup-table row ever need an **operator** distinct from its provider?
   Chairs are usually set by whoever supplies them. If never, drop the operator
   pair from `SetupTable` — that halves both the migration and the form.
2. Should the order-level default be new `providerVendorId`/`providerContactId`
   columns (the `SupplyOrder` shape), or should the existing `SetupOrderVendor`
   junction supply it (no new columns, but it needs a "primary" flag and the
   junction currently means "vendors involved", not "who provides")?
3. Is "venue-owned" always `Venue.vendor`, or does the team distinguish venue
   departments (in-house AV vs banquet vs housekeeping) that each need their own
   party?
4. On the Equipment Responsibility report, should venue-provided and rental be
   **separate sections** with their own totals, or the same party cards with a
   badge?

## Alternatives considered

- **Ownership enum on the row** — rejected above; two sources of truth.
- **Fold `SetupTable` into `EquipmentItem`** — one row type, one party shape,
  no new columns. Rejected for now: `SetupTable` expands `quantity × chairCount`
  into two equipment rows from one input row, and `aggregateSetupTables`
  (`src/app/events/setup-orders/utils.ts`) plus the totals panel depend on that
  shape. Worth parking in `reviews/refactors/candidates.md` rather than doing here.
- **Order-level provider only, no per-row override** — cheapest, but the issue
  title is specifically about a *mix* within one table.

## Estimate

**Medium.** One migration (5 nullable columns + indexes, no backfill), ~3 form
components, 2 report loops, plus the MCP shapes. Roughly 400–600 changed lines
across ~10 files. Splits cleanly into two PRs: schema + forms + inheritance
first, report venue/rental rendering second.
