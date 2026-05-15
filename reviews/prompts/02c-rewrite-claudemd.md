# Step 2c: Rewrite CLAUDE.md

*Apply the human-annotated decisions from Step 2b and produce a new `CLAUDE.md.proposed`.*

---

````
# Rewrite CLAUDE.md based on resolved decisions

Inputs:
- `reviews/conventions-observed.md` (the descriptive reverse-engineering output)
- `reviews/claudemd-decisions.md`, **annotated by humans** with final decisions per row. Treat the human annotations as authoritative — override your earlier recommendations if they differ.
- The current `CLAUDE.md`

Write the new version to `CLAUDE.md.proposed` (don't overwrite the existing file).

## Structure

Use this layout. Skip any section that would be empty or trivial for this codebase.

```
# CLAUDE.md

## Quick reference
Commands an agent runs constantly: build, test, lint, typecheck, dev server, common scripts. Keep this scannable.

## Architecture invariants
The load-bearing rules. Violating these breaks the app's model. Examples: server/client boundary policy, where data access lives, auth model, caching strategy.

## Route archetypes
Reference the archetypes named in conventions-observed.md. For each: one paragraph describing the canonical pattern, with a representative example file. This is where a lot of practical guidance lives for Next.js apps.

## Conventions
Smaller rules grouped by area: naming, file organization, imports, types, error handling, logging, etc. Use subsections.

## Security and validation
Explicit, checkable rules. Always call these out separately rather than burying them in Conventions.

## Anti-patterns
Concrete don'ts, each paired with the correct alternative. Reference real files where helpful.

## Further reading
Links to deeper docs that didn't fit. If a section above feels too long, move detail here and link to it.
```

## Writing rules well

Every rule must satisfy three tests:

1. **Checkable** — a reviewer with the diff in hand can verify compliance. "Write clean code" fails. "Server Actions validate input with a zod schema before any side effect" passes.
2. **Concrete** — either an inline example or a file reference. Rules without examples get reinterpreted.
3. **Bounded** — if a rule has exceptions, list them. "Always X, except in Y case where Z" is fine. Unstated exceptions become bugs.

For anti-patterns, show the bad version and the good version side by side. The contrast is what teaches.

## Token discipline

Target 200-400 lines of load-bearing content. If you're over that:
- Move detailed standards into `docs/` files and link to them
- Consolidate rules that say the same thing in different areas
- Cut rules that are trivially satisfied or covered by tooling (linter, typechecker, formatter)

If you're under 150 lines, you're probably missing something — re-check the decisions doc for rules you skipped.

## Process

1. First, draft the new CLAUDE.md following the structure above.
2. Then, produce a short changelog at the end of the file (or in a sibling `reviews/claudemd-changelog.md`) summarizing what changed from the current version: rules added, removed, sharpened, or moved. This makes the review for humans much faster.
3. Flag anywhere you made a judgment call the decisions doc didn't fully resolve.

## Rules for this task

- Don't invent rules that aren't in the decisions doc. If something feels missing, add it to a "candidates for future addition" section at the bottom rather than smuggling it in.
- Preserve any rules from the current CLAUDE.md that were classified Consistent and not slated for change.
- Match the codebase's voice. If current CLAUDE.md uses "we", keep "we"; if imperative, keep imperative.
- When in doubt about a rule's wording, prefer the inferred CLAUDE.md's phrasing over the current one — it's grounded in observed practice.
```
````
