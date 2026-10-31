import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { OAUTH_REGISTER_PER_IP, clientIpFrom, rateLimit } from "@/lib/rateLimit";

// A redirect URI this server will send authorization codes to (OAuth 2.1
// §2.3.1 and §8.4.2): https anywhere, or http on a loopback host for a native
// client. No fragment. Other schemes (javascript:, data:, custom) are refused.
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

function redirectUriProblem(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "is not a URL";
  }
  if (url.hash) return "has a fragment";
  if (url.protocol === "https:") return null;
  if (url.protocol === "http:" && LOOPBACK.has(url.hostname)) return null;
  return "must be https, or http on localhost";
}

const RegistrationSchema = z.object({
  client_name: z.string().trim().max(200).optional(),
  redirect_uris: z
    .array(z.string().max(2000))
    .min(1, "At least one redirect_uri is required.")
    .max(10, "At most 10 redirect_uris.")
    .superRefine((uris, ctx) => {
      for (const uri of uris) {
        const problem = redirectUriProblem(uri);
        if (problem) ctx.addIssue({ code: "custom", message: `redirect_uri ${problem}: ${uri.slice(0, 200)}` });
      }
    }),
});

function invalidMetadata(description: string) {
  return Response.json({ error: "invalid_client_metadata", error_description: description }, { status: 400 });
}

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_request", error_description: "Body must be JSON." }, { status: 400 });
  }
  // Other RFC 7591 metadata (grant_types, logo_uri, ...) is ignored: the server
  // sets its own (public client, authorization_code + refresh_token).
  const parsed = RegistrationSchema.safeParse(body);
  if (!parsed.success) {
    return invalidMetadata(parsed.error.issues.map((i) => i.message).join("; "));
  }

  const client = await prisma.oAuthClient.create({
    data: { clientName: parsed.data.client_name || null, redirectUris: parsed.data.redirect_uris },
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
