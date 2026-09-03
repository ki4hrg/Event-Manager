# #45 — Changelog throughout

## Problem

There is no audit or history table. `prisma/schema.prisma` has nothing matching `Audit`,
`ActivityLog` or `History`.

What exists today is **last-writer attribution only**: `updatedAt` plus `updatedById` /
`updatedBy` on `Event`, `Venue`, `Contact`, `Vendor`, `Function`, `Presentation`, all five order
types, `MediaDeliverable`, `WorkflowTemplate`, `Role` and `User`. `src/components/LastUpdated.tsx`
renders it with a recency dot ("Updated 2h ago by Jane"). Every save overwrites it, so the answer
to "who changed the status, and from what?" is unrecoverable.

The one place the app does keep a fact-per-event is workflow completion:
`WorkflowStepCompletion` / `WorkflowChecklistCompletion` rows carry `completedAt` and exist only
when the step is done (`prisma/schema.prisma:1050-1075`). They do not record *who* completed the
step.

### Relationship to #47 (Comments)

Different data, different write path, do not merge the models.

|  | #45 Changelog | #47 Comments |
|---|---|---|
| Written by | the system, inside every mutation | a person, deliberately |
| Content | field-level facts | prose |
| Editable | never | yes, by the author |
| Deletable | never (that is the point) | soft delete |

They may eventually be *read* together in one "Activity" tab — that is a view concern and can
merge two queries at render time. Storing them in one table would mean an audit row that a user
can edit, which defeats the feature.

## Proposed model / UX

### Schema

```
model ActivityLog {
  id         String   @id @default(cuid())
  entityType String   // reuse the comment/workflow entity vocabulary
  entityId   String
  eventId    String?  // FK Cascade — gives event-deletion cleanup for free
  event      Event?   @relation(fields: [eventId], references: [id], onDelete: Cascade)
  action     String   // "create" | "update" | "delete" | "link" | "unlink" | "status" | "complete"
  actorId    String?
  actor      User?    @relation(fields: [actorId], references: [id], onDelete: SetNull)
  actorKind  String   @default("USER")  // "USER" | "API_KEY"
  summary    String   // precomputed human sentence
  changes    Json?    // [{ field, from, to }] — allowlisted fields only
  createdAt  DateTime @default(now())

  @@index([entityType, entityId, createdAt])
  @@index([eventId, createdAt])
}
```

