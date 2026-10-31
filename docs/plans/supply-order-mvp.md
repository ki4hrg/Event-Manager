# Plan: SupplyOrder model — MVP

## Context

Conferences and events run by this team involve a lot of physical stuff that needs to move from "somewhere we have it" to "somewhere at the venue." Today that's tracked informally (spreadsheets, notes fields). The user wants a real model so the team can:

1. **Short-term (this MVP):** Maintain packing-list–style records: a printer goes to the event office in Room 123; signs go to registration; etc. Quickly see "what needs to wind up where."
2. **Medium-term (not in scope, but the architecture must accommodate):** Supply requests from staff/vendors without logins ("Registration needs more pens"); procurement tracking ("we need to order toner").
3. **Long-term (not in scope):** A reusable-inventory system tracking on-hand quantities, source locations, and transport methods.

The MVP delivers (1) while leaving clean seams for (2) and (3). Source-location structure (e.g., "Storage Room A") is deliberately deferred — the long-term inventory shape will dictate what that model looks like, and locking in a `CustomOption`-backed shape now would constrain it.

## Architecture summary

**Mental model.** A `SupplyOrder` is a *destination-bundle* (a "kit"): "Registration Kit," "Event Office Setup," "Welcome Reception Supplies." The order header carries the destination Room and the bundle's identity. Items inside carry the orthogonal dimensions (where they're coming from, whether we have them, how far along they are in packing/delivery).

**Why destination-at-order, source-at-item.** Items in one kit commonly come from multiple sources (some from main office, some from Amazon, some from a vendor delivery), but they all go to one destination. Reports that need to cut across destinations ("everything I need to buy," "everything coming from the truck") are *cross-order item queries*, not new entity types.

**Relationship to neighboring models.**

| Model | Relationship | Why |
|---|---|---|
| `Event` | required `eventId` FK | scoped to one event |
| `Room` | required `roomId` FK | destination is always a room at the venue; non-room destinations (e.g., "main office") are sources, not destinations |
| `Function` | M:M optional via `SupplyOrderFunction` | mirrors PrintOrder/SetupOrder; one kit can serve multiple functions in the same room |
| `Presentation` | M:M optional via `SupplyOrderPresentation` | mirrors AVOrder/SetupOrder; edge-case but useful for workshop props / presenter-specific gear |
| `SetupOrder` | **no direct relationship** — they're peers | SetupOrder = instruction to venue/vendor; SupplyOrder = our packing list. Different parties, different lifecycles. Both can target the same Room independently. |
| `Equipment` | optional FK on items (`SupplyOrderItem.equipmentId`) | matches `EquipmentItem.equipmentId` — reuses the catalog + `GroupedEquipmentSelect` |
| `Vendor` | order-level M:M junction + per-item `providerVendorId` | matches PrintOrder / AVOrder / SetupOrder pattern |

**Closest existing pattern.** `PrintOrder` for the overall shape (simple header + items + vendors + files + function/presentation links), with `SetupOrder`'s `roomId` precedent for the order→Room link.

## Schema changes (`prisma/schema.prisma`)

### New enums

```prisma
enum AcquisitionState {
  ON_HAND
  TO_PROCURE
  FROM_VENDOR
}

enum PackingStatus {
  NEEDED
  PACKED
  DELIVERED
}
```

### New models

