import { NextRequest } from "next/server";
import { resolveBearerToUserId } from "@/lib/mcpAuth";
import { mcpTools, findMcpTool } from "@/lib/mcpTools";
import { serializeForMcp } from "@/lib/mcpSerialize";
import { PermissionError } from "@/lib/permissions";

// Stateless MCP-over-HTTP. The MCP protocol is JSON-RPC 2.0 with a fixed set of
// methods. For tools-only servers (no resources, no prompts, no subscriptions)
// we don't need a persistent session — each POST carries a single request and
// gets a single response. This keeps the handler trivially compatible with the
// Next.js App Router's Request/Response model (no Node stream bridging).

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "event-manager-mcp", version: "1.0.0" };

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

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

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json", "www-authenticate": "Bearer" },
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
      return ok(req.id, {
        tools: mcpTools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });
    }
    case "tools/call": {
      const params = req.params ?? {};
      const name = typeof params.name === "string" ? params.name : null;
      const args =
        (params.arguments as Record<string, unknown> | undefined) ?? {};
      if (!name) return err(req.id, ERROR_INVALID_PARAMS, "Missing tool name");
      const tool = findMcpTool(name);
      if (!tool) return err(req.id, ERROR_METHOD_NOT_FOUND, `Unknown tool: ${name}`);
      try {
        const result = await tool.handler(args, { userId });
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

export async function POST(request: NextRequest) {
  const userId = await resolveBearerToUserId(request.headers.get("authorization"));
  if (!userId) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(err(null, ERROR_PARSE, "Invalid JSON"), { status: 400 });
  }

  if (Array.isArray(body)) {
    // Batched requests — process each and return an array (skip notification responses).
    const responses: JsonRpcResponse[] = [];
    for (const item of body) {
      if (!item || typeof item !== "object") {
        responses.push(err(null, ERROR_INVALID_REQUEST, "Invalid request"));
        continue;
      }
      const resp = await dispatch(item as JsonRpcRequest, userId);
      if (resp) responses.push(resp);
    }
    return Response.json(responses);
  }

  if (!body || typeof body !== "object") {
    return Response.json(err(null, ERROR_INVALID_REQUEST, "Invalid request"), {
      status: 400,
    });
  }

  const resp = await dispatch(body as JsonRpcRequest, userId);
  if (!resp) return new Response(null, { status: 204 });
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
