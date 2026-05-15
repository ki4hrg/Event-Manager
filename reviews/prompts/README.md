# CLAUDE.md review process

A repeatable, multi-pass review for keeping `CLAUDE.md` aligned with the codebase it documents. Each step runs in a **clean context** with only the previous step's output file(s) as input — the agent shouldn't carry residue from earlier passes into later ones.

## Prompts

| File | Purpose |
|---|---|
| `01-reverse-engineer.md` | Produce `reviews/conventions-observed.md` — a descriptive audit of what the code actually does, with `file:line` citations. |
| `02a-two-way-diff.md` | Produce `reviews/claudemd-diff.md` — every rule in current vs. inferred CLAUDE.md, classified Consistent / Documented-but-absent / Undocumented / Conflict / Vague. |
| `02b-decision-drafts.md` | Produce `reviews/claudemd-decisions.md` — recommended bucket (Document / Fix / Decide / Drop / Sharpen) for each non-consistent row. **Human review required** before continuing. |
| `02c-rewrite-claudemd.md` | Produce `CLAUDE.md.proposed` from the human-annotated decisions. |
| `03-validate.md` | Produce `reviews/claudemd-validation.md` — run the proposed file against real diffs (Check 1) and an ambiguity sweep (Check 2). |
| `04a-apply-fixes.md` | Apply Must-fix and Should-fix items from validation to `CLAUDE.md.proposed`. Park anything needing judgment in `reviews/claudemd-open-questions.md`. |
| `04b-review-open-questions.md` | Draft resolutions for any open questions surfaced by `04a`. **Human review required.** |

## Orchestration

1. Run **1**, **2a**, **2b** in order.
2. **Human review** of `claudemd-decisions.md` (output from 2b).
3. Run **2c**.
4. Run **3**.
5. Based on results from 3:
   - Run **4a**.
   - Run **4b** if any open questions were identified.
6. If 4b ran: re-run **2c** using only the decisions made in response to 4b.
7. Re-run **3**.
8. Re-run **4a** based on output from 3.
9. If needed, re-run **4b**.
10. If 4b was re-run: re-run **2c** using only the decisions made in response to the re-run of 4b.
11. Re-run **3** a final time.
12. Re-run **4a** a final time, scoped to Must-fix items only.
13. Promote `CLAUDE.md.proposed` to `CLAUDE.md`.

## Halt rule

If the **final** Step 3 run (step 11 above) identifies more than 3 fixes, **halt** and prompt for a more comprehensive review of the file or the codebase. The point of the multi-pass loop is convergence — a final pass that still surfaces a long fix list means the rubric isn't stable yet and the next iteration should question premises, not just patch findings.

## Why clean contexts

Each prompt is written to be self-contained. Carrying a long conversation across passes leaks bias from earlier decisions into later validation — the agent stops noticing things it already rationalized. Fresh context per step preserves the independence the multi-pass design depends on.
