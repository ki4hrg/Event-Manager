# Handoff

## Standards sweep — 2026-10-31

Standards version: v1 · Scope agreed with John: phases 1–4; 5 later (stack: out, except what an
advisory forces)

| Phase | Status | PRs | Notes |
|---|---|---|---|
| 0 Audit | done | | report: docs/plans/standards-conformance.md; all 11 candidates accepted |
| — Advisory | done | #248, #254 | Next 16 + React 19 for GHSA-2464-fhr4-w9xw; #254 put the proxy body limit back to 10MB and moved large-body routes out of the proxy (#253) |
| 1 Pipeline | done | #247 | `ci.yml` on PRs, merge-on-green, audit, Dependabot, deploy `success: true` check; audit fix, mailparser 3.14, tiptap 3.32, overrides for `deepmerge-ts` / `brace-expansion` |
| 2 Runtime | done | #268 | deployed and verified live; Dockhand Force redeploy and Re-pull images on (#273) |
| 3 Boundaries | in progress | #269, #270, #272, #276–#299, this PR | Vitest + Testcontainers, OAuth registration, password reset, share links, MCP envelope and tool-argument gate, workflow status and form types, JSON lists in forms and structured action arguments, ids that are filter objects (#283), admin and account, order forms, bulk function mass assignment (#287), event core, presentations and exhibits, hotels, directory, inbound mail model output, role ceiling (#293), phase-wide security review (#295 its one finding), env cleanup (#296), refusals reach the person (#252: shared fallback #294, admin #297, catering #298, orders #299 and this PR); order in docs/plans/phase3-boundaries.md |
| 4 Agent docs | done | #261 | CLAUDE.md 404 → ~120 lines; docs/ARCHITECTURE.md with the route-guard table (#251) |
| 5 Design/copy | later | | |
| 6 Stack | out | | |

Verified:
- Conform audit at `861cad2` (2026-10-31).
- #248 deployed and running at 7e3d0ac (revision label checked by John, 2026-10-31).
- #254 deployed (Dockhand `success: true`, 2026-10-31 19:08Z).
- #247 merged as fa076e2 (2026-10-31 19:24Z) by merge-on-green; the dispatched `ci.yml` run on
  `main` passed check, security and image, and its deploy job got Dockhand `success: true`.
- #261 (phase 4) and #264/#265 merged by merge-on-green and deployed with `success: true`.
- Prisma ignores `PGPASSWORD` (CLI and client, against Postgres 16): docs/DECISIONS.md.

- #268 (phase 2) deployed; `/api/health` reported e587f18 (#273) on 2026-10-31.

Not verified: the deploy job's revision check against `APP_HEALTH_URL` (the first run started
before the variable was set and skipped it; the next `main` deploy is the first real run).

Open decisions for John: none. The PGDATA mount exception is accepted and recorded in CLAUDE.md;
phase 2 also records it in docs/DECISIONS.md.

Follow-ups: #250 (type-ahead searches), #252 (error #441, phase 3), #271 (hash password reset
tokens). Dependabot ignores runtime
majors (#264); Dependabot PRs are merged by hand once CI is green.

Resume at: phase 3, #252 form by form (option C). Done: admin (#297), catering (#298), order forms
and the shared `EquipmentTable` (#299; `actionErrorMessage` rethrows Next's redirect, so a save that
navigates isn't shown as a failure), order sub-panels (this PR, on the new `ActionForm`). Next: move
the #298/#299 forms onto `ActionForm` (a refactor), catering contacts, booths (their core still throws
plain `Error` refusals), hotels, functions, then the rest. A new form uses `ActionForm` +
`<ActionFormError />` (`src/components/FormError.tsx`) and its action returns through `withUserErrors`. A form wraps its actions in `withUserErrors` and shows the result
with `useActionError` / `FormError` (`src/components/FormError.tsx`) plus `onReset={keepFormValues}`.
