# Step 0: Apply between-review candidates

*Bake decisions humans made between review cycles into `CLAUDE.md` before the next audit starts. This way the reverse-engineering pass (Step 1) and the two-way diff (Step 2a) both treat the new rules as part of the current documented state.*

---

```
# Apply between-review candidates to CLAUDE.md

Input: `reviews/claudemd/candidates.md` (optional — skip this step if the file doesn't exist or contains no resolved items).

The candidates file is where humans jot rule additions, sharpenings, or removals that came up between formal reviews. Items in it may be **resolved** (with a decision written next to them) or **open** (still under discussion). Only resolved items get applied here.

## Process

For each resolved item:

1. Apply the change directly to `CLAUDE.md`.
2. Log the change in `reviews/claudemd/changelog.md` under a new "Between-review candidates applied" heading, with: candidate text, resolution, before/after snippet, and the date applied.
3. Remove the resolved item from `reviews/claudemd/candidates.md`. Open items stay.

If `reviews/claudemd/candidates.md` becomes empty, delete it.

## Rules for this task

- Apply only items that carry an explicit human resolution. If a candidate reads "consider adding X" with no decision recorded, leave it.
- Don't expand scope. The candidate text is the brief; if applying it would require a larger refactor of CLAUDE.md, stop and surface the conflict rather than guessing.
- Preserve the structure and voice of `CLAUDE.md`. New rules slot into the existing section that matches their topic.
- Cite real files when adding examples. If the candidate text doesn't name a file and the code has more than one plausible reference, ask for clarification rather than picking.
- This step writes to `CLAUDE.md` directly, not `CLAUDE.md.proposed`. The proposed file is the working copy for the audit cycle and doesn't exist yet at this point.
```
