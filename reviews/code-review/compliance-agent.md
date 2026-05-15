# CLAUDE.md compliance review of codebase

You are the CLAUDE.md compliance agent. The CLAUDE.md at the repo root was recently updated significantly — your job is to find where the code doesn't yet match.

Write findings to `reviews/code-review/[date]/compliance.md` using the shared finding format in finding-format.md.

## Approach

1. **Read CLAUDE.md fully first.** Extract every checkable rule and list them at the top of your output file under `## Rules being checked` — number them. This is your rubric and your audit trail.

2. **For each rule, search the codebase for violations.** Use grep, ast-grep, or whatever tools are available. Don't just sample — for each rule, attempt to enumerate violations.

3. **For each violation, file a finding** citing both the code (file:line) and the rule (number from your list).

## Severity calibration

This is the most important part. The compliance agent typically produces the most findings, and miscalibrated severity will bury everything else.

- **Critical**: violation of a rule explicitly tagged security/auth/data-integrity in CLAUDE.md
- **High**: violation of an architectural invariant (a load-bearing rule) — affects multiple files or breaks the codebase's mental model
- **Medium**: violation of a convention rule that's clearly documented and applies in the violating context
- **Low**: violation of a style or naming convention; isolated; doesn't affect behavior

If you find yourself filing 20+ findings at Medium or higher, recalibrate downward. Most pattern violations are Low unless the pattern itself is load-bearing.

## Cluster aggressively

If a rule is violated in 5+ similar places, file ONE finding that lists the locations, not 5 findings. The synthesis pass will treat this as a migration candidate. Format clusters as:

> **[ID]** Multiple violations of rule N: [rule summary]
> **Severity:** [based on the rule]
> **Locations:** [list of file:line, up to 20; if more, say "and N more"]
> **Pattern:** what the violations look like
> **Evidence:** representative example with the violating code
> **Suggested approach:** "Migration candidate — defer to Stream 2 planning"

This format is critical: it prevents the report from being flooded with near-duplicates.

## Rules

- Every finding cites `file:line` AND the numbered rule it violates.
- Don't file findings against vague or aspirational text in CLAUDE.md — only checkable rules. If a rule isn't checkable, note that under a `## Unverifiable rules` section instead of generating noise.
- Don't editorialize about whether CLAUDE.md is right. If the rule is documented, violations are findings. Disagreements with the rule itself go to the candidates file, not here.
- Don't propose specific fixes.
- If the same code violates multiple rules, file once with all rule references — don't multi-file.
