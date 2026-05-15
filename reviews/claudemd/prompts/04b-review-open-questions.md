# Step 4b: Review Open Questions

*Resolve items parked in `claudemd-open-questions.md` during the fix pass. Output feeds back into a targeted re-run of Step 4a.*

---

```
# Resolve open questions from validation

Input: `reviews/claudemd/open-questions.md` (newly created during the fix pass)

For each open question, produce the same output structure as `reviews/claudemd/decisions.md`:

> **Question:** [restate]
> **Context:** what the validation pass observed
> **Options:** the 2-3 plausible resolutions
> **Recommended:** which one, with rationale
> **Open for humans:** what the agent can't decide

Then humans annotate, and the resolutions feed back into a second pass of Prompt 3 (limited to just the affected rules).
```
