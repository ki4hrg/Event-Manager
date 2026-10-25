# Workflow progress: strips, dots, automatic steps, deadlines and owners

Status: phases 1 (strips, dots, overview counts) and 2 (completion modes,
checks, optional items) implemented; phase 3 proposed (handoff:
[workflow-progress-phase3-handoff.md](./workflow-progress-phase3-handoff.md)). From an interview with the owner; no open
questions. It folds in
[#43 deadlines](./43-deadlines-expected-completion.md) and
[#44 responsibility per step](./44-responsibility-per-step.md): one design,
built in three phases. Where this document and those two disagree, this one
wins. Their open questions are answered under § Decisions.

## Problem

Workflow templates (`WorkflowTemplate` → steps → checklist items, assigned
per record through `WorkflowInstance`) already cover functions, orders,
presentations, media deliverables and form submissions. They are hard to read
at a glance, for three reasons:

- **List rows say "3/7".** `WorkflowStatusBadge` gives a count, not which
  step a record is on.
- **The detail page has no sense of sequence.** `WorkflowPanel` is a
  checklist. It doesn't mark "this is where it stands".
- **Every step is ticked by hand,** even when the data already says it's
  done (a vendor is assigned, the items are in). `WorkflowStep.computedKey`
  was reserved for automatic checks and is still unused.

The hotel workflow (ki4hrg/Event-Manager#240, #241) showed a better
pattern. A strip on the detail page and dots on the list rows give each
step's state and the step in progress, and every state is derived from data.

## Scope

- **In:** orders (catering, AV, setup, print, supply) and functions, through
  their workflow templates. Other template entity types (presentations, media
  deliverables, form submissions) get the same UI for free, but no checks are
  designed for them here.
- **Hotels stay built-in.** The hotel chain spans several records (RFP,
  proposal, block). It shares the strip and dots components, not templates.
- **The vendor RFP chain is not a fixed flow.** An AV vendor's process differs
  from a catering one, so the RFP stages become automatic checks that any
  order template can include, in any position (§ 2).
- **Templates are short:** 3–6 steps is typical, so dots need no grouping. A
  template with more than 8 steps falls back to the count in list rows.

## 1. The strip and the dots, shared

### First: one rule for "is this step done"

Today the rule (a step without items is done when ticked; a step with items
is done when every item is ticked) is written out separately in five places,
which agree only by care:

- `getWorkflowBadgeSummaries` (list counts)
- `computeWorkflowBadgeSummary` (the detail-page badge)
- `workflowCompletionCore` (form-submission approval)
- `recomputeEntityStatusCore` (status from the first unfinished step)
- `WorkflowPanel` (ticking UI)

Phase 2 changes the rule twice: required versus optional items, then
automatic and prompt steps. So before any UI work, move it into one pure
module, `src/lib/workflowProgress.ts`:

```ts
stepProgress(step, completions, checks?) // → { status: "done" | "partial" | "open" | "prompt", itemsDone, itemsRequired }
instanceProgress(instance, checks?)      // → { steps, current, done, total }
```

Phase 1 passes no `checks`, and every item counts as required, so its
results are exactly today's behavior. All five callers switch to it in one
commit with no visible change. That commit is the prerequisite: phase 2 then
changes the rule in one place, and the dots, strip, counts, status and form
approval all follow.

Move the presentational parts out of `src/app/events/hotels/HotelWorkflow.tsx`
into `src/components/ProgressStrip.tsx`:

- `ProgressStrip`: steps with label, state line, status, optional link, and
  the current page marked.
- `ProgressDots`: five-ish dots plus the step in progress, for a list row.

Both take a plain `ProgressStep[]`:

```ts
type ProgressStep = {
  key: string;
  label: string;
  state: string; // one line: "2 of 4 items", "Awarded", "Due Mar 3 · Kim"
  status: "done" | "partial" | "active" | "todo" | "skipped" | "stopped";
  href: string | null;
};
```

- **New status `partial`:** a step with checklist items, some done. It shows
  as a half-filled dot, and the strip state reads "2 of 4".
- **Hotels** map their `WorkflowStep` (`src/lib/hotelWorkflow.ts`) onto it
  unchanged.
- **Templates:** a pure `templateProgress(instance, checks)` in
  `src/lib/workflowProgress.ts` turns an instance into steps.
  - The current step is the first one not done, which matches how
    `pendingStatusValue` already picks the entity status.
  - Several templates on one record render one strip per template, labelled
    with the template's name. List rows show one line of dots per template,
    too; several templates on one record should be rare.

Placement:

- **List rows:** `ProgressDots` replaces `WorkflowBadge` in the eight lists
  that render it (functions and the function table, catering, AV, setup,
  print, supply, media deliverables). `getWorkflowBadgeSummaries` grows to
  return steps, not counts. The **presentations list**, which has no badge
  today, gets dots too.
- **Detail page:** `WorkflowStrips` (one `ProgressStrip` per template) sits
  under the header, above the tabs, so it shows on every tab. The panel stays
  the place to tick items, add notes, set owners and due dates.
- **Event overview:** see § 4.

## 2. Automatic, prompted and manual steps

Each template step gets a **completion mode**. Checklist items stay manual
ticks, but each item is marked **required** or **optional**
(`WorkflowChecklistItem.required`, default true):

| Mode | Behaviour |
|---|---|
| `MANUAL` | Today's tick box. |
| `AUTO` | Done exactly while its check is true. No tick box. It **re-opens** if the data stops satisfying the check (vendor removed, quantities cleared), and the entity status is recomputed. |
| `PROMPT` | Stays open, with a nudge on the detail page: "Looks done — confirm". Confirming writes a normal completion. Dots and counts treat it as open until then. |

**Steps with checklist items.** The step's mode applies once every
**required** item is ticked. Optional items never hold a step back.

- `AUTO`: done when all required items are ticked and its check (if it
  has one) is true.
- `PROMPT`: the nudge appears once both are met.
- `MANUAL`: the tick box. The panel can still offer it before the required
  items are done, as today.

A step with only optional items behaves as if it had none. The partial dot
and "2 of 4" count required items. Optional ones show in the panel, not the
dots.

`computedKey` becomes the check's key, from a closed registry in
`src/lib/workflowChecks.ts`. Each check is a pure function over a small
per-entity snapshot, loaded once per page. A check that doesn't apply to the
entity type isn't offered in the template editor. Checks belong to steps
only. `WorkflowChecklistItem.computedKey` is dropped.

| Key | Applies to | True when |
|---|---|---|
| `VENDOR_ASSIGNED` | orders | The order has a vendor (the `*OrderVendor` junction or `CateringOrder`'s vendor). |
| `LINKED_TO_FUNCTION` | orders | Linked to at least one function. |
| `SCHEDULED` | functions; orders through their functions | Has a room and a time (`mainScheduleStart`); for an order, every linked function does. |
| `ITEMS_ENTERED` | orders | Has line items / equipment / menu (per type); quantities filled. |
| `EXPECTED_COUNT_SET`, `CONFIRMED_COUNT_SET`, `GUARANTEE_SET`, `ACTUAL_COUNT_SET` | catering | That Guest Counts field is filled in (one check per count). |
| `ATTENDANCE_SET`, `SET_FOR_SET`, `ACTUAL_ATTENDANCE_SET` | functions | That ESG card field is filled in. |
| `RFP_ISSUED` | orders | A line copied from this order sits on an RFP whose status is Issued or Closed. |
| `QUOTES_IN` | orders | Those RFP lines have at least one quote. |
| `AWARDED` | orders | Every RFP line from this order is awarded (`RfpLineItem.awardedQuoteId`). |

The RFP checks read through `RfpLineItem.{avOrderId, cateringOrderId,
printOrderId}`, which is how a vendor RFP already remembers its source
orders. So an AV template can run "RFP issued → Quotes in → Awarded → Advance
sent", and a catering template can use only "Awarded".

**As built (phase 2).** The editor offers the checks that apply to every
record type the template is the default for (all of them when it's the
default for none). `ITEMS_ENTERED` counts AV order equipment, catering line
items or menu sections, setup tables / details / equipment, print items and
supply items. Equipment, print and supply lines also need a quantity above
zero. `QUOTES_IN` holds once any of the order's RFP lines has a quote line.
A function is `SCHEDULED` with a schedule entry and a room, an off-site
location, or as a breakout block. Each count check names the one field it reads,
so a step says which number it waits on (no "any count" check). Media deliverables
also get `VENDOR_ASSIGNED` (their provider) and `LINKED_TO_FUNCTION`.
Unticking a required item drops its step's confirm and cascades later steps;
an optional item moves nothing. Changing a step's mode or check
in the editor first counts the records whose status follows the workflow and
would move (`stepChangeImpact`, simulated in memory; hand-set and cancelled
statuses don't count). With any, it asks: update them too, leave them (their
next write or tick catches up), or cancel.

**Storage.** An `AUTO` step's state is never stored: it is computed on read,
so dots, strips and counts can't drift. The one stored thing that can go
stale is the entity's `status` / `substatus`, which `recomputeEntityStatusCore`
writes from the current step.

**Keeping status current: one shared refresh.** Every write that can flip a
check calls one function after its writes:

```ts
refreshWorkflowStatus(entityType, ids, eventId) // src/app/events/workflows/core.ts
```

That covers vendor, function-link, line-item and RFP-award writes, not only
workflow ticks. It loads the records' instances and check snapshots once,
works out the current step with `instanceProgress`, and writes status only
where it changed. It uses the global client, so it is called after a
transaction commits, never inside one (CLAUDE.md § Transactions).

- **Which writes call it.** `src/lib/workflowChecks.ts` lists, for each
  check, the writes that can change it. A code reviewer can check a new
  write against that list. This is the same convention as
  `syncFunctionNumbers`: one function, called from each core that needs it.
- **Most call sites are already shared.** The vendor, function-link and
  bulk-update cores are already per concern (`*OrderVendor` junction writes,
  `link_*_to_function`, `bulkUpdate*`), and RFP awards go through
  `settleAwards`. So the calls land in a handful of shared cores, not in
  every page.
- **Rejected: a Prisma client extension.** A query hook on the relevant
  models would run without any call sites. But it would also run inside
  transactions, where the global-client helper can't join. And it would
  hide a write's side effect from anyone reading the core.

## 3. Deadlines and owners (#43, #44)

Both proposals keep their models, with the changes and decisions below. They
share the per-instance `WorkflowStepState` / `WorkflowChecklistState` rows
and land in one migration.

**Due dates (#43).** Anchors:

- `EVENT_START` / `EVENT_END`.
- `FUNCTION_START`: the earliest linked function's `mainScheduleStart`, as
  #43 describes.
- `NEEDED_BY`: a new `neededBy DateTime? @db.Date` on the five order models,
  edited on the order form. This answers #43's open question 1.
- `PREVIOUS_STEP`: N days after the previous step's completion (or, for an
  `AUTO` step, the day its check became true, which needs a
  `satisfiedAt` stamp on the state row). With no previous completion there's
  no due date yet.

Due tiers (overdue / due soon ≤ 3 days / upcoming) colour the strip's state
line and add a marker to the dots.

**Owners (#44).**

- **Several owners per step.** A `WorkflowStepOwner` junction (and
  `WorkflowChecklistOwner`) replaces #44's single FK trio. Each row is one of:
  a team member (`userId`, from the event's staff), a vendor, a contact, or
  only a party type (`responsible_party_type` option: Sponsor, Event Team…).
- **Template defaults.** Templates carry default owners, by type and optional
  concrete party, copied to the instance at assignment.
- **Checklist items inherit** their step's owners until overridden.
- **"My steps"** is a per-user view of open steps owned by the signed-in team
  member, across the event (§ 4).
- `completedById` is added to both completion models.

## 4. Rollups

**Event overview.** For each record type, a compact row:

- the count at each step of its default template, each count linking to the
  list filtered to that step (`?step=<stepId>`, validated against the
  template's steps);
- overdue and due-soon counts;
- open steps with no owner;
- the signed-in member's own open steps.

These extend `getEventOverviewStats()`'s `attention` rows behind the existing
`hasPermission` checks. Phase 1 ships the count at each step
(`defaultWorkflowStepCounts`, non-cancelled records only). The list pages
apply `?step=` server-side before handing rows to the list client, with a
chip to drop it; a `done:<templateId>` value selects records through the
template. An unknown step means no filter.

**My steps.** `/events/[id]/my-steps`, an Archetype A list grouped by due
week (Overdue / This week / Next week / Later / No date), linking to each
record. #43's `/deadlines` page becomes the same page without the owner
filter.

## 5. Shareable task list per owner

A report that sends one owner a running list of their open steps, for
example a vendor's tasks across the event. It is a normal shareable report,
so it gets all five share surfaces
([docs/checklists/share-report-integration.md](../checklists/share-report-integration.md)).

- **Route:** `/events/[id]/reports/task-list`, filtered to one owner:
  `?owner=vendor:<id>`, `contact:<id>`, `user:<id>` or `type:<label>`.
  Parsed and validated in the report's `params.ts`.
- **Body:** open steps and items grouped by record (order or function), with
  due date and tier, the step's other owners, and done items optionally
  shown (`?done=1`). Mobile cards plus a desktop/print table, `ReportNav` by
  record.
- **Reader:** `getTaskListData(eventId, owner)` in
  `src/app/events/reports/data.ts`. It is a plain module with no auth guard,
  per the share carve-out. It takes the tenant from the event, and proves
  the owner id belongs to that event's tenant (vendor/contact) or staff
  (user). A foreign id reads as an empty list, never another tenant's
  data.
- **Share link:** `ShareLink.reportType` gains `TASK_LIST`. The owner is
  stored in the link's filter params like other reports' filters, so a
  vendor's link always shows that vendor and nobody else. Any owner kind can
  be shared, team members included: their link is a running list they can
  open without signing in, beside the signed-in My steps page. The share view
  renders read-only. Nothing can be ticked from a share link (that would be
  the `/f/[token]` form pattern, a possible later step).
- **"Running":** the share view is computed on every load, so the vendor
  always sees the current list.
- **MCP:** `get_task_list_report` beside the other report tools.

## Decisions (from the interview)

| Question | Decision |
|---|---|
| Which records first | Orders, functions, and the vendor RFP chain (through order templates) |
| Template length | 3–6 steps; dots fall back to a count past 8 |
| How a step completes | Per step: automatic, prompt ("looks done — confirm"), or manual |
| Checklist items | Manual ticks, each required or optional; the step's mode applies once every required item is ticked |
| Automatic step when data changes | Re-opens |
| Prompt step before confirming | Counts as open; the detail page nudges |
| Checklist items in dots | Partial dot; the strip shows "2 of 4" (required items) |
| Several templates on one record | One strip and one line of dots per template |
| Vendor RFP chain | Template checks (`RFP_ISSUED`, `QUOTES_IN`, `AWARDED`), not a fixed flow |
| Hotels | Stay built-in; share the components |
| #43 anchors | Event start/end, function start, order needed-by (new field), previous step |
| #44 owners | Several per step; team members get "My steps" |
| #44 party type | Admin-editable `responsible_party_type` option list (#44 Q1, as recommended) |
| #44 checklist owners | Inherit the step's until overridden (#44 Q4, as recommended) |
| Overview rollup | Count at each step, overdue / due soon, unowned, my open steps |
| Existing records | Not back-filled; a bulk "assign workflow" action is ki4hrg/Event-Manager#243 |
| Status upkeep for automatic steps | One shared `refreshWorkflowStatus`, called from the cores that can flip a check; no Prisma hook |
| Sharing | A task-list report scoped to one owner (vendor, contact, team member or type); team members get share links too |

## Phases

1. **Strip and dots on today's workflows.** First the shared
   `workflowProgress` rule with its five callers (no visible change). Then shared `ProgressStrip` /
   `ProgressDots` (hotels moved onto them), `templateProgress`, dots in list
   rows (presentations included), strip on detail pages, the overview's
   count-at-each-step. No schema change.
2. **Checks.** Completion mode on steps and items, the check registry
   including the RFP checks, prompt nudges, re-open, `refreshWorkflowStatus`
   wired into the cores the check registry names,
   required / optional items, and the template editor's mode, check and
   required controls. Migration: `completionMode` on `WorkflowStep`,
   `required` on `WorkflowChecklistItem` (existing items default to
   required, so today's behaviour holds), drop the item `computedKey`.
3. **Deadlines, owners, My steps, task list.** #43 + #44 schema in one
   migration (state rows, owner junctions, due rules, `neededBy`,
   `completedById`), the panel's due and owner controls, overview overdue /
   unowned / mine, `/my-steps`, and the shareable task-list report.
