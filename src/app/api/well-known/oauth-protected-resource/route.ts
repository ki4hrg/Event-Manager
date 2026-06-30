import { MCP_SCOPE, getRequestBaseUrl } from "@/lib/mcpOAuth";

// RFC 9728 — OAuth 2.0 Protected Resource Metadata. Tells MCP clients which
// authorization server guards /api/mcp. Reached via the spec path
// /.well-known/oauth-protected-resource (rewritten here in next.config.mjs).
export async function GET() {
  const base = await getRequestBaseUrl();
  return Response.json({
    resource: `${base}/api/mcp`,
    authorization_servers: [base],
    scopes_supported: [MCP_SCOPE],
  });
}
