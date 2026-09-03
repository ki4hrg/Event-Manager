# Proposal — #60 Tracking venue inventory / capabilities (equipment, F&B, etc.)

Status: draft for owner review. No code written.

## Problem

`Venue` (`prisma/schema.prisma:355-376`) holds a name, address, `notes`, `Room[]`,
`RoomGroup[]`, `VenueContact[]`, files, and an optional 1:1 `Vendor`
(`Vendor.venueId @unique`, `schema.prisma:1083`). `Room` (`schema.prisma:391-413`)
holds a name, `capacity`, `notes` and a group.

Nothing records what the venue *has* — how many 6' rounds are in house, whether
the ballroom has a house PA, what the loading dock takes, whether the kitchen can
do a nut-free service. It lives in `Venue.notes` or in someone's inbox, and is
re-derived from scratch on every order.

The codebase has already drawn the right distinction one level over.
**`Equipment`** (`schema.prisma:213-238`) is a global catalog of *types*
(`@@unique([category, name])`), referenced by `EquipmentItem`, `InputItem`,
`MonitorMix`, `MonitorOutput`, `SupplyOrderItem` and `InventoryItem`.
**`InventoryItem`** (`schema.prisma:269-309`) is an *instance at a place we own* —
required `equipmentId`, required `locationId` into the `StorageLocation` tree,
`Restrict` on both. `reviews/claudemd/candidates.md` records why: a `locationId`
on `Equipment` cannot express twelve easels across three pallets without catalog
rows named "Easel (Pallet A)" polluting every picker. **Venue stock is the same
shape one step out: instances at a place we do not own.**

Also already true: "the venue provides this" is expressible.
`ResponsiblePartyOptions` (`src/app/vendors/actions.ts:39-70`) segregates
`systemVendor` (us), `venueVendor` (`Venue.vendor`) and third-party `vendors`, and
every provider picker renders those three groups. What is missing is (a) any
record of what the venue can supply, and (b) any feedback in the form — nothing
tells you the venue has 40 rounds when you have just asked for 60.

## Two readings

**(A) Inventory** — countable stock the venue owns: tables, chairs, linens, house
mics, projectors, pipe-and-drape. Quantitative, and per-room as often as
venue-wide.
**(B) Capabilities** — qualitative facts: house PA, freight elevator, ceiling
height 18', hard-line drop, kitchen restrictions, corkage policy.

**Recommended: both as two shapes, ship (A) first.** Collapsing them yields either
a quantity column that is null on most rows or a capability list you cannot count.
(A) is the one that changes order forms and pays for itself; (B) is a structured
replacement for `Venue.notes` and can follow.

## Proposed model

**`VenueStock`** — `venueId` (Cascade); `roomId String?` (SetNull; null means
house-wide / central store); `equipmentId` **required**, `Restrict`, for the same
reason `InventoryItem.equipmentId` is — stock is only answerable across rooms and
venues if it points at the catalog; `quantity Int?`; `chargeable Boolean @default(false)`
(venue has it, but it is not complimentary); `notes`, `archived`, `sortOrder`;
indexes on all three FKs.

**`VenueCapability`** — `venueId` (Cascade), `roomId String?` (SetNull),
`type String` (a `venue_capability` CustomOption label), `value String?`
("18 ft", "3-phase 200A", "Nut-free on request"), `notes`, `sortOrder`. `type` is a
plain CustomOption, not an enum — nothing branches on it, so the
enum-plus-CustomOption pattern used for `StorageLocation.kind`/`type` is overkill.
Seed a starter set in `prisma/seed.mjs`: Ceiling Height, House PA, Loading Dock,
Freight Elevator, Rigging Points, Power, Internet, Kitchen Restrictions, Corkage.

**Why not reuse `InventoryItem` + `StorageLocation`.** A `StorageLocation` is a
durable home *we own and pack from*: `InventoryItem.locationId` is required and
`Restrict`, containers travel, and the whole tree is read on every packing-list
poll (`src/lib/storageLocations.ts`, `getLocationIndex()`). Hanging venue rooms off
that tree puts someone else's ballroom into our packing list and into that poll.
Venue stock is neither ours nor packable — a sibling model, not a sub-tree.

## Proposed UX

**Venue detail gets tabs.** `src/app/venues/[id]/page.tsx` is one long page today
(`VenueForm` + `RoomList` + `ContactList` + vendor block + `FileUploadPanel`);
two more inline sections make it unusable. Add `VenueTabs.tsx` modelled on
`src/app/equipment/EquipmentTabs.tsx`: Overview · Rooms · Contacts · **Inventory**
· **Capabilities** · Files.

**Editing stock.** Inline rows in the shape of
`src/app/storage-locations/locations/[locationId]/LocationContents.tsx` — grouped
by room, with a "House-wide" group for `roomId: null`; equipment picker from
`getEquipment()`; quantity, chargeable, notes. The inline "＋ New equipment"
affordance must be gated on `EQUIPMENT` WRITE and **absent**, not disabled, for
non-admins — `EQUIPMENT` is admin-only in the seed while venue editing is not, and
`reviews/claudemd/candidates.md` records this split biting the inventory work.

