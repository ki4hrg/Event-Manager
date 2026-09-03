import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes } from "crypto";
import { headers } from "next/headers";
import { getOAuthSigningSecret } from "./auth";
import { prisma } from "./prisma";

// OAuth 2.1 token helpers backing the remote MCP connector. The authorization
// endpoints (src/app/api/oauth/*) mint these; the MCP route (src/app/api/mcp)
// verifies the access token without a DB round-trip. API-key auth in
// ./mcpAuth.ts is independent and still supported.

const ISSUER = "event-manager";
const AUDIENCE = "event-manager-mcp";

// Access tokens are short-lived so a revoked session (refresh-token family)
// stops granting access quickly even though the JWT is self-contained and never
// checked against the DB on the MCP hot path.
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
const ACCESS_TOKEN_TTL = `${ACCESS_TOKEN_TTL_SECONDS}s`;

// Refresh tokens are long-lived and rotated on every use.
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

// Permission is enforced per tool call via requirePermissionForUser, so the
// access token carries no role/scope authority — this static scope exists only
// to populate the discovery documents and the token response.
export const MCP_SCOPE = "mcp";

export type McpTokenPayload = {
  sub: string;
  // The refresh-token (session) id this access token belongs to, so the
  // revocation endpoint can map an access token back to its rotation family.
  sid?: string;
};

export async function createAccessToken(
  user: { id: string },
  sessionId?: string,
): Promise<string> {
  const claims: Record<string, unknown> = { scope: MCP_SCOPE };
  if (sessionId) claims.sid = sessionId;
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_TTL)
    .sign(getOAuthSigningSecret());
}

export async function verifyMcpAccessToken(
  token: string,
): Promise<McpTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getOAuthSigningSecret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      sid: typeof payload.sid === "string" ? payload.sid : undefined,
    };
  } catch {
    return null;
  }
}

// Opaque refresh token: 32 random bytes, base64url-encoded. Returned to the
// client once; only its SHA-256 hash is persisted.
export function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// S256 PKCE verification: base64url(SHA-256(verifier)) === challenge.
export async function verifyCodeChallengeAsync(
  codeVerifier: string,
  codeChallenge: string,
): Promise<boolean> {
  const data = new TextEncoder().encode(codeVerifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const base64url = Buffer.from(hash)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return base64url === codeChallenge;
}

// Absolute origin of the current request, derived from the host/proto headers
// (mirrors getMcpUrl in src/app/account/api-keys/page.tsx). Used to build the
// issuer + endpoint URLs in the discovery docs and the 401 resource_metadata
// pointer, so they stay correct across environments with no env var.
export async function getRequestBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// --- Authorization request handling -----------------------------------------
// Shared by the /api/oauth/authorize route handler (which validates and bounces
// the browser to the approval page) and by the approval page + its Server
// Action (which re-validate before minting a code — the query string round-trips
// through the client, so nothing carried on it is trusted).

export const AUTHORIZATION_CODE_TTL_SECONDS = 10 * 60; // 10 minutes

export type AuthorizationRequest = {
  clientId: string;
  clientName: string | null;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string;
  scope: string;
};

// On failure, `redirectUri` is non-null only when it was checked against the
// client's registered list. RFC 6749 §4.1.2.1: an error may be reported back to
// the client only through a redirect_uri already known to belong to it —
// otherwise it has to be shown to the user instead, or it becomes an open
// redirect.
export type AuthorizationRequestResult =
  | { ok: true; request: AuthorizationRequest }
  | {
      ok: false;
      error: string;
      errorDescription: string;
      redirectUri: string | null;
      state: string;
    };

export async function validateAuthorizationRequest(
  params: URLSearchParams,
): Promise<AuthorizationRequestResult> {
  const state = params.get("state") ?? "";
  const fail = (
    error: string,
    errorDescription: string,
    redirectUri: string | null = null,
  ): AuthorizationRequestResult => ({
    ok: false,
    error,
    errorDescription,
    redirectUri,
    state,
  });

  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const codeChallenge = params.get("code_challenge");
  const codeChallengeMethod = params.get("code_challenge_method") ?? "S256";
  const scope = params.get("scope") ?? "";
  const responseType = params.get("response_type");

  if (!clientId) {
    return fail("invalid_request", "Missing required parameter: client_id.");
  }

  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (!client) {
    return fail("invalid_client", "Unknown client_id.");
  }
  if (!redirectUri) {
    return fail("invalid_request", "Missing required parameter: redirect_uri.");
  }
  if (!client.redirectUris.includes(redirectUri)) {
    return fail(
      "invalid_request",
      "redirect_uri is not registered for this client.",
    );
  }

  // Past this point redirect_uri is trusted, so errors can travel back to the
  // client rather than dead-ending in the browser.
  if (responseType && responseType !== "code") {
    return fail(
      "unsupported_response_type",
      "Only response_type=code is supported.",
      redirectUri,
    );
  }
  if (!codeChallenge) {
    return fail(
      "invalid_request",
      "Missing required parameter: code_challenge. PKCE is mandatory.",
      redirectUri,
    );
  }
  if (codeChallengeMethod !== "S256") {
    return fail(
      "invalid_request",
      "Only the S256 code_challenge_method is supported.",
      redirectUri,
    );
  }

  return {
    ok: true,
    request: {
      clientId,
      clientName: client.clientName,
      redirectUri,
      codeChallenge,
      codeChallengeMethod,
      state,
      scope,
    },
  };
}

// Mints the single-use authorization code for an approved request and returns
// the client's redirect_uri with `code` (and `state`, when the client sent one)
// appended.
export async function createAuthorizationCode(
  request: AuthorizationRequest,
  userId: string,
): Promise<string> {
  const authCode = await prisma.oAuthAuthorizationCode.create({
    data: {
      clientId: request.clientId,
      userId,
      redirectUri: request.redirectUri,
      codeChallenge: request.codeChallenge,
      codeChallengeMethod: request.codeChallengeMethod,
      scope: request.scope || MCP_SCOPE,
      expiresAt: new Date(Date.now() + AUTHORIZATION_CODE_TTL_SECONDS * 1000),
    },
  });

  // Opportunistic cleanup of expired codes — there's no scheduler in this app.
  prisma.oAuthAuthorizationCode
    .deleteMany({ where: { expiresAt: { lt: new Date() } } })
    .catch(() => {});

  const url = new URL(request.redirectUri);
  url.searchParams.set("code", authCode.code);
  if (request.state) url.searchParams.set("state", request.state);
  return url.toString();
}

// Builds the redirect back to the client carrying an OAuth error instead of a
// code — used for the Deny path (`access_denied`) and for request errors caught
// after redirect_uri has been verified.
export function buildErrorRedirect(
  redirectUri: string,
  error: string,
  errorDescription: string,
  state: string,
): string {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  if (errorDescription) {
    url.searchParams.set("error_description", errorDescription);
  }
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

// The canonical query string for the approval page. Rebuilt from the validated
// request rather than forwarded verbatim, so nothing unvetted rides along.
export function authorizationRequestQuery(request: AuthorizationRequest): string {
  const params = new URLSearchParams({
    client_id: request.clientId,
    redirect_uri: request.redirectUri,
    code_challenge: request.codeChallenge,
    code_challenge_method: request.codeChallengeMethod,
    response_type: "code",
  });
  if (request.state) params.set("state", request.state);
  if (request.scope) params.set("scope", request.scope);
  return params.toString();
}
