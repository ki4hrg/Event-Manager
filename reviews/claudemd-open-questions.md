# CLAUDE.md.proposed — open questions

Findings from `reviews/claudemd-validation.md` that can't be resolved without a judgment call from the team. Each entry: the finding, why it's open, and the alternatives the validation laid out.

---

## OQ-1 · `requireAuth()` invariant vs. codebase reality

**Source:** validation Synthesis → Must-fix #1.

**Finding:** The rubric asserts in three places — Architecture invariants (line 29), Server Actions (line 88), Security and validation (line 139) — that every Server Action self-protects with `await requireAuth()` (or `requireAdmin()`). The codebase audit ran during validation says:

- **5 of 22** action files actually call auth: `account/actions.ts`, `events/[id]/agenda/actions.ts`, `events/share-links/actions.ts`, `settings/actions.ts`, `users/actions.ts`, `workflows/actions.ts` (admin segments, account, agenda, share-links — i.e. user-specific or admin-gated subsystems).
- **16 files** (~272 exported actions across events/*, vendors, venues, contacts, files, events/[id]) don't call auth at all and rely on middleware.

The current rule is therefore wrong-as-written about the project's established practice.

**Why this needs team input:** the resolution depends on what the team intends going forward. Two viable paths:

- **(a) Downgrade the rule to match reality.** Rewrite as "Admin-gated actions self-protect with `requireAdmin()`. Actions that mutate user-specific data (account, share-links, agenda) self-protect with `requireAuth()`. General event/CRUD actions rely on the middleware gate." This is purely descriptive — no code changes needed, the rubric matches what's in the tree.
- **(b) Keep the rule as aspirational and retrofit.** Mark it "retrofit in progress — see issue #N", accept that every PR touching an action file adds `await requireAuth()` to every function it touches, and budget a few PRs of pure-retrofit work to close the gap. ~272 actions to update across 16 files.

The two paths have different security postures (defense-in-depth at every action vs. middleware-only with selective hardening) and different effort costs. The validation doc recommends (a) as "the realistic choice" but explicitly punts the decision to a human.

**What to do once decided:** if (a), rewrite the three statements (Architecture invariants, Server Actions, Security and validation) and remove the "carve-out for report data actions" framing — the carve-out is just one of many auth-free action sets, not a special exception. If (b), keep the rule, add the issue link, and open the tracking issue.

---

## OQ-2 · Tests stance — absolute "no tests" vs. narrow exception

**Source:** validation Check 2 → Unverifiable; also pass-1 carry-over.

**Finding:** "Tests and observability" (line 134) says "Don't add ad-hoc tests" — then names `src/lib/conflicts.ts` and `src/app/events/breakout-schedule/actions.ts` parenthetically as "the highest-leverage targets." The two halves contradict.

**Why this needs team input:** either:

- **(a) Absolute "no tests".** Drop the parenthetical entirely — tests are out of scope for this project.
- **(b) Narrow exception.** Rewrite as: "No test suite by default. Small targeted `.test.ts` files next to `src/lib/conflicts.ts`, `src/app/events/breakout-schedule/actions.ts`, or any pure comparator/time-zone helper are welcome if they cover a specific fix you just shipped. Don't introduce a test runner config until at least three such files exist."

This is a doctrine question the validation doc isn't entitled to settle. Once the team picks, the rewrite is a one-liner either way.
