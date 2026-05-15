# Step 1: Reverse Engineer the Codebase

*Run this as an initial step in the review process to identify undocumented patterns and conventions.*

---

```
# Reverse-engineer this codebase's conventions

You are performing a **descriptive** review of this Next.js codebase. Your goal is to document what the code *actually does*, not to evaluate whether it's good. Save judgment for a later pass — right now, accuracy and citation density matter more than opinions.

## Output

Write your findings to `reviews/claudemd/conventions-observed.md`. Use the structure below. Every claim must include `file:line` citations. Patterns without at least 3 cited examples should be flagged as "tentative" or omitted.

## Phase 1: Framework inventory

Before describing patterns, document the constraints:

- Next.js version, router(s) in use (App / Pages / both)
- Key entries from `next.config.*`: experimental flags, output mode, redirects/rewrites, image config
- Relevant dependencies from `package.json` that shape patterns: ORM, auth, validation, forms, state, styling, testing
- `tsconfig.json`: path aliases, strictness flags
- Top-level directory layout and what appears to live where

Keep this section factual and short. It exists to ground later sections.

## Phase 2: Route archetypes

Cluster the routes in `app/` (and/or `pages/`) by structural similarity. Name each cluster descriptively (e.g., "authenticated list with filters", "public marketing page", "form-with-server-action", "dashboard with parallel routes"). For each archetype:

- Cite 3-5 representative routes
- Document the canonical pattern: how data loads, where auth is checked, what's server vs client, how mutations work, what gets revalidated
- Note any deviations within the cluster

## Phase 3: Pattern extraction by area

For each area below, follow this structure:

> **Pattern name**
> *What it does:* one sentence
> *Examples:* `file:line`, `file:line`, `file:line` (minimum 3)
> *Occurrences:* approximate count or "dominant" / "common" / "rare"
> *Variants:* note any meaningfully different versions and where they appear

Areas to cover:

1. **Server vs Client boundary** — for every `"use client"` directive, identify the specific reason (state, effects, browser API, event handlers, third-party client lib). Group by reason. Flag any client component whose stated reason is unclear.

2. **Data fetching and caching** — every distinct way `fetch()`, `cache()`, `unstable_cache`, or ORM queries are called. Note `cache:` and `next:` options, tag naming schemes, and where revalidation happens.

3. **Server Actions** — for each action: location (co-located / `actions.ts` / separate layer), input validation approach, auth check pattern, return shape, revalidation calls. Output as a table if there are more than ~5.

4. **Route handlers** (`route.ts`) — when used instead of Server Actions, and what for.

5. **Auth and middleware** — what `middleware.ts` does, how sessions are read, where protected-route checks live (middleware / layout / page / action), and whether there's a canonical `getSession()` / `requireUser()` helper.

6. **Forms and mutations** — `useActionState` / `useFormState`, react-hook-form, native forms; optimistic update patterns; error display patterns.

7. **Validation** — zod (or other) schema location and reuse; whether the same schema covers client and server; how validation errors flow back to the UI.

8. **Error handling** — `error.tsx` / `not-found.tsx` placement; try/catch conventions in Server Actions and route handlers; logging patterns.

9. **Data layer** — which files import the ORM/db directly; whether there's a repository or query layer; how domain types relate to DB row types.

10. **Type boundaries** — how types cross server/client boundaries; how `params` and `searchParams` are typed; reuse of Server Action return types on the client.

11. **State management** — client-side libraries in use (Zustand / Jotai / Context / Redux / none) and what each manages; what lives in URL searchParams.

12. **Styling and UI** — Tailwind / CSS Modules / other; `cn()` utility; design tokens; component library customization patterns.

13. **Environment and config** — validated env (`env.ts` / t3-env) vs raw `process.env`; `NEXT_PUBLIC_` discipline; feature flag patterns.

14. **Performance primitives** — `next/image`, `next/font`, `next/dynamic`, `next/script` usage patterns.

15. **Testing** — test file locations, naming, fixture/mocking conventions, what's tested vs not (especially Server Components and Server Actions).

16. **Logging and observability** — `console.*` vs structured logger; `instrumentation.ts`; error reporting.

## Phase 4: Import graph signals

- Which `lib/` modules are imported in 5+ places? For each, describe what it abstracts and what calling it looks like.
- Which modules are imported by both client and server code? List them — these are the cross-boundary contracts.
- Which files import directly from the ORM/db? Is data access centralized or scattered?

## Phase 5: The seams

Read every `layout.tsx`, `middleware.ts`, root `providers.tsx` (or equivalent), `error.tsx`, `not-found.tsx`, and `loading.tsx`. From these alone, describe:

- The auth model
- The provider/context stack available to client components
- The streaming/suspense strategy
- The error-handling philosophy

## Phase 6: Almost-conventions

The highest-value findings. List:

- Patterns used in most but not all applicable places (e.g., "8 of 10 Server Actions validate with zod; 2 don't"). Name the conforming and deviating files.
- Cases where two files solve the same problem differently. Describe both approaches; note which is more recent (use `git log` if available).
- Utilities that exist but aren't consistently used.

## Phase 7: Inferred CLAUDE.md

Based on everything documented, write a section titled **"CLAUDE.md as inferred from the codebase"**. This is a strawman: the rules that *appear* to govern this codebase, written as if you were authoring CLAUDE.md from scratch based only on observation. Where patterns conflict, note both versions and which is dominant. Keep it to rules you can defend with citations from earlier sections.

## Rules for this task

- **Describe, don't judge.** No "should", "better", "cleaner", "anti-pattern". Save evaluation for later.
- **Cite everything.** `file:line` for every claim. Patterns with fewer than 3 examples are tentative or omitted.
- **Sample, don't sweep.** For large areas, pick representative examples rather than enumerating everything.
- **Prefer counts over adjectives.** "Used in 23 of 27 Server Actions" beats "commonly used".
- **Flag uncertainty.** If a pattern is unclear or you can't find enough examples, say so explicitly rather than generalizing.
- **Read imports, not just code.** Import graphs reveal architecture faster than reading file bodies.
- If `git` is available, use `git log` and `git blame` to identify which patterns are recent vs legacy.
```
