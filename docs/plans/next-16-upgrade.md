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
| React 19 resets a `<form action={fn}>`'s uncontrolled fields after the action returns | Forms that show a validation or caught server error lose what the user typed | `onReset={keepFormValues}`: see Runtime behaviour changes |

## Runtime behaviour changes

Changes a user or operator can see that `tsc`, lint and the build don't catch.

- **Form reset.** React 19 resets a `<form action={fn}>` after the action returns,
  whatever it returned. A form that stays on screen after the server (or a client check)
  refuses the input lost what the user typed, against the rule that forms keep what was typed
  when the server refuses. Fix: `onReset={keepFormValues}` (`src/lib/keepFormValues.ts`).
  React resets through the native `form.reset()`, whose `reset` event is cancelable, so
  cancelling it keeps the values, and the form keeps `<form action>` and `useFormStatus` as
  CLAUDE.md asks. Rejected: `onSubmit` + `useTransition` (drops `useFormStatus`, a pending prop
  per form, a larger diff against the Forms convention) and controlled inputs (state for every
  field). Applied to every form whose handler returns early, shows `isUserError`, catches a
  throw or raises a conflict prompt while staying put: `UserForm`, `RoleForm`, `TenantForm`,
  `SendTestEmailForm`, `ResetPasswordForm`, `ApiKeyForm`, `OptionList` (add, edit),
  `SetupTableList`, `ScheduleList` (add, edit), `KeyStaffList`, `EventStaffList`, the
  function/venue/vendor contact and speaker add forms, `FormLinkButton`, `PickupGuests`,
  `RfpRecipients` (add hotel), `SeriesList` (create, rename), `LocationContents` (add, edit
  item) and `BreakoutGrid` (add session, add group, rename group: their actions return at once
  and run the save in `startTransition`, so React reset them on submit, blanking the fields
  while the save was pending). `LocationContents`' add form clears after a success for the
  next item, so it cancels the reset only after a refusal. `SendTestEmailForm` stays on screen
  after a send and now keeps the recipient, as on React 18. In `ScheduleList`, editing the form
  after a conflict withdraws "Save anyway", which saves the values that conflicted.
  Unchanged: forms whose action awaits the save and then redirects, closes or remounts, with
  a throw going to the error boundary (`SupplyOrderItemPanel`'s item form, `PresentationForm`,
  `MediaDeliverableForm`, `WorkflowEditor`, the order forms). They never show a refusal in
  place, so the reset isn't seen. A new form that shows a refusal in place needs
  `keepFormValues` too (parked in `reviews/claudemd/candidates.md`).
- **Proxy body limit.** Next 16 buffers the body of a request passing through the proxy and
  cuts it off at 10MB (`experimental.proxyClientMaxBodySize`). The proxy matches every route,
  so uploads over 10MB arrived truncated. `next.config.mjs` sets it to `"100mb"`, matching
  `MAX_UPLOAD_BYTES`.

- **Caching.** GET route handlers and `fetch` are no longer cached by default, and the client
  router cache keeps dynamic pages for 0 s (Next 15). Every page here is `force-dynamic` and
  the handlers do auth or I/O, so pages can only get fresher: no change.
- **Middleware → proxy.** `src/proxy.ts` runs on the Node runtime where middleware ran on
  edge. Same matcher and the same NextAuth check (signed-out page → `/login`, `/mcp` → 401).
- **Server error messages.** A plain `Error` thrown by a Server Action reaches the client as
  React's minified "error #441" text in production (Next 14 showed an English "omitted in
  production" sentence). Every client component that prints `e.message` from a thrown action
  shows that text: the redirecting admin forms (`UserForm`, `RoleForm`, `TenantForm`,
  `ResetPasswordForm`) for every refusal, and the `useTransition` callers (`ApiKeyForm`,
  `SeriesList`, `MembershipEditor`, `LocationContents`, the inbox reviews and others) for
  anything that isn't a `UserFacingError`. Not fixed here: a follow-up issue.

## Follow-ups

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
