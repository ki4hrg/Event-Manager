# Step 2a: Two-Way Diff

*Compare the inferred CLAUDE.md with the current production CLAUDE.md.*

---

```
# Diff current CLAUDE.md against the inferred CLAUDE.md

You have two inputs:
- The current `CLAUDE.md` at the repo root
- The reverse-engineering output at `reviews/conventions-observed.md`, which includes an inferred CLAUDE.md in its Phase 7 section

Your job is to produce a structured diff between them. Write output to `reviews/claudemd-diff.md`.

## How to extract rules

For each document, first list every distinct *rule* it contains. A rule is a checkable directive — something a reviewer could verify against a PR. Examples:

- "Server Actions validate input with a zod schema" — rule
- "Write clean code" — not a rule (not checkable); flag separately as "vague"
- "All database access goes through `lib/db/queries`" — rule
- "Use TypeScript" — rule, though probably trivially satisfied

Aspirational language ("should", "prefer") still counts as a rule — note the strength.

## Output structure

Produce a single table with these columns:

| # | Rule | In current CLAUDE.md? | In inferred CLAUDE.md? | Classification | Evidence |
|---|------|----------------------|------------------------|----------------|----------|

Classifications (pick exactly one):

- **Consistent** — present and aligned in both
- **Documented but absent in code** — current CLAUDE.md states it, inferred doesn't (code doesn't reflect the rule)
- **Undocumented convention** — inferred has it, current CLAUDE.md doesn't (code follows a rule that was never written down)
- **Conflict** — both have a rule on the same topic but they disagree
- **Vague** — rule exists but isn't checkable; needs sharpening regardless of classification

The Evidence column should cite:
- For current CLAUDE.md: the line or section
- For inferred: the `file:line` citations from `reviews/conventions-observed.md` that established the pattern

## Rules for this task

- Don't merge similar-but-distinct rules. If current CLAUDE.md says "validate inputs" and inferred says "validate Server Action inputs with zod", those are two rows — the second is a more specific version of the first, and the diff matters.
- Don't invent rules that aren't in either source.
- If a rule in current CLAUDE.md is so vague it can't be matched against the inferred doc, classify as **Vague** and note what concrete version (if any) appears in the inferred doc.
- Sort the output: Conflicts first, then Documented-but-absent, then Undocumented, then Vague, then Consistent.
- End with a one-paragraph summary: rough counts per classification and the 3-5 highest-impact rows to discuss first.
```
