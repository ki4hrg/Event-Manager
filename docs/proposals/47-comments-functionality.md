# #47 — Comments functionality throughout

## Problem

There is no comment or note model in the schema. Searching `prisma/schema.prisma` for `Comment`
returns nothing.

What stands in for it today is a single `notes String?` column on nearly every entity —
`Function`, `AVOrder`, `CateringOrder`, `SetupOrder`, `PrintOrder`, `SupplyOrder`,
`MediaDeliverable`, `Vendor`, plus per-item variants on `EquipmentItem`, `PrintItem`,
`SupplyOrderItem`, `TimelineItem`, `WorkflowStepCompletion`. That field is single-writer: the
next person to save the form overwrites whatever the last person wrote, with no author, no
timestamp, and no way to tell a stale note from a fresh one.

The only authorship the app has is `updatedById` / `updatedAt`, surfaced by
`src/components/LastUpdated.tsx` — "Updated 2h ago by Jane." Useful, but it is one fact, not a
conversation.

Detail pages are already built out of panels that take server actions as props —
`LinkedItemsPanel` (`src/components/LinkedItemsPanel.tsx`), `EntityStatusPanel`,
`WorkflowPanel`, `FileUploadPanel` — with `DetailTabs` above them
(`src/app/events/supply-orders/SupplyOrderTabs.tsx` is the smallest example: Overview / Files).
A comments panel drops into that shape without inventing anything.

## Proposed model / UX

### Schema — polymorphic, following `WorkflowInstance`

```
model Comment {
  id        String   @id @default(cuid())
  entityType String  // "catering_order", "av_order", "function", "vendor", ...
  entityId   String
  eventId    String? // denormalized; FK Cascade. null for vendor/contact/venue comments
  event      Event?  @relation(fields: [eventId], references: [id], onDelete: Cascade)
  authorId   String?
  author     User?   @relation(fields: [authorId], references: [id], onDelete: SetNull)
  body       String
  editedAt   DateTime?
  deletedAt  DateTime?   // soft delete keeps thread shape
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([entityType, entityId, createdAt])
  @@index([eventId, createdAt])
}
```

The codebase already contains **both** shapes for "attached to one of N parents":

- `WorkflowInstance` (`prisma/schema.prisma:1034-1048`) — polymorphic `entityType` + `entityId`,
  indexed `@@index([entityType, entityId])`.
- `FileUpload` (`:1565-1600`) — eight nullable FKs, eight indexes, plus the
  `getEntityTypeFromRecord` / `ENTITY_FK_FIELD` bookkeeping in `src/lib/uploads.ts`.

**Recommendation: polymorphic.** "Throughout" means at least the eight workflow entity types plus
`Event`, `Vendor`, `Contact` and `Venue` — that would be twelve nullable columns and twelve
indexes on the `FileUpload` pattern, and the per-record type resolution that goes with it. The
cost of polymorphic is real and must be paid explicitly: **no DB cascade on the entity itself**,
so every `delete*Core` in `src/app/*/core.ts` must delete its comments in the same transaction
(there are ~15 such functions). The `eventId` FK gives event deletion cascade for free.

### Entity vocabulary — extend, do not re-invent

`src/app/events/workflows/entity-types.ts` already defines `WorkflowEntityType` and
`ENTITY_TYPE_RESOURCE: Record<WorkflowEntityType, PermissionResource>` — deliberately free of
`"use server"` and Prisma so client panels can import it. That is exactly the map a comment needs
to know what to gate on. Add `src/lib/commentEntities.ts` that re-exports it widened with
`event`, `vendor`, `contact`, `venue` → `EVENTS`, `VENDORS`, `CONTACTS`, `VENUES`, and closes with
the `_exhaustive: never` check the project uses for unions.

### Panel

`src/components/CommentsPanel.tsx` — `"use client"`, prop shape modeled on `LinkedItemsPanel`:

```ts
type CommentsPanelProps = {
  comments: CommentRow[];              // author name/email, body, createdAt, editedAt, mine
  resource: PermissionResource;        // resolved from entityType by the caller
  currentUserId: string;
  addComment: (body: string) => Promise<void>;
  editComment: (id: string, body: string) => Promise<void>;
  deleteComment: (id: string) => Promise<void>;
};
```

