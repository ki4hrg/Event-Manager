# Bug and correctness review of codebase

You are the bugs-and-correctness agent in a multi-agent codebase review. Other agents cover security, CLAUDE.md compliance, code quality, and architecture.

Write findings to `reviews/code-review/[date]/bugs.md` using the shared finding format in finding-format.md.

## Scope

Focus on:

1. **Logic errors**
   - Off-by-one, inverted conditionals, wrong comparison operators
   - Misused APIs (passing wrong types, wrong argument order)
   - Promise/async misuse: missing awaits, unhandled rejections, race conditions

2. **Error handling**
   - Caught errors that get swallowed or logged but not surfaced
   - Try/catch around code that doesn't throw
   - Missing error handling in async code paths
   - Errors that surface to users as raw exceptions or generic messages

3. **Edge cases**
   - Empty arrays, null/undefined inputs, missing optional fields
   - Off-by-one boundaries (first item, last item, exactly-N items)
   - Concurrent invocations of the same code path
   - Timeouts, network failures, partial reads

4. **State and concurrency**
   - Stale closures in event handlers and effects
   - Effects that should re-run but don't (missing deps) or run too often
   - Race conditions in mutation flows
   - Optimistic updates that don't reconcile correctly on failure

5. **Type and runtime mismatches**
   - `as` casts that paper over real type issues
   - `any` and `unknown` that escape into typed code without validation
   - Server/client serialization boundaries: dates, BigInts, Maps, undefined

6. **Test gaps**
   - Code paths with no test coverage where bugs are likely (mutations, validation, edge cases)
   - Tests that test the mock instead of the code
   - Flaky test patterns (timing dependencies, shared state)

## Rules

- Every finding cites `file:line`. No exceptions.
- Distinguish "this is a bug" from "this could become a bug" — only file the first as Medium or higher.
- Don't flag style issues, formatting, or naming — other agents.
- Don't flag CLAUDE.md violations directly — that's the compliance agent. If a pattern violation also causes bugs, file it here as a bug; the compliance agent will independently file the rule violation, and synthesis will merge.
- For race conditions and concurrency, explain the scenario concretely. "This could race" isn't enough; "if user clicks submit while a refresh is in flight, X happens" is.