**Where it pays off — order forms.** The models are scaffolding; this is the feature.

1. **Annotate the equipment picker** with availability for the order's room:
   `6' Round — venue has 40`. `SetupOrder` and `SupplyOrder` carry a `roomId`
   directly; `AVOrder` does not and must resolve rooms via linked functions
   (`FunctionRoom`) — so start with the two that have one.
2. **Warn on over-request.** When the provider is the `venueVendor` and the
   requested quantity exceeds `VenueStock.quantity` for that room, render a
   non-blocking warning in the register of `ConflictWarning.tsx` /
   `PackingProcurementWarning.tsx`. Not a hard validation — no runtime schema
   library, single-tenant trust model, and the venue can truck more in.
3. **Prefill the provider** to `venueVendor` when the picked equipment has venue
   stock in the room and none is set. Opinionated; see open question 4.

**Permissions.** `VENUES` exists and is GLOBAL — ride it, no new resource. Note
the trap in `candidates.md`: a GLOBAL-only resource resolved *with* an `eventId`
yields ASSIGNED scope → no row → NONE, so calls from event-scoped pages must
resolve `VENUES` at GLOBAL.

**Reports.** Nothing new for v1. Equipment Responsibility already groups by
provider, and `venueVendor` is a provider — so once setup rows are attributed
(proposal **#42**, the natural companion to this one) a "venue-provided" group
appears with no report work. A Venue Capability Sheet for site visits is a
follow-up.

## Files touched

- `prisma/schema.prisma` — `VenueStock`, `VenueCapability`, back-relations on `Venue`, `Room`, `Equipment`; `prisma/seed.mjs` — `venue_capability` options
- `src/app/venues/VenueTabs.tsx` (new); `src/app/venues/[id]/page.tsx` split into tab routes
- `src/app/venues/{VenueStockList,VenueCapabilityList}.tsx` (new, `"use client"`)
- `src/app/venues/{core,actions}.ts` — `*Core(args, userId)` CRUD pairs
- `src/lib/venueStock.ts` (new) — `getVenueStockForRoom`, availability lookup, over-request comparison; plain module, not `"use client"`
- `src/app/events/setup-orders/SetupTableList.tsx`, `catering-orders/EquipmentTable.tsx`, `supply-orders/SupplyOrderItemPanel.tsx` — annotation + warning
- `src/app/events/[id]/setup-orders/[setupOrderId]/page.tsx` and siblings — fetch stock in the existing `Promise.all`
- `src/lib/mcpTools/` — `list_venue_stock`; `list_equipment_catalog` already exists to discover the required `equipmentId`

## Open questions for the owner

1. Is venue stock in practice **per-room** or **venue-wide**? The nullable `roomId`
   supports both, but if it is always venue-wide the room column and the per-room
   annotation drop out entirely.
2. **What does "F&B" mean here?** Menus and quantities live on `CateringOrder`. Is
   the venue-level fact set qualitative (kitchen restrictions, corkage, minimum
   spend, service styles offered) — i.e. `VenueCapability` — or is there countable
   F&B stock (china, chafers, linens) that belongs in `VenueStock`?
3. Should `VenueStock.equipmentId` be **required** (catalog-only, like
   `InventoryItem`) or allow free-text rows? Required makes stock answerable across
   venues; it also means a non-admin cannot record a venue item whose type is not
   yet in the admin-only catalog.
4. Should picking equipment the venue stocks **auto-set the provider** to the
   venue, or only display availability and leave the choice alone?

## Alternatives considered

- **Nullable `venueId` on `StorageLocation`, reusing `InventoryItem`** — one model,
  one UI. Rejected above: it merges someone else's building into our packing tree
  and its 15-second poll.
- **A `models[]`-style array on `Equipment`** marking "commonly available at
  venues" — trivially cheap, but venue-independent, so it cannot answer "does
  *this* venue have 60", which is the whole question.
- **Free text in `Venue.notes` with a template** — zero schema work and honestly
  adequate for (B) alone. It is (A), countable stock feeding order forms, that
  cannot be done this way.
- **Per-event snapshot** of what the venue confirmed for *this* event, distinct
  from what they own. A real distinction, deliberately deferred: the
  durable-default-plus-per-event-override pattern from `StorageLocation`
  (`override ?? default`) can be layered on later without changing this model.

## Estimate

**Medium-large, three PRs.** PR1 — inventory only (~600 lines): `VenueStock`,
venue tabs refactor, stock list UI, `src/lib/venueStock.ts`; no order-form changes.
PR2 — order-form surfacing (~250 lines): annotation and over-request warning on the
two order types carrying a `roomId`. PR3 — capabilities (~250 lines). PR1+PR2 pair
naturally with proposal **#42**; doing #42 first means the "venue-provided"
grouping is already in the Equipment Responsibility report when the data arrives.
