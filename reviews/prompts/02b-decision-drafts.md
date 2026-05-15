# Step 2b: Decision Drafts

*Make initial determinations for differences based on step 2a.*

**AFTER THIS STEP, HUMAN REVIEW IS REQUIRED** for "Decide it", "Sharpen it", and "needs human review" items.

---

```
# Draft decisions for each divergence

Input: `reviews/claudemd-diff.md` from the previous step.

For every row that isn't classified "Consistent," draft a recommended decision. A human will review and override — your job is to give them a defensible starting point, not to decide unilaterally.

Write output to `reviews/claudemd-decisions.md`.

## Decision buckets

Each non-consistent row goes into exactly one of:

1. **Document it** — the code's behavior is intentional and good; update CLAUDE.md to match reality
2. **Fix it** — the divergence is drift; the code should conform to the documented rule
3. **Decide it** — the codebase is genuinely inconsistent (some files do X, others do Y); a choice must be made before either documenting or fixing
4. **Drop it** — the rule no longer makes sense; remove from CLAUDE.md entirely
5. **Sharpen it** — for Vague rows: rewrite the rule in checkable form (may also need one of the above)

## Heuristics for choosing

- *Undocumented convention with 90%+ adoption* → usually **Document it**. The team has voted with their code.
- *Undocumented convention with 60-90% adoption* → usually **Decide it**. There's a dominant pattern but enough deviation that explicit endorsement matters.
- *Documented but absent in code* with no recent enforcement → likely **Drop it** or **Fix it**, depending on whether the rule still seems valuable. If you can't tell, flag for human decision.
- *Conflict* → always **Decide it**. Never silently pick a side.
- *Newer code follows pattern A, older code follows pattern B* → lean toward documenting A and migrating B. Note this explicitly.

If `git log` is available, use it to determine which side of a conflict is more recent. Recency is a signal, not a verdict.

## Output structure

For each row, produce:

> **Rule:** [restate]
> **Classification:** [from diff]
> **Recommended decision:** [bucket]
> **Rationale:** 1-3 sentences. Cite adoption counts or recency where relevant.
> **If sharpening:** proposed checkable version of the rule
> **Open question for humans:** anything the agent can't decide (e.g., "Pattern A and B both have ~50% adoption; which is the team's intent?")

Group by recommended decision so reviewers can work through one bucket at a time. Within each group, sort by impact (architectural rules > style rules).

## Rules for this task

- Every recommendation needs a rationale citing evidence (adoption count, recency, or explicit conflict).
- Don't hide uncertainty. If two buckets are plausible, say so and explain the tradeoff rather than picking confidently.
- Flag anything that touches security, auth, or data integrity as **needs human review** regardless of recommendation — these shouldn't be decided by an agent's read of adoption counts.
- Don't make decisions on rows classified "Consistent" — they're not in this doc.
```
