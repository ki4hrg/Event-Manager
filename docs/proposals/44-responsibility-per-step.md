# #44 — Track responsibility per step/checklist item (sponsor, event team, vendor, etc.)

> Folded into [workflow-progress.md](./workflow-progress.md) (phase 3), which settles this proposal's open questions and wins where they differ.

> Shares a schema change with **#43 (deadlines)**. Read both; land one migration.

## Problem

Workflows today are anonymous. The five workflow models
(`prisma/schema.prisma:982-1075`) carry no notion of who owns a step:

- `WorkflowTemplate` — name, description, sortOrder, `defaultForEntityTypes`, pending/completion
  status values.
- `WorkflowStep` — `label`, `sortOrder`, `computedKey`, `pendingStatusValue` /
  `pendingSubstatusValue`.
- `WorkflowChecklistItem` — `label`, `sortOrder`, `computedKey`.
- `WorkflowInstance` — polymorphic `entityType` + `entityId`, unique per
  `(templateId, entityType, entityId)`.
- `WorkflowStepCompletion` / `WorkflowChecklistCompletion` — existence means done; they hold
  `completedAt` and `notes`, and **not even the completing user**.

So `WorkflowPanel` (`src/components/WorkflowPanel.tsx`, 374 lines) renders a checklist where every
line is equally everyone's problem. That is the gap.

Meanwhile the codebase already has a well-worn "responsible party" idiom that this should match:

- `partyLabel(vendorObj, contactObj)` in `src/lib/partyLabel.ts` — a party is a **Vendor or a
  Contact**.
- Paired nullable FKs `providerVendorId` / `providerContactId` on `EquipmentItem`,
  `SupplyOrderItem`, `SupplyOrder`, `PrintItem` (designer/printer), `MediaDeliverable`,
  `InputItem`, `MonitorMix`, `MonitorOutput`.
- `ResponsiblePartyField` (`src/components/ResponsiblePartyField.tsx`) — a `<select>` of vendors
  grouped as system / venue / event vendors. **Vendor-only today**; it does not offer contacts.
- `getResponsibleParties(scope)` in `src/lib/responsibleParties.ts` — assembles
  `{ vendorGroups, contacts }` for a given event + model type, pulling contacts from the order, its
  functions and its presentations.

## Proposed model / UX

The title mixes two kinds of answer: *"sponsor"* and *"event team"* are **party types**;
*"vendor"* is a party type whose instance is a concrete `Vendor` row. Model both, layered.

### Party type — a `CustomOption`, not a Prisma enum

Add the category `responsible_party_type` to `OptionCategory`
(`src/app/(admin)/settings/actions.ts:10`) and seed `Event Team`, `Sponsor`, `Vendor`, `Venue`, `Speaker`.

This follows the house pattern for open vocabularies: `function_type`, `setup_type`,
`contact_role`, `service_style`, `media_type` and `print_distribution` are all `String` columns
referencing a `CustomOption` label, admin-editable at `/settings`, with rename propagation already
implemented (`propagateLabelRename` in `src/app/(admin)/settings/actions.ts`). The issue's "etc." says this
list will grow; a Prisma enum makes each new value a migration plus every exhaustiveness switch.
(The counter-argument is CLAUDE.md § Data layer's exhaustiveness rule — but that rule governs
closed unions like `EntityStatus` and `PermissionResource`, not user-managed vocabularies. Flagged
as open question 1.)

### Schema

**Template defaults** — on `WorkflowStep` and `WorkflowChecklistItem`:

```
defaultPartyType  String?  // responsible_party_type CustomOption label
defaultVendorId   String?  @relation(..., onDelete: SetNull)
defaultContactId  String?  @relation(..., onDelete: SetNull)
defaultUserId     String?  @relation(..., onDelete: SetNull)
```

Templates are global (not event-scoped), so a default `Vendor` FK is only meaningful for a vendor
used across events; in practice the useful template default is `defaultPartyType` alone, with the
concrete party filled in per instance. Keeping the FKs makes "always our print vendor" expressible.

**Per-instance assignment** — a new row rather than columns on the completion models, because a
step is assigned *before* it is completed and the completion row does not exist until then:

```
model WorkflowStepState {
  id          String  @id @default(cuid())
  instanceId  String  // -> WorkflowInstance, Cascade
  stepId      String  // -> WorkflowStep, Cascade
  partyType   String?
  vendorId    String?  contactId String?  userId String?   // all SetNull
  // --- #43 adds dueAt / dueOffsetDays / dueAnchor here ---
  @@unique([instanceId, stepId])
  @@index([stepId])
}
model WorkflowChecklistState { ...same shape, itemId instead of stepId, @@unique([instanceId, itemId]) }
```

Naming it `…State` rather than `…Assignment` is deliberate: **#43 stores per-instance due dates in
the same row**, and one table means one migration, one `include`, one write path.

Also add `completedById String?` to `WorkflowStepCompletion` and `WorkflowChecklistCompletion` —
one column each, closes an obvious gap, and #45 wants it regardless.

