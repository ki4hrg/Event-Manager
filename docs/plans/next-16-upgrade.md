# Next.js 16 and React 19 upgrade

A Phase 6 stack item brought forward by a security advisory (standards
`docs/migration/checklist.md`, Phase 6 exception). Its own PR, not labelled `automerge`; John
merges it and watches the deploy.

## Why

`npm audit` on `main` (Next 14.2.35) reports `next` as **critical**. The worst:

- GHSA-2464-fhr4-w9xw: unauthenticated RCE in the Image Optimization API with SVG files.
  Affects every `next` up to 15.5.27 and 16 before 16.4.
- GHSA-2xp9-vwfh-vxw4 (AVIF, RCE) and GHSA-p293-qw3h-jr36 (Windows hosts, RCE).
- Plus 9 high (DoS in Server Actions and Server Components, SSRF in rewrites and Server
  Actions) and a dozen moderate/low.

Next 14 gets no more patches, so the fix is a major upgrade to `next@16.4.3` (latest). Next 16
requires React 19.

Out of scope: general `npm audit fix` and `overrides` (PR #247), and the other Phase 6 items.

## Breaking changes that apply here

Checked against the official Next 15 and 16 upgrade guides and this codebase.

| Change | Here | Action |
|---|---|---|
| Async request APIs (`params`, `searchParams`, `cookies()`, `headers()`): sync access removed in 16 | Already async everywhere | None; `next build` type-checks the routes |
| `experimental.serverComponentsExternalPackages` renamed to `serverExternalPackages` (15) | Used for `exceljs`, `docx` | Rename |
| `middleware` file and export deprecated in favour of `proxy` (16); `proxy` always runs on the Node runtime | `src/middleware.ts` re-exports NextAuth `auth` (edge runtime today) | Rename to `src/proxy.ts`, export `proxy`. Node runtime suits it better: `auth.ts` imports Prisma and bcrypt. Matcher unchanged. |
| `next lint` removed (16) | `lint` script is already `eslint src/` | Fix the stale CLAUDE.md line |
| Turbopack is the default for `next build` (16); a custom `webpack` config fails the build | No `webpack` config | None. `--webpack` is the fallback if the Turbopack build misbehaves |
| GET route handlers and `fetch` no longer cached by default; client router cache `staleTime` 0 for dynamic pages (15) | Pages are `force-dynamic`; handlers do auth or I/O | None; behaviour can only get fresher |
| `revalidateTag` needs a profile (16) | Not used (only `revalidatePath`) | None |
| `next/image` defaults (16) | Not used | None |
| Parallel routes need `default.js` (16) | None | None |
| React 19: `useFormState` → `useActionState`, ref changes, removed legacy APIs | None used; `@types/react` already 19 | None expected; `tsc` and lint confirm |
| `eslint-config-next` | Already 16.1.6 | Align to 16.4.3 with `next` |
| next-auth v5 beta | `5.0.0-beta.30` peer range already allows `next@^16` and `react@^19` | No bump forced. Its own critical advisory (GHSA-8fpg-xm3f-6cx3, fixed in beta.32) is a non-breaking `npm audit fix`, left to #247 |
| tiptap 3, dnd-kit | Peer ranges allow React 19 | None |
| Node ≥ 20.9 | Image is `node:24-alpine` | None |

Found while upgrading (not in the guides' headline list):

| Change | Here | Action |
|---|---|---|
| `next/dynamic` with `ssr: false` not allowed in Server Components (15) | Agenda page | Moved into a small Client Component, `AgendaGridNoSsr.tsx` |
| Bodies of requests passing through the proxy are cut off at 10MB by default (`experimental.proxyClientMaxBodySize`) | The proxy matches every route, uploads allow 100MB | Set `proxyClientMaxBodySize: "100mb"` to match `MAX_UPLOAD_BYTES` |
| `eslint-plugin-react-hooks` 7.1 `set-state-in-effect` | 7 hand-rolled type-ahead searches cleared results inside the effect | Derive "no results" from the query length instead, as `useDebouncedSearch` does |
| `next build` rewrites `tsconfig.json` (`jsx: react-jsx`, `target`, `.next/dev/types`) | | Committed as written |
| React 19 resets a `<form action={fn}>`'s uncontrolled fields after the action returns | Forms that show a validation or caught server error lose what the user typed | Not changed here: see Follow-ups |

## Follow-ups

- React 19 form reset: forms whose action handler returns early or catches an error (`SetupTableList`, `UserForm`, `RoleForm`, `TenantForm`, `SupplyOrderItemPanel`, `ResetPasswordForm`, the contact/speaker add forms) now clear their uncontrolled fields when they show the error. Fix per form (controlled inputs or `onSubmit`), with the UI exercised.
- Move the 7 hand-rolled type-ahead searches onto `useDebouncedSearch`, as CLAUDE.md asks.

## Steps

1. `npm install next@16.4.3 react@^19 react-dom@^19 eslint-config-next@16.4.3`.
2. `next.config.mjs`: `serverExternalPackages`.
3. `src/middleware.ts` → `src/proxy.ts`.
4. Fix whatever `tsc`, lint (new React 19 hook rules) and `next build` flag, minimally.
5. CLAUDE.md: the Next 14 facts.

## Verification

Local, recorded in the PR: `npx tsc --noEmit`, `npm run lint`, `npm run build`,
`npm audit --audit-level=critical` (no `next` entry). Then the built app against a throwaway
Postgres (`migrate deploy`, seed, `next start`): login page, sign in as the seeded admin, `/events`
and an event detail page, `/api/health`, an invalid `/share/<token>` gives a not-found, `/mcp`
without auth gives 401, an unauthenticated page redirects to `/login`.

## Rollback

Revert the merge commit on `main`; CI builds and deploys the previous code. Faster: point the
stack at the previous image, `ghcr.io/ki4hrg/event-manager:sha-<previous main commit>`, and
redeploy. No schema change is involved, so the database needs nothing.
