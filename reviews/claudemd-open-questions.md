# CLAUDE.md.proposed — open questions for human resolution

Two findings from `reviews/claudemd-validation.md` (second pass) that couldn't be settled without team input. Each follows the prompt 4 structure (Question / Context / Options / Recommended / Open for humans). Both have now been resolved — see the **Resolutions** section directly below.

---

## Resolutions (2026-05-15)

- **OQ-1 — requireAuth() retrofit:** keep the strict rule as written in `CLAUDE.md.proposed`. This branch is documentation-only; the rubric encodes the target state. The upcoming review/update pass against the codebase will catch and add `await requireAuth()` to the 16 unchecked action files. No CLAUDE.md edit needed. Row 60 in `claudemd-decisions.md` stands as-is.
- **OQ-2 — tests stance:** option (a) — absolute no-tests. The parenthetical naming "highest-leverage test targets" is removed from `CLAUDE.md.proposed`. Honest with the rest of the rubric and consistent with the team's stated view that the codebase doesn't need tests. See changelog entry SF2-I for the exact edit.
- **Middleware-stability sub-question (my Q2 pushback):** confirmed stable. The `authorized` callback exemption list (`/login`, `/api/auth/*`, `/share/*`) hasn't been changing, and further exemptions will be added as needed. This means even if OQ-1 had resolved the other way, "rely on middleware" would have been a safe stance.

---

## OQ-1 · `requireAuth()` self-protection in Server Actions

**Question:** Does the rule "every Server Action starts with `await requireAuth()` (or `await requireAdmin()`)" still stand, given that 16 of 22 action files don't follow it, or should the rubric describe what the codebase actually does?

**Context:**
The validation's second pass observed that `CLAUDE.md.proposed` asserts the rule three times (Architecture invariants line 29, Server Actions line 90, Security and validation line 143) as a load-bearing invariant. The codebase audit found:

- **5 files actually follow it** — `account/actions.ts`, `events/[id]/agenda/actions.ts`, `events/share-links/actions.ts`, `settings/actions.ts`, `users/actions.ts`, `workflows/actions.ts` (admin segments + auth-sensitive subsystems).
- **16 files don't** — `events/actions.ts`, `events/[id]/actions.ts`, `events/{av-orders, catering-orders, setup-orders, print-orders, functions, presentations, breakout-schedule, schedule-items, workflows, reports}/actions.ts`, `vendors/actions.ts`, `venues/actions.ts`, `contacts/actions.ts`, `files/actions.ts`. ~272 of ~277 exported actions skip the check and rely on middleware.

Important: the prior decisions doc (`reviews/claudemd-decisions.md`, Row 60, decided 2026-05-15 — same day) already settled on the strict version with an explicit migration plan ("Add `await requireAuth()` to every exported action in the 13 currently-unchecked files"). The migration appears to have stalled — only 5 files were retrofitted, leaving the rubric and the bulk of the code out of sync.

So this isn't a fresh "what should the rule be?" question. It's "do we still stand by Row 60, and if so, when does the retrofit ship?"

**Options:**

- **(a) Stand by Row 60. Finish the retrofit.** Add `await requireAuth()` (or `requireAdmin()` for admin actions) to the first line of every exported action in the 16 unchecked files. ~272 single-line additions across one PR (or split per file). Rubric stays as-is.
- **(b) Reverse Row 60. Downgrade the rubric to descriptive.** Rewrite the three statements as: "Admin-gated actions self-protect with `requireAdmin()`. Actions in auth-sensitive subsystems (account, agenda, share-links) self-protect with `requireAuth()`. General event/CRUD actions rely on the middleware gate documented above; the `authorized` callback in `src/lib/auth.ts` is the single source of truth for who can hit them." No code changes; rubric matches the existing 16-of-22 reality.
- **(c) Hybrid — Row 60 lite.** Keep the strict rule but carve out a wider exception class: "Actions inside admin segments, actions that mutate user-specific data (account, agenda, share-links), and actions that issue tokens (share-links) self-protect. Everything else relies on middleware." Effectively codifies the current split as intentional rather than calling it "in progress."

**Recommended:** **(a)**.

Rationale: Row 60's rationale still holds — defense in depth is cheap (~one JWT decode per call, no DB hit), uniform self-protection means a reviewer can confirm safety by reading the action's first line rather than tracing middleware coverage, and the failure mode of (b) or (c) is a silent regression if middleware coverage is ever narrowed. The decision was made today (2026-05-15) with eyes open; the missing step is execution, not reconsideration. Scope is bounded: 16 files, mostly one or two lines per exported function. Worst case the retrofit takes a single afternoon PR.

**Open for humans:**

1. Did Row 60 get re-evaluated between this morning and now? If yes, what changed? If no, the retrofit should ship before this CLAUDE.md.proposed lands so the rubric isn't lying.
2. If we keep Row 60 as written but the retrofit slips, is "rubric describes target state, code in progress" an acceptable interim? If so, the rubric should say so explicitly (banner: "Retrofit in progress — see issue #N") rather than asserting the rule as an invariant.
3. If the team has actually changed its mind and prefers (b) or (c), Row 60 needs to be retracted in `claudemd-decisions.md` with a counter-rationale — the rubric inherits from the decisions doc, not the other way around.
4. Concrete blocker check: any action whose contract genuinely should be auth-free (the report-actions carve-out is one)? The validation flagged only that one; humans should confirm there isn't a second the audit missed.

