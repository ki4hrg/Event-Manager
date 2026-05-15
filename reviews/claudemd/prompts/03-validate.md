# Step 3: Validate Rewritten CLAUDE.md

*Run the proposed CLAUDE.md against real diffs and an ambiguity sweep.*

---

```
# Validate the proposed CLAUDE.md

Input: `CLAUDE.md.proposed`.

Run two independent checks and write results to `reviews/claudemd/validation.md`.

## Check 1: Agent review test

Pick 3-5 recent PRs or commits from the repo (use `git log` to find them; prefer ones that touch a variety of areas — a route, a Server Action, a utility, a test). For each:

1. Read the diff
2. Review it *using only the proposed CLAUDE.md as your rubric*
3. List every issue you'd flag and the rule it violates

Then evaluate:

- **True positives**: real issues caught. Good — the rule worked.
- **False positives**: things flagged that aren't actually problems. Indicates a rule is too strict, too vague, or misapplied. Suggest a sharper version.
- **False negatives**: real issues the rubric *missed*. Read each diff a second time without the rubric constraint and note anything a thoughtful reviewer would call out. For each miss, identify what rule would have caught it — and whether that rule should be added.

Output structure per PR:

> **PR/commit:** [hash or title]
> **Files touched:** [brief]
> **Flagged by CLAUDE.md rubric:** [list]
> **Missed (would be caught by a thoughtful human reviewer):** [list]
> **Suggested CLAUDE.md changes:** [specific edits]

## Check 2: Ambiguity sweep

Independently, read the proposed CLAUDE.md cover to cover with one question in mind: *could two reasonable engineers interpret this rule differently?*

For each rule, rate:

- **Clear** — only one reasonable interpretation
- **Ambiguous** — multiple plausible readings; specify what they are
- **Unverifiable** — can't be checked against a diff at all; rewrite or remove

For Ambiguous and Unverifiable rules, propose a concrete rewrite.

Also check structural issues:

- Sections that are very long compared to others (candidate for splitting into `docs/`)
- Rules that appear in multiple sections (consolidate)
- Anti-patterns without a paired correct version (add one)
- Rules without examples (add one or mark as needing one)

## Synthesis

End the validation doc with:

- **Must-fix before shipping**: things the agent test or ambiguity sweep surfaced that would cause real problems
- **Should-fix soon**: improvements that aren't blocking
- **Notes for next iteration**: things to revisit at the next quarterly review

## Rules for this task

- The agent review test is the more important of the two — false negatives in particular tell you what the rubric is blind to. Spend more time there.
- For Check 1, don't cheat by using outside knowledge. If the rubric doesn't say to check for it, don't flag it in the "Flagged by rubric" section — put it in "Missed" instead. That separation is the whole point.
- Don't rewrite CLAUDE.md yourself in this step. Surface findings; let humans (or a subsequent rewrite pass) apply changes.
```