```prisma
model SupplyOrder {
  id               String                     @id @default(cuid())
  name             String
  status           EntityStatus?              // workflow lifecycle (PENDING/IN_PROGRESS/COMPLETE/CANCELLED)
  substatus        String?
  packingStatus    PackingStatus?             // logistics lifecycle; updates cascade to items
  eventId          String
  event            Event                      @relation(fields: [eventId], references: [id], onDelete: Cascade)
  roomId           String                     // required destination
  room             Room                       @relation(fields: [roomId], references: [id], onDelete: Restrict)
  specificLocation String?                    // free-text granularity, e.g., "near registration table"
  notes            String?
  functions        SupplyOrderFunction[]
  presentations    SupplyOrderPresentation[]
  items            SupplyOrderItem[]
  vendors          SupplyOrderVendor[]
  files            FileUpload[]
  updatedById      String?
  updatedBy        User?                      @relation("SupplyOrderUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)
  createdAt        DateTime                   @default(now())
  updatedAt        DateTime                   @updatedAt
  @@index([eventId])
  @@index([roomId])
}

model SupplyOrderItem {
  id                String           @id @default(cuid())
  supplyOrderId     String
  supplyOrder       SupplyOrder      @relation(fields: [supplyOrderId], references: [id], onDelete: Cascade)
  description       String
  equipmentId       String?
  equipment         Equipment?       @relation(fields: [equipmentId], references: [id], onDelete: SetNull)
  quantity          Int?
  acquisitionState  AcquisitionState @default(ON_HAND)
  providerVendorId  String?
  providerVendor    Vendor?          @relation("SupplyOrderItemProviderVendor", fields: [providerVendorId], references: [id], onDelete: SetNull)
  packingStatus     PackingStatus    @default(NEEDED)
  notes             String?
  sortOrder         Int              @default(0)
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt
  @@index([supplyOrderId])
}

model SupplyOrderFunction {
  id            String      @id @default(cuid())
  supplyOrderId String
  supplyOrder   SupplyOrder @relation(fields: [supplyOrderId], references: [id], onDelete: Cascade)
  functionId    String
  function      Function    @relation(fields: [functionId], references: [id], onDelete: Cascade)
  @@unique([supplyOrderId, functionId])
}

model SupplyOrderPresentation {
  id             String       @id @default(cuid())
  supplyOrderId  String
  supplyOrder    SupplyOrder  @relation(fields: [supplyOrderId], references: [id], onDelete: Cascade)
  presentationId String
  presentation   Presentation @relation(fields: [presentationId], references: [id], onDelete: Cascade)
  @@unique([supplyOrderId, presentationId])
}

model SupplyOrderVendor {
  id            String      @id @default(cuid())
  supplyOrderId String
  supplyOrder   SupplyOrder @relation(fields: [supplyOrderId], references: [id], onDelete: Cascade)
  vendorId      String
  vendor        Vendor      @relation(fields: [vendorId], references: [id], onDelete: Cascade)
  notes         String?
  @@unique([supplyOrderId, vendorId])
}
```

### Back-references to add on existing models

- `Event`: `supplyOrders SupplyOrder[]`
- `Room`: `supplyOrders SupplyOrder[]`
- `Function`: `supplyOrderLinks SupplyOrderFunction[]`
- `Presentation`: `supplyOrderLinks SupplyOrderPresentation[]`
- `Vendor`: `supplyOrders SupplyOrderVendor[]` + `supplyOrderItemsProvided SupplyOrderItem[] @relation("SupplyOrderItemProviderVendor")`
- `Equipment`: `supplyOrderItems SupplyOrderItem[]`
- `FileUpload`: `supplyOrderId String?` + `supplyOrder SupplyOrder? @relation(...)`
- `User`: `supplyOrdersUpdated SupplyOrder[] @relation("SupplyOrderUpdatedBy")`

### Existing enum extensions

```prisma
enum PermissionResource {
  // ...existing...
  SUPPLY_ORDERS
}

enum StatusModelType {
  // ...existing...
  SUPPLY_ORDER
}
```

## Cross-cutting wiring

