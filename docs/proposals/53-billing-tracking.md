# #53 — Billing tracking

> Feeds **#48 (ticket cost calculator)**. Read both.

## Problem

Nothing in the app tracks money owed or money paid. There is no `Invoice`, `Payment`, `Bill` or
`Charge` model in `prisma/schema.prisma`.

The complete inventory of financial data today:

- `CateringOrderLineItem.unitPrice Decimal?` and `quantity Int?` (`prisma/schema.prisma:790-805`)
  — the only priced line item anywhere.
- `CateringOrder.rentalMinimum` / `fbMinimum` (`Decimal?`), plus `depositDeadline`,
  `guaranteeDeadline`, `paymentDeadline` (`DateTime?`) and `cancellationTerms String?`
  (`:623-628`).
- `Vendor` (`:1077-1118`) has **no financial fields at all** — no terms, no account number, no
  contact designated for billing (`VendorContact.contactType` draws from the
  `vendor_contact_type` option list, which could carry a "Billing" role but is not used that way).
- `AVOrder`, `SetupOrder`, `PrintOrder`, `SupplyOrder` and `MediaDeliverable` carry no amounts.

One piece of groundwork is already in place: `src/lib/mcpSerialize.ts` converts
`Prisma.Decimal` → string specifically to "preserve precision on financial fields," so the MCP
boundary is ready for money before the schema has any.

## Proposed model / UX

### Schema

```
model Invoice {
  id          String   @id @default(cuid())
  eventId     String   // FK Cascade
  vendorId    String   // FK — Restrict; an invoiced vendor should not vanish
  number      String?  // vendor's invoice number
  status      InvoiceStatus @default(DRAFT)
  issuedAt    DateTime?
  dueAt       DateTime?
  total       Decimal? // null = derive from line items
  notes       String?
  // Optional order link — nullable FK per order type (see below)
  cateringOrderId String?  avOrderId String?  setupOrderId String?
  printOrderId    String?  supplyOrderId String?
  lineItems   InvoiceLineItem[]
  payments    Payment[]
  files       FileUpload[]     // the PDF
  updatedById String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([eventId]) @@index([vendorId]) @@index([status])
}

enum InvoiceStatus { DRAFT SENT PAID DISPUTED }

model InvoiceLineItem { id, invoiceId (Cascade), description, quantity Int?, unitPrice Decimal?, notes, sortOrder }

model Payment {
  id, invoiceId (Cascade), amount Decimal, paidAt DateTime,
  method String?,     // CustomOption "payment_method": Check / ACH / Card / Wire
  reference String?,  // check number, transaction id
  notes String?, createdAt, updatedAt
}
```

**Order link — nullable FKs, deliberately unlike #47.** #47 recommends a polymorphic
`entityType`/`entityId` for comments because "throughout" means twelve-plus parent types. Here the
parent set is small (five order types) and permanently closed, and we want three things polymorphic
cannot give: DB cascade, `include: { invoices: true }` from an order detail page, and an
`_count` for the "Invoices (2)" panel header. That is exactly the trade `FileUpload`
(`prisma/schema.prisma:1565-1600`) already makes with eight nullable FKs, and `src/lib/uploads.ts`
shows how to keep it tidy (`ENTITY_FK_FIELD`, `getEntityTypeFromRecord`). Same decision, different
inputs — not an inconsistency.

**Attachments.** Reusing `FileUpload` means adding `invoiceId String?` there plus an `ENTITY_DIRS`
entry, a `getEntityTypeFromRecord` check and a `resolveEntityEventId` arm in `src/lib/uploads.ts`.

**Status.** The four requested states as a dedicated `InvoiceStatus` enum, not the house
`EntityStatus` (`PENDING / IN_PROGRESS / COMPLETE / CANCELLED`) plus a `substatus` `CustomOption`.
Reusing `EntityStatus` would inherit `EntityStatusBadge`, `EDIT_STATUS_OPTIONS`, status defaults and
the bulk-edit machinery for free, but "an invoice is IN_PROGRESS" is a lie that every reader has to
translate. Pay for a small `InvoiceStatusBadge` instead. One consequence to settle: with a
`Payment` table, `PAID` can be *derived* (`sum(payments) >= total`) or *declared*. Recommendation:
keep the four states manually set, always display **balance due**, and show a quiet warning when a
`PAID` invoice has an outstanding balance — one source of truth for the state, one computed number
that makes a mistake visible. See open question 1.

### Permissions

Add `BILLING` to `PermissionResource` — event-scoped, seeded admin-only, the way `API_KEYS` is.
Per `docs/checklists/adding-entity.md` § Auth and permissions this means
`src/app/users/roles/resources.ts` (`EVENT_SCOPED_RESOURCES`) **and** `prisma/seed.mjs`
(`EVENT_RESOURCES` + `ADMIN_ONLY_RESOURCES`), because the seed runs outside the Next runtime and
cannot import the TS module. Missing the seed half is the classic way this surface half-lands.

If #48 also adds a `COSTS` resource, consider one `BILLING` resource covering both rather than two
overlapping money permissions.

### UX

Follows the order-type archetypes end to end:

- **`/events/[id]/billing`** — Archetype A list page. Table: invoice number, vendor, order, issued,
  due, total, paid, balance, status. Filters (status, vendor, overdue-only) in URL search params,
  status filter using the `__blank__` sentinel idiom from CLAUDE.md § Absence sentinels. Ships lean
  first (no bulk edit) exactly as `print-orders` did.
