# Standards conformance — Event-Manager

Audit against [ki4hrg/standards](https://github.com/ki4hrg/standards) `v1`, run 2026-10-31 at
`861cad2` with the `conform` skill. Profile: Next.js app. Activity: 367 commits in 90 days, 80%
Claude-co-authored.

## Summary

| Area | Status | Top gaps |
|---|---|---|
| Workflow | missing | CI on `push: main` only, never on PRs; no `merge-on-green` / `automerge` label / PR template; merge and rebase merges allowed, branches not deleted; PR titles not Conventional Commits |
| Quality | missing | Lint only; no `typecheck` script, no tests; no zod (0 imports), 492 `formData.get(...) as` casts |
| Security | conflicts | `NEXTAUTH_SECRET` defaults to a public string; DB password hard-coded; no Dependabot, no audit, no env validation at boot; container runs as root. GitGuardian covers the repo. |
| Deploy | partial | Image built in CI, no `build:`, `pull_policy: always`, health endpoint, DB healthcheck + `service_healthy` all meet. Gaps: webhook has no `success: true` check; `/api/health` has no revision; no `GIT_REVISION` build arg; no `PGPASSWORD`; `NEXTAUTH_URL` defaults to localhost |
| Stack | differs | npm, Next 14.2, Prisma 6, NextAuth 5 beta, hand-rolled MCP JSON-RPC, no `noUncheckedIndexedAccess` (Phase 6, out of scope) |
| Design | partial | No tokens (13,171 raw palette classes, 6,215 `dark:`); dark mode follows the system but has no toggle; no contrast check; inline confirms meet; 23 `autoFocus`; mixed casing ("New hotel" / "New Proposal") |
| Agent docs | partial | CLAUDE.md 403 lines; no README, ARCHITECTURE, DEPLOYMENT, HANDOFF, `.claude/settings.json`; rules parked in `reviews/claudemd/` |

## Evidence

**Pipeline** (`.github/workflows/build.yml`): `on: push: [main]` and tags only. `image` needs only
`lint`, so a type error surfaces only inside `next build` after merge. Top-level `permissions`
grants `packages: write` to every job. `ubuntu-latest`. Deploy is `curl -fsS`, which passes on
Dockhand's 200 even when the stack fails. Tags `:main` + `:sha-…` and OCI labels meet.

**Repo settings:** `allow_merge_commit` and `allow_rebase_merge` true, `delete_branch_on_merge`
false.

**`docker-compose.yml`:** `NEXTAUTH_SECRET: ${NEXTAUTH_SECRET:-change-this-…}` (forgeable sessions
if unset in production); `NEXTAUTH_URL` defaults to `http://localhost:3000`; `DATABASE_URL` and
`POSTGRES_PASSWORD` hard-code `postgres`. Postgres volume is at `/var/lib/postgresql/data` with
`PGDATA` pinned to it: works, but moving to the standard mount means migrating data, so it is
proposed as a recorded exception. App publishes a port.

**`Dockerfile`:** single stage, root, full `node_modules`, no standalone output. `/data/uploads`
is created as root, so going non-root needs a one-off `chown` on the existing `uploads_data`
volume. Start: `baseline.mjs` → `prisma migrate deploy` → seed → `next start` (real migrations
meet).

**Trust boundaries:** 53 `"use server"` files; 50 call a `require*` guard, the other 3
(forgot/reset password, `/f/[token]`) are public by design. 16 route handlers; inbound email
verifies HMAC + timestamp. MCP tools: snake_case names, but 3 `readOnlyHint` across all tools and no
runtime input validation (CLAUDE.md:326).

**CLAUDE.md:** every concrete path it names exists. Stale: "Next 14 async-params" (async params
are Next 15); the "no zod" rationale (`reviews/claudemd/decisions.md:178`) assumes a
single-tenant tool, which stopped being true with tenants, OAuth MCP clients, inbound email and
public forms.

## CLAUDE.md triage

**Drop** (contradicts or repeats a standard): no runtime schema library (l.177, l.361) and no MCP
input validation (l.326); no test runner (l.21); candidates to `reviews/claudemd/candidates.md`
(l.368–378, replaced by `docs/claude-candidates.md`); `dark:` on every colour class (l.154,
replaced by tokens); `process.env` in four modules (l.168, replaced by validated `lib/env.ts`);
no repository/DAL (l.29, conflicts with the one-write-path rule; the `*Core` pattern is most of the
way there); inline confirms, terse copy, 360px (l.113, l.156, l.162 repeat standards).

**Move to `docs/`:** route archetypes, Reports, order list and bulk edit, vendor model types,
function labels, MCP connector detail and the auth exemptions (→ `docs/ARCHITECTURE.md`, the last
as the route-guard table); multi-tenancy trimmed to its invariant (already in
`docs/multi-tenancy.md`); `plans/` → `docs/plans/`; one copy of `conventions-observed.md`.

**Candidates** — all written by Claude (`e650d4b`, 2026-05-15, and later trailered commits); none
copied to other repos. **John accepted all eleven on 2026-10-31**; they stay in CLAUDE.md:

1. Event ownership / foreign-id proof (`assertEventRefs`) and `eventScopeWhere` on every event list.
2. Public readers never live in a `"use server"` file.
3. No global client-state library.
4. No `cn()` / `clsx` / `tailwind-merge`.
5. No `error.tsx` / `not-found.tsx` / `loading.tsx`.
6. Filter state in URL search params; `__blank__` absence sentinel.
7. Per-user preferences in `UserSetting`, not cookies or localStorage — except the dark-mode
   theme choice, which the design standard stores in localStorage to apply before first paint.
8. Reports dual-render (mobile cards + desktop/print table) and print from a `/print` route.
9. No "Multiple" rollup rows in reports.
10. Server-action return shapes and redirect targets (until Phase 6 brings `act()`).
11. Exhaustiveness `never` check on unions.

## Fix list (scope agreed 2026-10-31: phases 1–4; 5 later; 6 out)

1. Secret guards (Phase 2).
2. CI on PRs + merge-on-green + security + Dependabot + repo settings (Phase 1).
3. Non-root multi-stage image, revision in `/api/health`, `GIT_REVISION` (Phase 2, watched deploy,
   host `chown`).
4. Env validated at boot (Phase 2).
5. zod at every boundary, tests for the refusals on real Postgres (Phase 3, several PRs).
6. CLAUDE.md to ~150 lines, docs split (Phase 4).
7. Tokens, theme toggle, contrast, copy and casing pass (Phase 5, later).
8. Stack (Phase 6, out).