**Knock-on if (b) or (c) wins:** Architecture invariants (line 29) and Security and validation (line 143) both need to be rewritten — currently both assert the strict version. The "report-actions carve-out" framing also collapses (the carve-out is one of many auth-free contexts, not a special exception).

---

## OQ-2 · The "no tests" stance vs. the "highest-leverage targets" parenthetical

**Question:** Does the project allow targeted `.test.ts` files for high-leverage helpers (time-zone math, conflict detection), or is "no tests" absolute? The current "Tests and observability" section (line 138) contradicts itself.

**Context:**
The current paragraph reads:

> The project intentionally ships without a test suite or structured logger. Don't add ad-hoc tests or `console.error` calls for "logging". If observability is needed, introduce a logger project-wide rather than peppering call sites. (If tests are ever introduced, the highest-leverage targets are the time-zone math in `src/app/events/breakout-schedule/actions.ts` and conflict detection in `src/lib/conflicts.ts`.)

The first sentence forbids ad-hoc tests. The parenthetical at the end names two files where tests would be "highest-leverage" — implying tests there might be welcome. A reviewer reading this can't tell whether to flag a new `lib/conflicts.test.ts` or wave it through.

Pass 1 of the validation suggested either "(a) absolute no-tests, drop the parenthetical" or "(b) narrow exception, allow targeted tests in named files." Pass 2 made the same observation. Both passes declined to pick.

The rubric also says no test *runner* ships with the project — meaning even if the team picks (b), someone has to add a test runner config (vitest, jest, etc.) before a single `.test.ts` can run. That's a non-trivial side effect of (b).

**Options:**

- **(a) Absolute no-tests.** Drop the parenthetical entirely. Rewrite the paragraph as: "The project ships without a test suite or structured logger and intentionally stays that way. Don't add ad-hoc tests, `console.error` calls for 'logging', or a test runner. If observability is needed, introduce a logger project-wide rather than peppering call sites."
- **(b) Narrow exception, runner added.** Adopt a test runner (vitest — minimal config, fast, ESM-native, plays well with Next/TS) and allow `.test.ts` files next to specifically-named pure helpers. Rewrite as: "No test suite by default. Targeted `.test.ts` files next to `src/lib/conflicts.ts`, `src/app/events/breakout-schedule/actions.ts`, and other pure comparator/time-zone helpers are welcome if they cover a specific fix you just shipped or a documented edge case. Don't test pages, server components, server actions, or anything touching Prisma — keep tests to pure functions only."
- **(c) Narrow exception, runner deferred.** Keep the parenthetical's spirit but state that a test runner doesn't exist yet and adding one is itself a decision the team hasn't made. Rewrite as: "No test suite ships today. If a regression in `src/lib/conflicts.ts` or `src/app/events/breakout-schedule/actions.ts` ever justifies one, that's the trigger to add a test runner (vitest is the lightest fit) plus the targeted `.test.ts`. Until then, no tests."

**Recommended:** **(b)**.

Rationale: the parenthetical exists for a reason — the two named files (`conflicts.ts`, `breakout-schedule/actions.ts`) carry genuinely subtle logic (overlap detection, DST-aware time-zone math) where a regression is expensive and hard to spot in a UI test. Pure-function tests for those two files would cost maybe 100 lines of test code each, no Prisma mocking, no fixtures. A vitest config is ~15 lines. The marginal cost is low, the marginal safety is real. Option (c) is honest about the runner gap but kicks the can down the road — when the regression finally happens, the team will need to make the runner decision under time pressure rather than calmly. Option (a) is internally consistent but throws away the parenthetical's accurate observation that those two files *are* the riskiest logic in the codebase.

**Open for humans:**

1. Are you willing to add a `vitest.config.ts` and a `package.json` script entry? That's the gate for (b). If not, pick (a) or (c).
2. If (b), should the named-files list be exhaustive ("only `conflicts.ts` and `breakout-schedule/actions.ts`") or illustrative ("pure helpers like these two")? Illustrative is more practical but invites the slow expansion the original rule was trying to prevent.
3. If (b), does the rule allow tests for *new* helpers as they're written, or only retroactively for shipped fixes? "Test-driven development" vs. "regression test that pins down a fix" are different cultures.
4. If (a) or (c), should we drop the parenthetical altogether, or keep it as a comment so a future maintainer knows where the risk lives even if tests aren't allowed?

**Knock-on if (b) wins:** A `vitest.config.ts` and `package.json` script appear; `npm run test` joins the Quick Reference block at the top of CLAUDE.md.proposed. The Tests section grows from 2 lines to ~6.

---

## Process notes

- Once humans annotate these, the recommended path is a single targeted pass of prompt 3 (apply pass-2 fixes) limited to the rules these decisions touch — i.e. don't open the rubric for unrelated edits.
- Both decisions are reversible. (a) for OQ-1 means writing `await requireAuth()` 272 times, which a future revert can also delete 272 times. (b) for OQ-2 means adding 4 files (a vitest config, 1-2 test files) which a future revert can delete in one PR.
- If both questions get parked for more than a release cycle, mark the rules in CLAUDE.md.proposed as "pending — see open-questions" so readers know the rubric is contested in those spots.