`entityType` reuses the vocabulary in `src/app/events/workflows/entity-types.ts` (widened the same
way #47 proposes), so the same `PermissionResource` map gates who can read a log line.

### Where it is written — the `*Core` layer

The project already has the right choke point. There are roughly **200 exported `*Core(args,
userId)` functions** across sixteen `core.ts` files (`src/app/events/*/core.ts`,
`src/app/{contacts,vendors,venues,storage-locations}/core.ts`). CLAUDE.md § Writes makes these the
single source of truth: the Server Action wrapper keeps `FormData` parsing / `revalidatePath` /
`redirect`, and MCP tools call the core directly. Logging there means UI writes and MCP writes
both land in the log with no drift — which is exactly what the issue asks for.

Add `src/lib/activityLog.ts`:

```ts
export function diffFields<T>(before: T, after: T, fields: (keyof T)[]): Change[]
export async function logActivity(tx: PrismaTx, entry: ActivityEntry): Promise<void>
```

A logged core becomes: read `before` inside a `$transaction`, write, `logActivity(tx, …)`. The
transaction matters — an audit row that survives a rolled-back write is worse than no row.

### Two readings

- **(A) Full field-level audit of every write, including child rows.** Every `InputItem`,
  `SetupTable`, `TimelineItem` edit generates a row. Complete, and unreadable: reordering a menu
  produces a dozen entries.
- **(B) A curated activity feed.** Log create / delete of top-level entities, status and workflow
  transitions, link/unlink, and updates to an allowlisted set of fields per entity
  (`LOGGED_FIELDS`). Child-row edits collapse into one "updated line items" entry per save.
  **Recommended** — it is what a human actually reads, and it keeps the instrumentation surface to
  the ~40 cores that matter rather than all 200.

A third option worth naming and rejecting: a **Prisma client extension** (`$extends` query hooks)
that logs every write automatically. Near-zero call-site cost, but the extension has no access to
the acting user — the client is a process-wide singleton (`src/lib/prisma.ts`, and "never `new
PrismaClient()` at runtime" is an architecture invariant), so there is no per-request context to
read `userId` from. An audit log without an actor is not an audit log.

### UI

1. **Per-entity history.** `src/components/ActivityPanel.tsx` — server-rendered list, last 10 with
   a `<details>` toggle for the rest; each row is `summary` + relative time + actor, styled like
   `LastUpdated`'s tier classes. Order types already have `DetailTabs` (Overview / Files), so add
   an **Activity** tab there; entities without tabs (`Function`, `Presentation`, `Vendor`,
   `Venue`) get the collapsed panel under the detail card.
2. **Event feed.** `/events/[id]/activity` — Archetype A list page, `force-dynamic`, filters
   (entity type, actor, date range) in URL search params per § Pages and routing, validated against
   an allowed set before use. Sidebar entry under Configuration in `src/components/EventSidebar.tsx`.
3. **Permission filtering.** A feed row names entities across resources, so filter by the viewer's
   per-resource VIEW the way `getEventOverviewStats` fans out `hasPermission(...)` calls
   (`src/app/events/[id]/actions.ts`) — never return a log line for a resource the viewer cannot see.

### Retention

Nothing in this project runs on a schedule — Docker Compose runs the Next server and Postgres, and
`scripts/` is the documented home for code that runs outside the Next runtime. So:

- Keep rows indefinitely by default. They are small (a few hundred bytes) and a busy event produces
  low thousands.
- Ship `scripts/prune-activity-log.ts` with `--older-than=<days>` and `--event=<id>`, run by hand.
- Event deletion is already handled by the `eventId` FK cascade; non-event entities
  (`Vendor`, `Contact`, `Venue`) keep their log after deletion, which is usually what you want —
  the deletion itself is the last entry.

## Files touched

| File | Change |
|---|---|
| `prisma/schema.prisma` | `ActivityLog` + relations on `Event` and `User` |
| `src/lib/activityLog.ts` | new — `logActivity`, `diffFields`, `LOGGED_FIELDS` per entity |
| `src/lib/commentEntities.ts` (shared with #47) | entity vocabulary + resource map |
| `src/app/events/*/core.ts`, `src/app/{contacts,vendors,venues}/core.ts` | wrap logged mutations in `$transaction`, call `logActivity` |
| `src/app/events/workflows/actions.ts` | log step/checklist toggles and status transitions |
| `src/components/ActivityPanel.tsx` | new — per-entity history |
| `src/app/events/*/[Order]Tabs.tsx` | add the `Activity` tab |
| `src/app/events/[id]/activity/{page.tsx,actions.ts,ActivityFilters.tsx}` | new — event feed (Archetype A) |
| `src/components/EventSidebar.tsx` | `NAV` entry |
| `scripts/prune-activity-log.ts` | new — manual retention |
| `src/lib/mcpAuth.ts` / MCP cores | pass `actorKind: "API_KEY"` when the write arrived over a bearer token |

## Open questions for the owner

1. Which writes are worth logging — top-level entities and status/workflow transitions only
   (recommended), or child rows (line items, input items, tables) too?
2. Store field-level `changes` JSON, or just the human `summary` sentence? Diffs make "what was the
   status before?" answerable; they also store old values indefinitely.
3. Retention: keep forever with a manual prune script (recommended, no scheduler exists), or a
   hard cap such as 12 months enforced at write time?
4. Should an MCP / API-key write be attributed to the key's owner with a badge, or to the key
   itself (`ApiKey.name`)? The key already inherits its owner's role and event assignments.

## Alternatives considered

- **Postgres triggers / temporal tables.** Captures everything at the DB layer and cannot be
  bypassed, but Prisma migrations would carry raw SQL the schema no longer describes, and the actor
  is still invisible.
- **Log inside Server Actions instead of cores.** Misses every MCP write — the exact drift the
  `*Core` pattern exists to prevent.
- **Extend `LastUpdated` with a "previous 5 editors" list.** Cheap, but still no field-level facts
  and no cross-entity feed.

## Estimate

**Large, ~3 days.** Model + helper + transaction plumbing ~0.5d; instrumenting the ~40 cores that
matter ~1d (mechanical but wide); `ActivityPanel` + tabs ~0.5d; event feed with permission-filtered
queries and URL filters ~0.75d; prune script + MCP actor plumbing ~0.25d. Option (A), full
child-row auditing, roughly doubles the instrumentation half.
