import { NextRequest } from "next/server";
import { z } from "zod";
import { resolveBearerToUserId } from "@/lib/mcpAuth";
import { verifyMcpAccessToken, getRequestBaseUrl } from "@/lib/mcpOAuth";
import { findMcpTool, classifiedTools, TENANT_ARG, TENANT_FREE_TOOLS } from "@/lib/mcpTools";
import { checkToolArgs } from "@/lib/mcpTools/argGate";
import { accessibleTenantsForUser, resolveTenantForUser } from "@/lib/tenant";
import { serializeForMcp } from "@/lib/mcpSerialize";
import { PermissionError } from "@/lib/permissions";

// Stateless MCP-over-HTTP. The MCP protocol is JSON-RPC 2.0 with a fixed set of
// methods. For tools-only servers (no resources, no prompts, no subscriptions)
// we don't need a persistent session — each POST carries a single request and
// gets a single response. This keeps the handler trivially compatible with the
// Next.js App Router's Request/Response model (no Node stream bridging).

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "event-manager-mcp", version: "1.0.0" };

// A JSON object, not an array or null: what params and tool arguments must be.
const plainObject = z.custom<Record<string, unknown>>(
  (v) => typeof v === "object" && v !== null && !Array.isArray(v),
);

// The envelope every request must have. `jsonrpc` isn't checked: it carries
// nothing, and refusing a client that omits it would gain no safety.
const RequestIdSchema = z.union([z.string().max(200), z.number(), z.null()]);

// `params: null` is accepted as absent, as it always was.
const JsonRpcRequestSchema = z.object({
  id: RequestIdSchema.optional(),
  method: z.string().min(1).max(200),
  params: plainObject.nullish(),
});

// A response the client posts back (Streamable HTTP allows it): no method,
// a result or an error. It gets no reply.
function isClientResponse(item: unknown): boolean {
  return plainObject.safeParse(item).success && !("method" in (item as object)) && ("result" in (item as object) || "error" in (item as object));
}

type JsonRpcRequest = z.infer<typeof JsonRpcRequestSchema>;

const ToolCallParamsSchema = z.object({
  name: z.string().min(1).max(200),
  // `arguments: null` means none, as it always did.
  arguments: plainObject.nullish(),
});

// Each request in a batch runs in turn, so a batch is bounded. The current MCP
// spec dropped batching; clients send one request per POST.
const MAX_BATCH = 20;

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

// JSON-RPC + MCP-spec error codes.
const ERROR_PARSE = -32700;
const ERROR_INVALID_REQUEST = -32600;
const ERROR_METHOD_NOT_FOUND = -32601;
const ERROR_INVALID_PARAMS = -32602;
const ERROR_INTERNAL = -32603;

function ok(id: JsonRpcRequest["id"], result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function err(
  id: JsonRpcRequest["id"],
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, data } };
}

// Two bearer schemes are accepted. OAuth 2.1 access tokens (HS256 JWTs minted by
// /api/oauth/token) are tried first — verification is a signature check, no DB
// hit. If the token isn't a valid JWT we fall back to the legacy API-key path
// (SHA-256 lookup against ApiKey.hashedKey). Either resolves to a userId; tools
// then enforce per-call permissions via requirePermissionForUser.
async function resolveMcpUserId(
  authorizationHeader: string | null,
): Promise<string | null> {
  if (!authorizationHeader) return null;
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  if (match) {
    const token = match[1].trim();
    const payload = await verifyMcpAccessToken(token);
    if (payload) return payload.sub;
  }
  // Not an OAuth token — try an API key.
  return resolveBearerToUserId(authorizationHeader);
}

async function unauthorized(): Promise<Response> {
  // Point clients at the protected-resource metadata so claude.ai can discover
  // the OAuth authorization server (MCP auth spec / RFC 9728).
  const base = await getRequestBaseUrl();
  const wwwAuth = `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`;
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json", "www-authenticate": wwwAuth },
  });
}

