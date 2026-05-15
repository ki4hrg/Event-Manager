# Synthesize multi-agent review findings

Inputs:
- `reviews/code-review/[date]/security.md`
- `reviews/code-review/[date]/bugs.md`
- `reviews/code-review/[date]/compliance.md`
- `reviews/code-review/[date]/quality.md`
- `reviews/code-review/[date]/architecture.md`

Write output to `reviews/code-review/[date]/synthesis.md`.

## Process

1. **Load all findings.** Treat each as a record with: ID, source agent, severity, location, issue.

2. **Deduplicate.** If two agents flagged the same `file:line` with similar issues, merge. Keep the higher severity. Note both agent sources.

3. **Cluster cross-cutting issues.** If 3+ findings (across agents or within one) share a root cause, group them. Examples:
   - "Server Actions don't validate inputs" might appear in security, bugs, and compliance — that's one cluster, not three findings.
   - A missing abstraction (no shared auth helper) might manifest as many individual findings; group as one.
   
   Each cluster becomes a single synthesized item with all source findings linked.

4. **Triage into action buckets.** Every item lands in exactly one:
   - **Fix now** — Critical and High items requiring immediate attention. Hard cap: 15 items total. If you have more, push the least-urgent to "Next."
   - **Next** — High and Medium items to address in the next sprint or two.
   - **Track** — Lower-severity items that are real but bounded. Goes into a backlog.
   - **Migration** — Pattern violations affecting many files. These are Stream 2 candidates (per the earlier framework), not single fixes.
   - **CLAUDE.md feedback** — items that turned out to be problems with the doc rather than the code. These go to `reviews/claudemd-candidates.md`.
   - **False positive** — items that on review aren't actually issues. Brief note on why.

5. **Sort and present.**

## Output structure

```
# Multi-agent review synthesis

## Summary
- Total findings: N (from 5 agents)
- Deduplicated: N
- Critical: N | High: N | Medium: N | Low: N
- By bucket: Fix now N | Next N | Track N | Migration N | CLAUDE.md feedback N | False positive N

## Security findings (dedicated section, regardless of count)
[All findings tagged Security or with security implications, sorted by severity]

## Fix now (capped at 15)
[Highest-severity items, each with: source findings, issue, recommended approach, rough effort estimate]

## Migration candidates
[Pattern violations, each formatted as input to a Stream 2 migration plan]

## Next (sprint backlog)
[High and Medium items not in Fix Now]

## Track (longer-term backlog)
[Low-severity items, grouped by area]

## CLAUDE.md feedback
[Items where the doc, not the code, is the issue]

## False positives
[With reasoning]

## Notes for next review
[Patterns you noticed across findings — areas of the code that produced many findings, types of issues that recurred, etc. This is input to the next quarterly cycle.]
```

## Rules

- Every synthesized item links back to the source finding IDs from the agent reports. Auditability matters.
- The Fix Now cap is a hard cap, not a guideline. If you can't fit critical items, escalate by flagging in the Summary section rather than expanding the cap.
- Security findings always get the dedicated section. Even if there are zero, include the section with "No findings."
- Don't propose fixes — surface and triage. Stream 2 handles execution planning for migrations; individual fixes get scoped when they're picked up.
- If two agents disagree on whether something is a finding, lean toward keeping it but flag the disagreement explicitly.