| File | Change |
|---|---|
| `src/lib/statusConstants.ts` | Add `SUPPLY_ORDER: "Supply Order"` to `STATUS_MODEL_LABEL` (typed `Record<StatusModelType, string>` — adding the enum member without this fails the build, which is good). Add `PACKING_STATUS_LABEL` + `PACKING_STATUS_CLASS` maps mirroring `STATUS_LABEL` / `STATUS_CLASS` for the new `PackingStatus` enum. |
| `src/app/events/status-defaults/StatusDefaultsPanel.tsx` | Add `"SUPPLY_ORDER"` to the hardcoded `ALL_MODEL_TYPES: StatusModelType[]` array. The type doesn't enforce exhaustiveness, so this is easy to miss — the panel just silently omits SupplyOrder otherwise. |
| `src/app/vendors/model-types.ts` | Add `{ value: "SUPPLY_ORDER", label: "Supply Order" }` to `MODEL_TYPES`. |
| `src/app/vendors/actions.ts` | Extend `ModelType` union with `"SUPPLY_ORDER"`. |
| `src/app/events/av-orders/grouped-equipment-select.tsx` → `src/components/ui/GroupedEquipmentSelect.tsx` | Promote to shared (this becomes the second consumer; CLAUDE.md: "`src/components/` is reserved for components reused across two or more features"). Rename file PascalCase to match the convention. Update the existing AV order imports to the new path. |
| `prisma/seed.mjs` | Add `"SUPPLY_ORDERS"` to `EVENT_RESOURCES` (admin gets DELETE, user gets WRITE). The seed's upsert pattern means re-running it on deploy adds the new permission rows to existing roles. No additional `EventStatusDefault` seed needed — events configure their own defaults via the settings panel. |
| `src/app/events/[id]/actions.ts` → `getEventOverviewStats` | Add SupplyOrder count/status block following the existing pattern (lines 197–266 are the template). Add `hasPermission("SUPPLY_ORDERS", "VIEW"/"WRITE", eventId)` checks. |
| `src/app/events/[id]/page.tsx` | No change needed — overview card renders dynamically from `stats.entities`. |
| `src/app/events/[id]/functions/[functionId]/page.tsx` | Add a `<SupplyOrderPanel>` block mirroring the existing `PrintOrderPanel` wiring at lines 441–448. Fetch `getAvailableSupplyOrdersForFunction(eventId, functionId)` in the existing `Promise.all` and wire `linkSupplyOrderToFunctionFromFunction` / `unlinkSupplyOrderFromFunctionPage` actions. |
| `src/app/events/[id]/presentations/[presentationId]/page.tsx` | Same pattern for the presentation side: render the `SupplyOrderPanel` with presentation-scoped link/unlink actions. |
| `FileUpload` model | Add nullable `supplyOrderId String?` + `supplyOrder SupplyOrder? @relation(fields: [supplyOrderId], references: [id], onDelete: Cascade)` and `@@index([supplyOrderId])`. Mirrors the existing polymorphic-via-nullable-FK pattern for the six other parent types. |

## Files to create

**Server actions and components (colocated):**
- `src/app/events/supply-orders/actions.ts` — all CRUD + linking + cascade
- `src/app/events/supply-orders/SupplyOrderForm.tsx`
- `src/app/events/supply-orders/SupplyOrderList.tsx`
- `src/app/events/supply-orders/SupplyOrderPanel.tsx` — renders the linked SupplyOrders for a parent entity (function or presentation), with link/unlink controls. Mirrors `src/app/events/print-orders/PrintOrderPanel.tsx` so it can be dropped into the function and presentation detail pages.
- `src/app/events/supply-orders/SupplyOrderItemPanel.tsx` — items table on the order detail page, with inline create/edit/delete and per-row packing-status toggle.
- `src/app/events/supply-orders/SupplyOrderLinkPanel.tsx` — on the order detail page, manages Function + Presentation links.
- `src/app/events/supply-orders/PackingStatusPanel.tsx` — order-level packing status with a "this will update all N items" confirm before cascade.

**Routes:**
- `src/app/events/[id]/supply-orders/page.tsx` — list (Archetype A)
- `src/app/events/[id]/supply-orders/new/page.tsx` — create form (Archetype B)
- `src/app/events/[id]/supply-orders/[supplyOrderId]/page.tsx` — detail (Archetype C)

## Server actions

Standard list/detail/create/update/delete/bulk-delete mirroring `src/app/events/print-orders/actions.ts`. Specific additions:

