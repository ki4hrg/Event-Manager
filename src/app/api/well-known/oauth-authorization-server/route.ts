import { MCP_SCOPE, getRequestBaseUrl } from "@/lib/mcpOAuth";

// RFC 8414 — OAuth 2.0 Authorization Server Metadata. Reached via the spec path
// /.well-known/oauth-authorization-server (rewritten here in next.config.mjs).
export async function GET() {
  const base = await getRequestBaseUrl();
  return Response.json({
    issuer: base,
    authorization_endpoint: `${base}/api/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    revocation_endpoint: `${base}/api/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [MCP_SCOPE],
  });
}