async function dispatch(
  req: JsonRpcRequest,
  userId: string,
): Promise<JsonRpcResponse | null> {
  // Notifications (no id) get no response — initialized, cancelled, etc.
  const isNotification = req.id === undefined || req.id === null;

  switch (req.method) {
    case "initialize": {
      return ok(req.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      });
    }
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
      return ok(req.id, {});
    case "tools/list": {
      // classifiedTools() adds per-tool `annotations` (readOnly/destructive/
      // idempotent/openWorld hints) and a single-element `groups` array
      // ("read" | "create" | "mutate" | "delete") derived from the tool name
      // prefix. Annotations influence approval-prompt phrasing in some
      // clients; `groups` is the SEP-1300 sub-section field that Claude
      // Desktop is expected to render but doesn't today — included now so
      // it Just Works when client support lands.
      return ok(req.id, { tools: classifiedTools() });
    }
    case "tools/call": {
      const params = ToolCallParamsSchema.safeParse(req.params ?? {});
      if (!params.success) {
        return err(req.id, ERROR_INVALID_PARAMS, "params needs a tool `name` and, if given, an `arguments` object");
      }
      const { name } = params.data;
      const args = params.data.arguments ?? {};
      const tool = findMcpTool(name);
      if (!tool) return err(req.id, ERROR_METHOD_NOT_FOUND, `Unknown tool: ${name}`);
      // Which organization the call acts in. A key spans every tenant its user
      // belongs to, so each call names one — except when there is only one to
      // name. Unknown or off-limits handles read the same as an absent one, so
      // a caller can't probe which slugs exist.
      const { [TENANT_ARG]: tenantArg, ...toolArgs } = args;
      let tenantId = "";
      if (!TENANT_FREE_TOOLS.has(name)) {
        if (typeof tenantArg === "string" && tenantArg.length > 0) {
          const tenant = await resolveTenantForUser(userId, tenantArg);
          if (!tenant) {
            return err(req.id, ERROR_INVALID_PARAMS, `Unknown tenant: ${tenantArg}. Call list_tenants.`);
          }
          tenantId = tenant.id;
        } else {
          const { tenants } = await accessibleTenantsForUser(userId);
          if (tenants.length !== 1) {
            return err(
              req.id,
              ERROR_INVALID_PARAMS,
              tenants.length === 0
                ? "This user belongs to no organization."
                : `Missing \`${TENANT_ARG}\` argument: this user belongs to ${tenants.length} organizations. Call list_tenants and pass one's slug.`,
            );
          }
          tenantId = tenants[0].id;
        }
      }
      // The tool's inputSchema, checked before the handler runs. A refusal is a
      // tool error, so the model sees which argument to fix and retries.
      const checked = checkToolArgs(tool, toolArgs);
      if (!checked.ok) {
        return ok(req.id, { isError: true, content: [{ type: "text", text: checked.message }] });
      }
      try {
        const result = await tool.handler(checked.args, { userId, tenantId });
        return ok(req.id, {
          content: [
            { type: "text", text: JSON.stringify(serializeForMcp(result), null, 2) },
          ],
        });
      } catch (e) {
        if (e instanceof PermissionError) {
          const map: Record<string, number> = {
            UNAUTHENTICATED: -32001,
            FORBIDDEN: -32002,
            NOT_FOUND: -32003,
          };
          return err(req.id, map[e.kind] ?? ERROR_INTERNAL, e.kind);
        }
        const message = e instanceof Error ? e.message : "Tool execution failed";
        // Tool errors surface as a successful response with isError:true, per MCP spec,
        // so the LLM can see the error text and retry.
        return ok(req.id, {
          isError: true,
          content: [{ type: "text", text: message }],
        });
      }
    }
    default:
      if (isNotification) return null;
      return err(req.id, ERROR_METHOD_NOT_FOUND, `Unknown method: ${req.method}`);
  }
}

// The id to answer a malformed request with, when it has a usable one.
function requestId(item: unknown): JsonRpcRequest["id"] {
  if (!plainObject.safeParse(item).success) return null;
  const id = RequestIdSchema.safeParse((item as { id?: unknown }).id);
  return id.success ? id.data : null;
}

export async function POST(request: NextRequest) {
  const userId = await resolveMcpUserId(request.headers.get("authorization"));
  if (!userId) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(err(null, ERROR_PARSE, "Invalid JSON"), { status: 400 });
  }

  if (Array.isArray(body)) {
    // JSON-RPC: an empty batch is one Invalid Request, not an empty reply.
    if (body.length === 0 || body.length > MAX_BATCH) {
      const message = body.length === 0 ? "Empty batch" : `Batch too large (at most ${MAX_BATCH} requests)`;
      return Response.json(err(null, ERROR_INVALID_REQUEST, message), { status: 400 });
    }
    // Process each and return an array (skip notification responses).
    const responses: JsonRpcResponse[] = [];
    for (const item of body) {
      if (isClientResponse(item)) continue;
      const parsed = JsonRpcRequestSchema.safeParse(item);
      if (!parsed.success) {
        responses.push(err(requestId(item), ERROR_INVALID_REQUEST, "Invalid request"));
        continue;
      }
      const resp = await dispatch(parsed.data, userId);
      if (resp) responses.push(resp);
    }
    // A batch of only notifications/responses produces no replies. Per the MCP
    // Streamable HTTP spec the server MUST answer 202 Accepted with no body —
    // not a 200 with an empty array.
    if (responses.length === 0) return new Response(null, { status: 202 });
    return Response.json(responses);
  }

  if (isClientResponse(body)) return new Response(null, { status: 202 });
  const parsed = JsonRpcRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(err(requestId(body), ERROR_INVALID_REQUEST, "Invalid request"), {
      status: 400,
    });
  }

  const resp = await dispatch(parsed.data, userId);
  // No reply means the input was a notification (e.g. notifications/initialized,
  // sent right after initialize). The MCP Streamable HTTP spec requires 202
  // Accepted with no body here; claude.ai's connector rejects a 204 and reports
  // a generic "couldn't connect", whereas lenient stdio proxies tolerate it.
  if (!resp) return new Response(null, { status: 202 });
  return Response.json(resp);
}

// GET on the MCP endpoint is sometimes used by clients to open an SSE stream.
// In stateless mode we don't support server-initiated messages — return 405.
export async function GET() {
  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { "content-type": "application/json", allow: "POST" },
  });
}
