## Summary

<!-- One or two sentences: what changes for the person using the app, and why. -->

Closes #

## What changes

-

## Migrations

<!-- None, or: what the migration does, whether it drops or rewrites data, and the backfill. -->

## Verification

<!-- What was actually run and seen, not what should work. -->

- [ ] `npm run typecheck && npm run lint && npm run test && npm run build`
- [ ] `/code-review` run; findings fixed or answered below
- [ ] `/security-review` run (required if this touches auth, OAuth/MCP, permissions, public routes, inbound email/webhooks, secrets or uploads)
- [ ] Checked in light and dark, and at phone width (UI changes)

## Docs

- [ ] CLAUDE.md / docs/ facts updated for anything moved, renamed or removed (including the route-guard table in `docs/ARCHITECTURE.md`)
- [ ] New rules proposed in `docs/claude-candidates.md`, not added to CLAUDE.md
