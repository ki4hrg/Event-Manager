# Step 4a: Implement CLAUDE.md Fixes

*Apply Must-fix and Should-fix items from the validation pass to `CLAUDE.md.proposed`.*

---

```
# Apply CLAUDE.md fixes from validation

Inputs:
- `CLAUDE.md.proposed`
- `reviews/claudemd/validation.md`, with "Must-fix" and "Should-fix" items related to CLAUDE.md itself (not code)

For each finding in those sections that targets the doc (ambiguous rule, missing example, structural issue, rule to add/remove/sharpen):

1. Apply the change directly to `CLAUDE.md.proposed`
2. Log the change in `reviews/claudemd/changelog.md` with: finding ID, what changed, before/after snippet
3. If a finding can't be applied without a judgment call (e.g., "rule X is ambiguous but the right resolution depends on team intent"), skip it and add to a `reviews/claudemd/open-questions.md` file rather than guessing

Rules:
- Don't make changes the validation doc didn't call for. Scope creep here defeats the point of the validation pass.
- Preserve the structure and voice of the proposed CLAUDE.md.
- When adding examples, prefer real files in the codebase over invented snippets. Cite them.
```
