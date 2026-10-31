# Handoff

## Standards sweep — 2026-10-31

Standards version: v1 · Scope agreed with John: phases 1–4; 5 later (stack: out, except what an
advisory forces)

| Phase | Status | PRs | Notes |
|---|---|---|---|
| 0 Audit | done | | report: docs/plans/standards-conformance.md; all 11 candidates accepted |
| — Advisory | done | #248, #254 | Next 16 + React 19 for GHSA-2464-fhr4-w9xw; #254 put the proxy body limit back to 10MB and moved large-body routes out of the proxy (#253) |
| 1 Pipeline | done | #247 | `ci.yml` on PRs, merge-on-green, audit, Dependabot, deploy `success: true` check; audit fix, mailparser 3.14, tiptap 3.32, overrides for `deepmerge-ts` / `brace-expansion` |
| 2 Runtime | in review | this PR | draft, merged by John; before merging, set POSTGRES_PASSWORD=postgres and check NEXTAUTH_SECRET / NEXTAUTH_URL in Dockhand, and chown the uploads volume (docs/DEPLOYMENT.md) |
| 3 Boundaries | to do | | test-runner PR first (Vitest + Testcontainers), then validation at every entry point, then #252 |
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

Not verified: what production sets for `NEXTAUTH_SECRET` / `NEXTAUTH_URL` (phase 2 adds the guards).

Open decisions for John: none. The PGDATA mount exception is accepted and recorded in CLAUDE.md;
phase 2 also records it in docs/DECISIONS.md.

Follow-ups: #250 (type-ahead searches), #252 (error #441, phase 3). Dependabot ignores runtime
majors (#264); Dependabot PRs are merged by hand once CI is green.

Resume at: phase 3, the test-runner PR (Vitest + Testcontainers).
