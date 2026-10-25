# Workflow progress, phase 3: handoff

Status: not started. This is the brief for whoever picks up phase 3 of
[workflow-progress.md](./workflow-progress.md) (deadlines, owners, My steps,
the shareable task list). The proposal's § 3–5 and its Decisions table are
the spec; this note covers what phases 1–2 left in place, what changed since
the proposal was written, and where the traps are. Where the two disagree,
the proposal wins on *what*, and this note on *how the code stands today*.

Background, in order: [#43 deadlines](./43-deadlines-expected-completion.md)
and [#44 responsibility](./44-responsibility-per-step.md) (folded in; their
schema sketches are still the starting point), then
[workflow-progress.md](./workflow-progress.md).

## What is already built

**Phase 1** (ki4hrg/Event-Manager#244):
- **The step rule:** `src/lib/workflowProgress.ts` (`stepProgress`, `instanceProgress`, `templateProgress`).
- **Shared components:** `ProgressStrip` / `ProgressDots` (`src/components/ProgressStrip.tsx`), used by the hotel chain too.
- **Where they show:**
  - `WorkflowStrips` on the nine detail pages.
  - Dots in list rows, via `WorkflowBadge` and `getWorkflowBadgeSummaries`.
  - The overview's records-at-each-step counts (`defaultWorkflowStepCounts`), linking to lists through `?step=`. The filter is applied in the server page; see `stepFilterLabel` / `atWorkflowStep`.

**Phase 2** (ki4hrg/Event-Manager#245):
- **Schema:**
  - `WorkflowStep.completionMode` (MANUAL / AUTO / PROMPT).
  - `computedKey` holds the step's check.
  - `WorkflowChecklistItem.required`.
- **Checks:**
  - The registry, `src/lib/workflowChecks.ts`, is pure, and its `writes` field documents which writes can flip each check.
  - Per-record values come from `loadWorkflowChecks` / `withWorkflowChecks` in `src/lib/workflowCheckData.ts`. That module has no auth guard and is safe to call from share routes.
  - Every progress input requires `checks`. It's a required field on purpose: a reader that forgets the checks fails to compile.
- **Status upkeep:** `refreshWorkflowStatus`, `refreshWorkflowStatusForFunctions` and `refreshWorkflowStatusForRfp` in `src/app/events/workflows/core.ts`, called after commits from every core named in the registry. Order cores get it through their `bump*` helper.
- **Template editor:** completion-mode, check and required controls. Changing a mode or check prompts with the count of records it would move (`stepChangeImpact`, which simulates the change on the pure `resolveStatus`).

## Settled for phase 3 (do not re-ask)

From the proposal's Decisions table and later conversation:

- **Owners:** several per step, through a junction table (`WorkflowStepOwner`, and `WorkflowChecklistOwner` for items).
  - Each row is one of: a team member (`userId`, offered from the event's staff), a vendor, a contact, or only a party type (`responsible_party_type`, an admin-editable option list).
  - Templates carry default owners (by type, optionally a concrete party), copied to the instance at assignment.
  - Checklist items inherit their step's owners until overridden.
- **Due-date anchors:** `EVENT_START`, `EVENT_END`, `FUNCTION_START` (the earliest linked function's main schedule start), `NEEDED_BY` (a new `neededBy` date on the five order models, edited on the order form), and `PREVIOUS_STEP` (N days after the previous step was done).
  - The rule is stored on the per-instance state row, copied from the template.
  - An absolute override wins (#43's hybrid model).
  - Nothing materialises a computed date.
- **Due tiers:** overdue, due soon (≤ 3 days), upcoming. They colour the strip's state line and add a marker to the dots.
- **Completed by:** `completedById` on both completion models.
- **Pages and rollups:**
  - **My steps:** `/events/[id]/my-steps`, an Archetype A list grouped by due week. #43's `/deadlines` is the same page without the owner filter.
  - **Overview:** adds overdue / due-soon counts, unowned open steps, and the signed-in member's open steps to the attention rows.
- **Task-list report:** `TASK_LIST`, scoped by `?owner=vendor:|contact:|user:|type:`.
  - All five share surfaces ([checklist](../checklists/share-report-integration.md)).
  - Read-only on the share link; team members can be sent links too.
  - Its reader lives in `src/app/events/reports/data.ts` with no auth guard, and proves the owner id belongs to the event's tenant (vendor, contact) or staff (user).
- **One migration** for the state rows, owner junctions, due rules, `neededBy` and `completedById`.

## New since the proposal: share the owner model with #246

ki4hrg/Event-Manager#246 (AV equipment departments) needs "who covers this department at this event". The owner is a vendor or the event team (optionally a specific team member); contacts are allowed through the same shared component. That is the same owner shape as a workflow step. Build the owner reference and its picker **once**, in phase 3, so #246 reuses them:

- One owner shape: `{ kind: user | vendor | contact | type, id or label }`. Pick a column layout that both a step-owner junction and #246's `(eventId, department, owner)` rows can use. Either the same nullable-FK quartet with a check that exactly one is set, or a small shared embedded set of columns.
- "Event team" is the `responsible_party_type` option **Event Team** (seed it), with an optional `userId` for a named team member. Don't add a separate event-team kind.
- One picker component. Widen `ResponsiblePartyField` (vendor-only today) with contact, user and type groups, or write a sibling, as #44 suggests. Extend `partyLabel` to render all four kinds.
- One label helper and one "who can be offered" resolver (`getResponsibleParties` plus event staff).

If phase 3 lands first, #246 should only add its coverage table. If #246 goes first, the owner shape it introduces is the one phase 3 must use.

## How phase 2 constrains phase 3

- **Automatic steps have no completion row.** Their done-ness is computed on read. So:
  - **`PREVIOUS_STEP` after an automatic step** needs the moment its check became true. The proposal calls this `satisfiedAt` on the state row. Reads must not write it. The natural writer is `refreshWorkflowStatus`, which already runs after every check-flipping write: stamp `satisfiedAt` when a checked step flips to done, and clear it when it re-opens.
  - Today `refreshWorkflowStatus` only visits records whose workflows have a checked step, and skips cancelled ones. That's the right set for stamping too.
  - `completedById` doesn't apply to automatic steps. Show "Automatic" rather than a person.
- **Due dates belong in the rule module's inputs, not its logic.** `stepProgress` stays pure and doesn't know about time. Put anchor resolution in `src/lib/dueDates.ts` (`resolveDueAt`, `dueTier`), fed by a per-type anchor loader that mirrors `loadWorkflowChecks`: one query per entity type, attached to instances the way `checks` is. `templateProgress` / `ProgressStep` then gain an optional due field for the strip and dots.
- **Done steps show their date without a tier.** A prompt step waiting on a confirm is still open, so it does get a tier.
- **Status recompute is unaffected.** Owners and due dates never change `status`; don't call `refreshWorkflowStatus` from owner or due writes.
- **Every progress reader already takes `checks`.** Adding due and owner data means extending the same three loaders (`getWorkflowInstances`, `getWorkflowBadgeSummaries`, `resolveStatus`'s loader) plus the reports reader in `data.ts`. `grep -rn "withWorkflowChecks\|loadWorkflowChecks" src` lists them.

## Traps

- **Timezones.** Day offsets are computed in `Event.timezone`, with due at end-of-day local. Keep the arithmetic in `dueDates.ts` beside the anchor maths. CLAUDE.md flags this class of code (`src/lib/conflicts.ts`) as the riskiest in the codebase.
- **`FUNCTION_START`:** a function has no start time of its own. Use `mainScheduleStart` (`src/lib/functionSchedules.ts`).
  - Orders linked to several functions use the earliest. Say which function in the UI.
  - An order with no linked or scheduled function has no due date, never an overdue one.
- **Owner ids from forms and MCP** prove against the event's tenant (vendor, contact) or staff (user), via `assertEventRefs` / `partyRefs`. CLAUDE.md § Event ownership.
- **Share reader:** `getTaskListData` sits in `data.ts`, which is a plain module. Never in a `"use server"` file. Build, then check `.next/server/server-reference-manifest.json` has no worker under `app/share/*`.
- **Global-client helpers** (`refreshWorkflowStatus`, `autoAssignDefaultWorkflowsCore`) run after a transaction commits, never inside it.
- **New option category** `responsible_party_type`: seed it in `prisma/tenantDefaults.mjs` (not `seed.mjs`). Add it to `OPTION_SECTIONS` and its rename targets. Columns holding a label get `// @option responsible_party_type`.

## Suggested PRs

1. **Schema and owners.** The single migration. Owner junctions with the shared owner shape (see #246), `completedById`, template default owners, the widened picker and `partyLabel`, owner chips in `WorkflowPanel` with item inheritance, and owner editing in `WorkflowEditor`. Print shows owners.
2. **Due dates.** `dueDates.ts` with the anchor loader, `neededBy` on order forms, due rules in the editor, per-instance override in the panel, tiers on the strip and dots, and `satisfiedAt` stamping in `refreshWorkflowStatus`.
3. **My steps and the overview.** The `/my-steps` page (and the unfiltered deadlines view), overdue / due-soon / unowned / mine on the overview, and the sidebar entry.
4. **Task-list report.** Reader, report, filters, print route, `TASK_LIST` and its five share surfaces, plus the `get_task_list_report` MCP tool.

## Checking your work

There is no test runner (CLAUDE.md). What phases 1–2 used:

- **Throwaway Postgres.** The scratchpad isn't writable by the postgres user; use `/var/tmp`:
  ```bash
  mkdir -p /var/tmp/pgscratch && chown postgres /var/tmp/pgscratch
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D /var/tmp/pgscratch/data -A trust -U postgres && \
    /usr/lib/postgresql/16/bin/pg_ctl -D /var/tmp/pgscratch/data -o '-p 55432 -k /var/tmp/pgscratch' -l /var/tmp/pgscratch/log start"
  export DATABASE_URL=postgresql://postgres@localhost:55432/em
  npx prisma migrate deploy && npm run db:seed   # admin@example.com / admin123
  ```
  Check migrations against the schema with `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url …/shadow --exit-code`.
- **Driving cores from a script.** Put the script under `scripts/` so the `@/` imports resolve, and delete it afterwards. Run it with `npx tsx` and a preload shim, because `src/lib/tenant.ts` uses `react`'s `cache`, which plain Node's React doesn't export:
  ```bash
  echo 'const r = require(require.resolve("react", { paths: [process.cwd()] })); if (!r.cache) r.cache = (f) => f;' > /tmp/shim.cjs
  NODE_OPTIONS="--require /tmp/shim.cjs" npx tsx scripts/_try.ts
  ```
- **Seeded AV orders** need `AudioSection` and `VideoSection` rows, or the detail page throws. Create orders through `createAVOrderCore` rather than raw Prisma.
- **Browser:** `npm run build`, then `next start -p 3123` with `AUTH_SECRET`, `NEXTAUTH_SECRET` and `AUTH_TRUST_HOST` set, then Playwright (pre-installed; `require('playwright')` works). Check 360 px width (`document.documentElement.scrollWidth === 360`). Don't kill the server with `pkill -f "next start"`, which kills the calling shell too; find the PID with `ps -eo pid,args`.
