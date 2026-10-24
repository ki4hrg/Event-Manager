# OAuth 2.1 for the MCP connector

The MCP endpoint at `/mcp` accepts two bearer schemes:

1. **OAuth 2.1 access tokens** — what Claude's Custom Connector UI uses. Issued by
   the endpoints documented here.
2. **API keys** — the original scheme, minted at `/account/api-keys`. Still
   supported for stdio clients (Claude Desktop via `mcp-remote`) that can't run a
   browser flow.

Both resolve to a `userId`; nothing downstream cares which was used. Authorization
is enforced per tool call by `requirePermissionForUser`, so a token grants exactly
its owner's role and event assignments — no more, no less, re-evaluated on every
request.

## Adding the connector in Claude

In Claude (web, desktop, or mobile) add a **custom connector** and enter:

```
<origin>/mcp
```

e.g. `https://events.example.com/mcp`. That single URL is all Claude needs —
it discovers the authorization server from there. Claude then sends you to Event
Manager to sign in (skipped if you already have a session) and shows an approval
screen; choose **Allow access** and you're connected.

## Endpoints

| Path | Spec | Auth | Purpose |
|---|---|---|---|
| `/.well-known/oauth-authorization-server` | RFC 8414 | public | Authorization server metadata |
| `/.well-known/oauth-protected-resource` (and `/.well-known/oauth-protected-resource/mcp`) | RFC 9728 | public | Names `/mcp` as the resource and this origin as its auth server |
| `/api/oauth/register` | RFC 7591 | public | Dynamic client registration |
| `/api/oauth/authorize` | RFC 6749 §4.1 | session | Validates the request, then hands off to the approval page |
| `/oauth/authorize` | — | session | The approval page itself (an App Router page, not an API route) |
| `/api/oauth/token` | RFC 6749 §4.1.3, §6 | PKCE / refresh token | Issues and rotates tokens |
| `/api/oauth/revoke` | RFC 7009 | token | Revokes a refresh-token family |

The two discovery documents must live at the spec `/.well-known/…` paths, but the
App Router can't host a route segment whose folder starts with a dot. The handlers
therefore live at `src/app/api/well-known/*` and `next.config.mjs` rewrites the
spec paths onto them.

All of these are exempted from the auth middleware by the `authorized` callback in
`src/lib/auth.ts`. The approval page at `/oauth/authorize` is **not** exempt — it
is deliberately gated, because a signed-in session is the credential the whole
flow rests on.

Registration is anonymous, so `/api/oauth/register` is rate-limited per client
IP (`OAUTH_REGISTER_PER_IP` in `src/lib/rateLimit.ts`, in memory). Over the
limit it answers 429 `temporarily_unavailable` with a `Retry-After` header.

## The flow

```
Claude                        Event Manager
  |
  |-- GET /.well-known/oauth-protected-resource ------->  resource + auth server
  |-- GET /.well-known/oauth-authorization-server ----->  endpoint URLs
  |
  |-- POST /api/oauth/register ------------------------>  client_id (public client)
  |
  |-- GET /api/oauth/authorize?...&code_challenge=... ->  validate client + PKCE
  |                                                       no session?
  |                                       302 /login?callbackUrl=/oauth/authorize?...
  |                                                       (sign in, then resume)
  |                                       302 /oauth/authorize?...
  |
  |                                       [approval page: Allow access / Deny]
  |                                         Allow -> mint single-use code
  |                                         Deny  -> error=access_denied
  |
  |<-- 303 https://claude.ai/api/mcp/auth_callback?code=...&state=...
  |
  |-- POST /api/oauth/token (code + code_verifier) ---->  verify PKCE, claim code
  |<-- access_token (15 min) + refresh_token (30 days)
  |
  |-- POST /mcp  Authorization: Bearer <access_token>
```

`https://claude.ai/api/mcp/auth_callback` is the redirect URI hosted Claude
registers. Nothing is hard-coded to it — a client may register any redirect URI,
and only URIs it registered are ever accepted.

### PKCE

S256 is mandatory. A request with no `code_challenge`, or with
`code_challenge_method=plain`, is rejected. There are no client secrets: every
client is public (`token_endpoint_auth_method: "none"`), so the PKCE verifier is
the only thing binding a code redemption to the party that requested it.

### Tokens

- **Authorization code** — single-use, 10-minute TTL. Redemption is an atomic
  conditional update guarded on `usedAt: null`, so two concurrent redemptions
  can't both succeed. A replay deletes the code.
- **Access token** — HS256 JWT, 15-minute TTL, signed with `AUTH_SECRET` (the
  secret next-auth already requires, falling back to `NEXTAUTH_SECRET` as
  next-auth does; there's no second secret to provision).
  Self-contained, so `/mcp` verifies it with no database round-trip.
- **Refresh token** — opaque 32 random bytes, 30-day TTL, rotated on every use.
  Only the SHA-256 hash is stored. Presenting an already-rotated token is treated
  as theft and revokes the entire rotation family.

Because access tokens are self-contained, a revoked session keeps working until
its access token expires — at most 15 minutes. That's the trade for keeping the
MCP hot path free of database lookups.

### What gets stored

Three tables, all in `prisma/schema.prisma`: `OAuthClient`,
`OAuthAuthorizationCode`, `OAuthRefreshToken`. Codes and refresh tokens are stored
as SHA-256 hashes only, the same rule as `ApiKey.hashedKey` — and for the same
reason: these are high-entropy randoms, so one indexed hash lookup is the right
verification, not a bcrypt per-row compare.

The two user-scoped tables cascade on user delete, so removing a user tears down
their outstanding grants with them.

## Errors

Token and revocation endpoints return RFC 6749 JSON (`{ error, error_description }`)
with `Cache-Control: no-store`.

The authorization endpoint reports errors back to the client's `redirect_uri`
(`?error=…&error_description=…&state=…`) **only** once that redirect URI has been
matched against the client's registered list. Before that — unknown `client_id`,
missing or unregistered `redirect_uri` — the error is rendered in the browser
instead, because redirecting to an unverified URI would make this an open
redirect.

## Schema changes

The project has no `prisma/migrations` directory; it tracks the schema with
`prisma db push`. After pulling these tables:

```bash
npm run db:push
```

Adding the user foreign keys will fail if any OAuth rows already reference a
deleted user. Nothing reads such rows (the token endpoint rejects a grant whose
user is gone), so they can be deleted:

```sql
DELETE FROM "OAuthAuthorizationCode" WHERE "userId" NOT IN (SELECT id FROM "User");
DELETE FROM "OAuthRefreshToken"      WHERE "userId" NOT IN (SELECT id FROM "User");
```

## Out of scope

This is an authorization server for one thing: the MCP connector. It is not a
general-purpose OAuth provider. Tokens are not scope-restricted — they carry the
full permission set of their owner, and the `"mcp"` scope string exists only to
populate the discovery documents. There is no UI for auditing or revoking
refresh tokens; `/users/api-keys` (and `/account/api-keys`) covers API keys only.
