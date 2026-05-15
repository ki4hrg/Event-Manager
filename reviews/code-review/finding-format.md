## Finding format

Every finding has this structure:

> **[ID]** [one-line title]
> **Severity:** Critical | High | Medium | Low
> **Location:** `file:line` (or `file:line-line` for ranges)
> **Issue:** 2-3 sentences describing the problem concretely
> **Evidence:** quote the relevant code and, for compliance findings, the CLAUDE.md rule it violates
> **Suggested approach:** 1-2 sentences on direction (NOT a fix)
> **Confidence:** High | Medium | Low — how sure you are this is a real issue

Severity definitions:
- **Critical**: security vulnerability, data corruption risk, or production-breaking bug
- **High**: significant bug, security weakness, or architectural violation affecting many files
- **Medium**: real issue but bounded scope; isolated bug, clear convention violation
- **Low**: style, minor inconsistency, missing test for non-critical code

Confidence definitions:
- **High**: violation is unambiguous, code clearly does the thing
- **Medium**: violation is likely but interpretation is possible
- **Low**: pattern looks suspicious but might be intentional — flag for human review

Findings without `file:line` citations are invalid and should not be included.