- **`updateSupplyOrderPackingStatus(supplyOrderId, eventId, packingStatus)`** — sets `SupplyOrder.packingStatus = X` AND in the same transaction updates every `SupplyOrderItem.packingStatus = X` for the order. Item-level updates do not bubble back up; the order header is user-driven, the cascade is one-way.
- **`updateSupplyOrderItemPackingStatus(itemId, supplyOrderId, eventId, packingStatus)`** — updates a single item only.
- **Item CRUD:** `createSupplyOrderItem`, `updateSupplyOrderItem`, `deleteSupplyOrderItem`.
- **Linking:** `linkSupplyOrderToFunction` / `unlinkSupplyOrderFromFunction` / `getAvailableSupplyOrdersForFunction` / `linkSupplyOrderToFunctionFromFunction` / `unlinkSupplyOrderFromFunctionPage` (+ matching presentation variants). Mirror the PrintOrder action set verbatim — the "FromFunction" / "FromFunctionPage" variants exist so the function detail page can revalidate the function path instead of the supply-order path.
- **Vendor helpers:** `getSupplyOrderPartyOptions(eventId)` returning vendors via `getResponsiblePartyVendors(eventId, "SUPPLY_ORDER")` + `flattenResponsiblePartyOptions()`.
- **Default status on create:** `createSupplyOrder` calls `getEventStatusDefault(eventId, "SUPPLY_ORDER")` from `src/lib/statusDefaults.ts` to seed `status` + `substatus`, matching `createPrintOrder` at `src/app/events/print-orders/actions.ts:85`. `packingStatus` is left null on create.
- Every action starts with `await requireAuth()` (or `requireAdmin()` if applicable). After mutations: `revalidatePath("/events/${eventId}/supply-orders")` and `revalidatePath("/events/${eventId}/supply-orders/${id}")`. Function/presentation link actions also revalidate the parent path.
- Create redirects to detail (entity needs further setup — items, links, vendors); updates stay on detail with `?success=...`.

## Detail page (Archetype C)

Three-pane layout matching `src/app/events/[id]/print-orders/[printOrderId]/page.tsx`:

- **Left sidebar:** `EntityStatusPanel` (workflow status), `PackingStatusPanel` (packing status with "this will update all N items" confirm), `SupplyOrderForm` (edit mode), `SupplyOrderLinkPanel` (function + presentation links), `WorkflowPanel`.
- **Main:** `SupplyOrderItemPanel` — table of items with inline create/edit. Columns: description, equipment (`GroupedEquipmentSelect` from `src/app/events/av-orders/grouped-equipment-select.tsx`), quantity, acquisition state, provider vendor, packing status, notes. Dual layout: mobile cards (`sm:hidden`) + desktop table (`hidden sm:block`).
- **Right / tabs:** vendor management (M:M junction), file uploads.

Breadcrumbs: `Events > [event] > Supply Orders > [order name]` per `CLAUDE.md` § Breadcrumbs.

## Definition of done — MVP success criteria

A run is successful when *all* of these are true:

