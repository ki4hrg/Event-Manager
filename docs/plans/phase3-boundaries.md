# Phase 3: trust boundaries

Standards sweep phase 3 (`docs/plans/standards-conformance.md`, standards checklist "Phase 3").
Done when every input from outside is parsed and every entry point authenticates itself, with tests
for the refusals: bad input, wrong user, wrong tenant.

## Inventory (2026-10-31, at 331b552)

**Authentication: no gaps.** Every Server Action export, route handler and MCP tool authenticates and
authorizes per call, or is a documented public surface that checks its own token
(`docs/ARCHITECTURE.md` route-guard table).

- 53 `"use server"` modules, 610 exports, plus 482 inline `"use server"` closures in pages; all
  delegate to a guarded action except `signOut` (`src/components/Header.tsx`).
- 16 route handlers (18 methods).
- 333 MCP tools: 47 check directly, 265 through a `*Core` that does, 19 through local gate
  helpers, 8 load-then-check on the row's event (as the Server Action getters do).
- Load-then-check getters (`getAVOrder` and kin) load the row before the permission check; a
  foreign id still ends in not-found, but the include graph loads first.

**Parsing: none.** Inputs are `formData.get(...) as string` casts, typed positional arguments, and
MCP args read with typeof-only helpers (`src/lib/mcpTools/types.ts`, whose header comment states
the old no-validation policy). Public forms (`src/lib/forms/*`) are the exception: hand-written
parsers with length caps and allow-lists.

## Highest-risk inputs

1. Share links: `reportType` free string and `filters` arbitrary client JSON, stored and later
   read by the unauthenticated `/share` pages; `expiresAt` through `new Date(str)` unchecked
   (`events/share-links/actions.ts`, `events/share-link-groups/actions.ts`).
2. JSON in FormData: `JSON.parse(lines) as QuoteLineArgs[]` (quotes, inbox), `JSON.parse(blocks)`
   (rfps), array-only checks elsewhere; malformed JSON is a 500.
3. Workflow status: `status as EntityStatus` unchecked, `substatus` free text, `entityType` used as
   a map key (`events/workflows/actions.ts`).
4. Form types: `formType as FormType` and `alsoFormTypes` unchecked; an unknown value is a
   TypeError (`events/forms/actions.ts`).
5. MCP envelope: `params.arguments` cast without an object check; batches unbounded
   (`src/app/mcp/route.ts`). Enum args cast without allow-lists (`mcpTools/orders.ts` acquisition
   and packing states); 18 wholesale casts in `mcpTools/hotels.ts`.
6. OAuth dynamic registration: a `null` body is a 500; `redirect_uris` take any scheme; no bounds.
7. Numbers without bounds: quantities, counts, prices (`setup-orders`, `catering-orders`,
   `venues`, `hotels`, `rfps`); a missing setup quantity becomes NaN.
8. Inbound mail: the model's JSON output for an untrusted email is parsed and cast without a
   runtime schema (`src/lib/inboundParse.ts`): the prompt-injection boundary.
9. Lower: `revalidatePath` with a client string (`files/actions.ts`); `getAll(...) as string[]`
   admitting File entries; no rate limit on credential sign-in.

## PR order

One PR per area, each with zod parsing at the entry point and refusal tests (`*.test.ts` beside
the code, real Postgres). Shared helpers go in `src/lib/validation.ts` as the second area needs
them, not ahead of time.

1. **OAuth dynamic registration** (unauthenticated; smallest). Done: #270.
2. Public forms and password reset (`f/[token]` actions and upload, forgot/reset password),
   inbound-email headers. Mostly a port of the existing hand-written parsers. Password reset
   done: #272, #277.
3. Share links and share-link groups: a filters schema per report type. Done: #276
   (`src/lib/shareLinkFilters.ts`).
4. MCP dispatch envelope: argument object check, batch cap (#278); then the generic
   tool-argument gate (#279, `src/lib/mcpTools/argGate.ts`).
5. Workflows, status and form types (enum casts). Done: #280.
6. JSON-in-FormData: quotes, rfps, inbox, hotel proposals, and their MCP tools. JSON lists done:
   this PR (`readJsonList` in `src/lib/validation.ts`, item schemas beside the cores; MCP tools
   covered by #279). Next: the actions in the same files that take arrays or objects as
   arguments (RFP line items, concessions, space, recipients; pickup counts, final guest list).
7. Admin and account.
8. Order types, one PR each (catering, AV, setup, print, supply, media deliverables) with their
   slice of `mcpTools/orders.ts`.
9. Event core: events, functions, breakout schedule, schedule items, specifications, staff.
10. Presentations, speakers, exhibits.
11. Hotels (most casts).
12. Directory: vendors, venues, contacts, equipment, storage locations, files.
13. Inbound mail model output: a zod schema for each proposal kind.

Then: refusals reach the person (#252, `UserFacingError` on every user-facing refusal), and
`/security-review` over the whole phase.
