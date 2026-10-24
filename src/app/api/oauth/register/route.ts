import { prisma } from "@/lib/prisma";
import { OAUTH_REGISTER_PER_IP, clientIpFrom, rateLimit } from "@/lib/rateLimit";

// RFC 7591 Dynamic Client Registration. claude.ai self-registers anonymously
// before starting the authorization-code flow. PKCE-only (no client secret).
export async function POST(request: Request) {
  const limited = rateLimit(OAUTH_REGISTER_PER_IP, clientIpFrom(request.headers));
  if (!limited.allowed) {
    return Response.json(
      { error: "temporarily_unavailable", error_description: "Too many registrations. Try again later." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const clientName =
    typeof body.client_name === "string" ? body.client_name : null;
  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((u): u is string => typeof u === "string")
    : [];

  if (redirectUris.length === 0) {
    return Response.json(
      {
        error: "invalid_client_metadata",
        error_description: "At least one redirect_uri is required.",
      },
      { status: 400 },
    );
  }

  for (const uri of redirectUris) {
    try {
      new URL(uri);
    } catch {
      return Response.json(
        {
          error: "invalid_client_metadata",
          error_description: `Invalid redirect_uri: ${uri}`,
        },
        { status: 400 },
      );
    }
  }

  const client = await prisma.oAuthClient.create({
    data: { clientName, redirectUris },
  });

  return Response.json(
    {
      client_id: client.clientId,
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      grant_types: client.grantTypes,
      response_types: client.responseTypes,
      token_endpoint_auth_method: client.tokenEndpointAuthMethod,
    },
    { status: 201 },
  );
}