1. **Schema migrates cleanly.** `npx prisma migrate dev --name add_supply_order` (or `db push` for the user's deploy setup) succeeds; existing data untouched.
2. **`npm run build` passes** with no TypeScript or lint errors.
3. **Create flow.** From `/events/[id]`, the user can navigate to `/events/[id]/supply-orders/new`, fill in name + destination room + optional specific-location, and create a SupplyOrder. Redirects to the detail page with success toast.
4. **Edit flow.** Detail page allows editing name, room, specific-location, status, substatus, notes, packing status. All edits persist and stay on the detail page with toast.
5. **Item CRUD.** From the detail page, the user can add items with: description (required), equipment (optional, grouped by category via `GroupedEquipmentSelect`), quantity, acquisition state (`ON_HAND` / `TO_PROCURE` / `FROM_VENDOR`), provider vendor (optional), packing status (`NEEDED` / `PACKED` / `DELIVERED`), notes. Items can be reordered, edited, and deleted.
6. **Order-level packing cascade works.** Setting the order's `packingStatus` to `PACKED` (or `DELIVERED`) in the UI updates every item in the order to the same status in a single transaction. UI confirms before applying.
7. **Item-level packing updates are independent.** After the cascade, the user can flip a single item back to `NEEDED` without affecting the order header. Order and items can legitimately diverge after individual edits.
8. **Function and Presentation links work** in both directions:
   - On the SupplyOrder detail page: pick a Function (or Presentation) to link / unlink.
   - On a Function detail page: see linked SupplyOrders, with link/unlink controls (follow the PrintOrder pattern in `src/app/events/[id]/functions/[functionId]/page.tsx`).
   - Same for Presentation detail page.
9. **Vendor assignment works.** A vendor tagged with model type `SUPPLY_ORDER` (or with an empty `models` array) appears in the order's vendor picker. Vendors can be added/removed at order level and per item.
10. **Permissions gate correctly.** `hasPermission("SUPPLY_ORDERS", "VIEW"/"WRITE"/"DELETE", eventId)` checks fire in the actions and on the overview card. Admin has full access via the seed defaults.
11. **Event overview card shows SupplyOrders** with count + status breakdown, matching the existing pattern for PrintOrders.
12. **List page works** at `/events/[id]/supply-orders` showing all orders with destination room, status, packing status, item count.
13. **Mobile layout is functional at 360px** for both the list and the detail page item table.

## Out of scope (deliberate seams for future work)

- **Source-location structure.** No `sourceLocation` field on items. When inventory lands, source can be modeled as a real `Location` (or similar) FK without churning the schema we ship now.
- **Transportation method** on items.
- **Public/share-link supply-request form** for non-login staff/vendors.
- **Cross-order procurement report** ("everything to procure across all events"). Easy follow-on once the data exists.
- **Share-link "Packing List" report type.** Could ship next; would touch the 5 share surfaces per `CLAUDE.md` § "Share-view integration."
- **/print PDF route** for a printable packing list.
- **Item cost / budget rollups.**
- **Provider Contact FK** on items (only Vendor for now, matching the user's explicit scope).
- **Bulk-edit selection** on the SupplyOrderList (no `*ListClient` to start; ship lean per `CLAUDE.md` § "Order list and bulk edit pattern").

## Verification

After implementation:

1. `npm run build` — passes cleanly.
2. `npx prisma generate` locally (user's deployment runs `db push` server-side via webhook per memory).
3. End-to-end manual test against `npm run dev`:
   - Create an event, a venue with a room.
   - Create a SupplyOrder; verify destination, function/presentation linkage, vendor assignment.
   - Add 3 items with varied acquisition states and packing statuses.
   - Mark the order as `PACKED`; confirm all 3 items update.
   - Flip one item back to `NEEDED`; confirm only that one changes.
   - Delete an item; confirm cascade.
   - Confirm the event overview card shows the new order with correct counts.
   - Verify mobile layout at 360px.
4. `/simplify` and `/security-review` per user preference, before any commit.

## Critical files to read before implementing

- `prisma/schema.prisma` (lines 110–124, 467–531, 1172–1245) — Equipment, EquipmentItem, SetupOrder, PrintOrder shapes
- `src/app/events/print-orders/actions.ts` — primary action template
- `src/app/events/print-orders/PrintOrderForm.tsx`, `PrintItemPanel.tsx` — UI templates
- `src/app/events/[id]/print-orders/[printOrderId]/page.tsx` — detail-page template
- `src/app/events/[id]/setup-orders/[setupOrderId]/page.tsx` — Archetype C example with `roomId`
- `src/app/events/av-orders/grouped-equipment-select.tsx` — reuse for the equipment picker
- `src/app/events/[id]/actions.ts` (lines 197–285) — overview stats wiring template
- `prisma/seed.mjs` (lines 162–173) — permission seeding template
- `src/lib/statusConstants.ts` — status enum + label patterns
- `src/lib/permissions.ts` — `hasPermission` signature

## Goal-skill input (success-criteria handoff)

When this plan is passed to the goal skill, the success criteria are the 13 items in "Definition of done" above. The goal is satisfied when an admin user can run an end-to-end packing workflow against `npm run dev`:

> Create a "Registration Day 1 Kit" supply order destined for Room 200, link it to the "Registration Open" function, add four items (a printer from on-hand, toner to procure, signs from a vendor, pens on-hand), mark the order as `DELIVERED` and confirm all items cascade, then flip one item back to `NEEDED` and confirm the rest stay `DELIVERED`. The event overview card reflects the new order.
