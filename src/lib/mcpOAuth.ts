import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes } from "crypto";
import { headers } from "next/headers";
import { getOAuthSigningSecret } from "./auth";

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
