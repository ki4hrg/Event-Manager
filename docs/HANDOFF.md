# Handoff

## Standards sweep — 2026-10-31

Standards version: v1 · Scope agreed with John: phases 1–4; 5 later (stack: out)

| Phase | Status | PRs | Notes |
|---|---|---|---|
| 0 Audit | done | | report: docs/plans/standards-conformance.md; all 11 candidates accepted |
| 1 Pipeline | in progress | | |
| 2 Runtime | in progress | | no automerge; John watches the deploy; host `chown` of uploads volume |
| 3 Boundaries | — | | starts after phase 1 lands (needs CI to run tests) |
| 4 Agent docs | in progress | | |
| 5 Design/copy | later | | |
| 6 Stack | out | | |

Verified: conform audit at `861cad2` (2026-10-31).
Not verified: what production sets for `NEXTAUTH_SECRET` / `NEXTAUTH_URL`.
Open decisions for John: accept the Postgres `PGDATA=/var/lib/postgresql/data` mount as a recorded exception?
Resume at: phases 1, 2, 4 in flight.