- Textarea + submit; `useTransition` around the non-form actions, `router.refresh()` after —
  no `useOptimistic` (§ Anti-patterns).
- Delete uses inline confirm state on the trigger, like `src/components/InlineDeleteButton.tsx` —
  not a modal.
- Relative timestamps via `formatRelativeTime` / `formatAbsoluteTime` from
  `src/lib/relativeTime.ts`, same as `LastUpdated`.
- Plain text only in v1. `dangerouslySetInnerHTML` is restricted to `RichTextEditor` output
  (§ Components), and comments do not need it.

Server side: `src/app/comments/actions.ts` (`"use server"`) + `src/app/comments/core.ts`
(`addCommentCore(args, userId)` etc., calling `requirePermissionForUser`), so the MCP connector can
add a `list_comments` / `create_comment` pair later without duplicating rules
(CLAUDE.md § Writes — `*Core(args, userId)` extraction pattern). Detail pages bind `entityType` /
`entityId` in inline `"use server"` closures (Archetype C).

### Placement and rollout order

Render the panel at the bottom of the Overview tab rather than as its own tab — comments are
context for what is on the page, and a tab hides them behind a click. (Alternative: a
`Comments (3)` tab in `DetailTabs`, which gives an unread-style count in the tab bar. Present it
to the owner; the panel is cheaper and reversible.)

First: `CateringOrder`, `AVOrder`, `SetupOrder`, `Function` — the four highest-traffic detail
pages, and the four whose `notes` field is most fought over. Then `Presentation`, `PrintOrder`,
`SupplyOrder`, `MediaDeliverable`. Then `Event` (an event-level thread on the overview page),
`Vendor`, `Contact`, `Venue`.

## Files touched

| File | Change |
|---|---|
| `prisma/schema.prisma` | `Comment` model, `Event.comments`, `User.comments` |
| `src/lib/commentEntities.ts` | new — comment entity vocabulary + `PermissionResource` map, widened from `workflows/entity-types.ts` |
| `src/components/CommentsPanel.tsx` | new — client panel |
| `src/app/comments/{actions.ts,core.ts}` | new — `getComments`, `addComment`, `editComment`, `deleteComment` + cores |
| `src/app/events/[id]/{catering,av,setup}-orders/[id]/page.tsx`, `functions/[functionId]/page.tsx` | fetch comments, bind inline `"use server"` closures, render panel (first wave) |
| `src/app/*/core.ts` (~15 `delete*Core`) | delete comments in the same `$transaction` |
| `src/lib/mcpTools/` | optional later: `list_comments` / `create_comment` |

Closest archetype: **`LinkedItemsPanel` + `FileUploadPanel`** for the panel; **Archetype C** for
the page wiring.

## Open questions for the owner

1. Polymorphic `entityType`/`entityId` (recommended, follows `WorkflowInstance`) or nullable FKs
   per parent (follows `FileUpload`, gives DB cascade at the cost of ~12 columns)?
2. Who may comment — VIEW to read and WRITE to comment (matches every existing gate), or should a
   read-only role still be able to leave a comment? The second needs a new permission concept.
3. Plain text, or rich text plus `@mentions`? Mentions imply notification; `src/lib/email.ts`
   exists but nothing in the app is scheduled or event-driven, so mentions would be in-app only.
4. Should comments appear in reports and in the unauthenticated `/share/[token]` view? Default
   answer is no — share views are for external vendors and internal chatter should not leak.

## Alternatives considered

- **Keep `notes` and add an append-only convention** ("— Jane, 3/4"). Zero schema work, zero
  reliability; the field is still one string that anyone can clobber.
- **One comment table per entity** (`CateringOrderComment`, …). Full referential integrity, but
  eight-plus near-identical models and eight-plus near-identical action files.
- **Reuse `WorkflowStepCompletion.notes`** as a comment surface. Wrong scope — that is a note on a
  completion event, not on the entity.
- **Threaded replies / reactions in v1.** Deferred; a `parentId String?` can be added later
  without a data migration.

## Estimate

**Medium, ~2 days.** Model + vocabulary + actions/cores ~0.5d; panel with edit/delete and empty
states ~0.5d; first four detail pages ~0.5d; delete-cascade cleanup across the cores + the
remaining entities ~0.5d. Rich text, mentions, MCP tools and share-view exposure are each
additive.