- **`/events/[id]/billing/new`** and **`/events/[id]/billing/[invoiceId]`** — Archetypes B and C.
  Detail page: invoice header form, line-items panel, payments panel, `FileUploadPanel`,
  `Breadcrumbs` shaped `Events → <event> → Invoices → <invoice>`.
- **On order detail pages** — a small invoices summary card (total invoiced, balance, link),
  visible only with `BILLING:VIEW`.
- **On the vendor detail page** — invoices across all events for that vendor, with an
  outstanding-balance total.
- **Sidebar** — a `NAV` entry in `src/components/EventSidebar.tsx` gated on `resource: "BILLING"`;
  either at the end of the Orders group or in a new Finance group alongside #48's cost summary.
- **Reports** — an event billing summary (by vendor, by status, aged) is a natural Archetype D
  report, but it must **not** be wired into `/share/[token]`: the five surfaces in
  `docs/checklists/share-report-integration.md` exist to publish reports to outside parties, and
  vendor pricing across vendors is precisely what should not travel that way.

### How it feeds #48

#48 proposes a rollup reader whose sources each return
`{ label, amount, basis, sourceHref }[]`. Billing adds an **actuals** source. One anti-double-count
rule, stated once and enforced in the reader:

> For any order, a non-`DRAFT` invoice supersedes that order's `estimatedCost`. Orders with no
> invoice keep their estimate. Cost lines with no order are always additive.

That also gives the cost page a genuinely useful third column: estimated / invoiced / paid.

## Files touched

| File | Change |
|---|---|
| `prisma/schema.prisma` | `Invoice`, `InvoiceLineItem`, `Payment`, `InvoiceStatus`; `invoiceId` on `FileUpload`; relations on `Event`, `Vendor`, the five order models, `User` |
| `prisma/seed.mjs` | `BILLING` in `EVENT_RESOURCES` + `ADMIN_ONLY_RESOURCES`; `payment_method` options |
| `src/app/users/roles/resources.ts` | `BILLING` in `EVENT_SCOPED_RESOURCES` |
| `src/app/settings/actions.ts` | `payment_method` in `OptionCategory` + rename-propagation switch |
| `src/lib/uploads.ts` | `ENTITY_DIRS` / `ENTITY_FK_FIELD` / `getEntityTypeFromRecord` / `resolveEntityEventId` arms for invoices |
| `src/app/events/billing/{actions.ts,core.ts,InvoiceList.tsx,InvoiceForm.tsx,LineItemsPanel.tsx,PaymentsPanel.tsx}` | new — colocated feature dir, `*Core(args, userId)` per § Writes |
| `src/app/events/[id]/billing/{page.tsx,new/page.tsx,[invoiceId]/page.tsx}` | new — Archetypes A / B / C |
| `src/components/InvoiceStatusBadge.tsx` | new |
| `src/components/EventSidebar.tsx` | `NAV` entry |
| `src/app/events/[id]/{av,catering,setup,print,supply}-orders/[id]/page.tsx` | invoice summary card |
| `src/app/vendors/[id]/page.tsx` | cross-event invoice list |
| `src/lib/mcpTools/billing.ts` + `src/lib/mcpTools/index.ts` | `list_invoices` / `get_invoice` pair per the naming convention |
| `docs/checklists/adding-entity.md` | tick the surfaces as they land |

Closest archetype: **SupplyOrder**, the most recent end-to-end entity (commit `a880f43` plus the
SupplyOrder UI alignment PR), minus bulk edit.

## Open questions for the owner

1. Is `PAID` set by hand (recommended, with a computed balance shown beside it) or derived from
   payments summing to the total? Deriving it means `DISPUTED` and `PAID` can conflict.
2. Must every invoice link to an order, or are vendor-level invoices for an event (a single venue
   invoice covering rooms, catering and AV) the normal case? If the latter, the order FKs become
   decoration and line items carry the allocation instead.
3. Do we need commitments *before* an invoice arrives — contracted amounts, POs, deposits due — or
   is this strictly "an invoice showed up, track it to paid"? Deposits especially: `CateringOrder`
   already has a `depositDeadline` with no amount beside it.
4. Single currency and no tax handling (a `total` the vendor already computed), or do line items
   need tax/discount fields?

## Alternatives considered

- **Fields on the order** (`invoicedAmount`, `paidAmount`, `invoiceStatus`). Roughly a day of work
  and covers the simple case, but it cannot express one invoice spanning several orders, partial
  payments, or an invoice with no order.
- **Polymorphic `entityType`/`entityId`** as #47 recommends for comments. Rejected here: the parent
  set is small and closed, and we want cascade plus `_count` from the order pages.
- **Reuse `EntityStatus` + `substatus`** for invoice state to inherit the badge, filter and
  bulk-edit machinery. Free reuse, misleading vocabulary.
- **Integrate an external accounting system.** The tool is single-tenant and internal with no
  outbound integrations; this would be the largest change in the codebase and is a different issue.

## Estimate

**Large, ~3–4 days.** Schema + permission + uploads wiring ~0.75d; actions/cores with the
`*Core(args, userId)` split ~0.75d; list + new + detail pages with line items and payments panels
~1.5d; order/vendor summary cards, sidebar, MCP tools ~0.75d. A billing summary report is a further
~0.5–1d. The #48 rollup integration is ~0.25d once both exist.