### Party resolution — who is offered

`getResponsibleParties()` already builds the vendor + contact pool for an event scope. A workflow
instance knows only `entityType` / `entityId`, so add a resolver that maps an instance to a
`ResponsiblePartyScope`: the entity's `eventId`, a `ResponsiblePartyModelType`, and its linked
function / presentation ids. Users are a third pool — `EventStaff` for the event, so assignment
stays inside people who can actually open the thing.

`ResponsiblePartyField` is vendor-only, so either widen it with optional `contacts` / `users`
optgroups (preferred — one component, one visual language) or add a sibling
`ResponsiblePartyPicker`. Store exactly one of the three FKs; render with `partyLabel()` extended
to a third argument.

### UX

- **`WorkflowPanel`** — each step row gains a party chip on the right (`partyType` badge + party
  name, or "Unassigned" in muted text). Clicking it opens an inline `<select>` gated by
  `useCanWrite(ENTITY_TYPE_RESOURCE[entityType])`, which the panel already computes. Mutation runs
  through `useTransition` + `router.refresh()`, matching the existing `toggleStep` handlers.
- **`WorkflowEditor`** (`src/app/(admin)/workflows/[id]/WorkflowEditor.tsx`, 648 lines) — each template
  step and checklist item gains a default-party control.
- **Checklist inheritance** — an item with no assignment displays its step's party, greyed, until
  someone overrides it. Cheap, and it keeps templates short.
- **Print** — `src/components/print/WorkflowSection.tsx` renders the party alongside the label so a
  printed run-of-show says who owns each line.
- **Rollup (defer)** — a "Responsibilities" view grouping open steps by party across an event is
  the obvious follow-on, and it is much more useful once #43's due dates exist. Out of scope here.

## Files touched

| File | Change |
|---|---|
| `prisma/schema.prisma` | `WorkflowStepState`, `WorkflowChecklistState`; `default*` columns on `WorkflowStep` / `WorkflowChecklistItem`; `completedById` on both completion models; back-relations on `Vendor`, `Contact`, `User` |
| `prisma/seed.mjs` | `responsible_party_type` options |
| `src/app/(admin)/settings/actions.ts` | `OptionCategory` union + `propagateLabelRename` switch arm |
| `src/lib/partyLabel.ts` | accept a `User` as a third party kind |
| `src/components/ResponsiblePartyField.tsx` | optional `contacts` / `users` optgroups |
| `src/lib/responsibleParties.ts` | resolve a `WorkflowInstance` to a party scope |
| `src/components/WorkflowPanel.tsx` | party chip + inline assign control |
| `src/app/events/workflows/actions.ts` | `assignStepParty` / `assignChecklistParty` (+ existing `assertInstanceMatches` guards) |
| `src/app/events/workflows/core.ts` | copy template defaults into state rows at instantiation |
| `src/app/(admin)/workflows/[id]/WorkflowEditor.tsx`, `src/app/(admin)/workflows/actions.ts` | template default-party editing |
| `src/components/print/WorkflowSection.tsx` | render the party |

Closest archetype: the **vendor/contact party pickers on order forms** (`ResponsiblePartyField` +
`getResponsibleParties`) for the data shape; **`WorkflowPanel`'s existing toggle handlers** for the
mutation shape.

## Open questions for the owner

1. Party type as an admin-editable `CustomOption` (recommended — "etc." in the title implies
   growth) or a fixed Prisma enum `SPONSOR | EVENT_TEAM | VENDOR | VENUE`?
2. Exactly one responsible party per step, or can a step be co-owned (e.g. venue *and* AV vendor)?
   One party keeps the state row flat; many needs a junction table.
3. Assigning an app `User` — is that just a label, or is it meant to drive "my open steps" and
   eventually reminders? (No scheduler or notification path exists today.)
4. Should checklist items inherit their step's party by default (recommended), or must each be
   assigned explicitly so nothing is silently owned?

## Alternatives considered

- **Put party columns on `WorkflowStepCompletion`.** Rejected — the row only exists once the step
  is done, so nothing could be assigned in advance, which is the whole point.
- **A free-text `responsibleParty String?` on the step.** One column, ships in an hour, and gives
  no filtering, no rollup, no link to the vendor record.
- **Reuse `EventKeyStaff`** (event ↔ contact with a `models[]` scope) as the assignment target.
  Good for "who is the AV lead," wrong granularity for a single checklist line.
- **Party type as a Prisma enum.** Type-safe and exhaustiveness-checked; costs a migration per new
  party type. Genuinely close — see open question 1.

## Estimate

**Medium–Large, ~2 days**, assuming #43 lands in the same migration. Schema + seed + option
category ~0.5d; party pickers and resolver ~0.5d; `WorkflowPanel` + actions ~0.5d; template editor
+ print ~0.5d. The cross-event responsibilities rollup is a separate ~0.5d if wanted.
