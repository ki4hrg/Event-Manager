import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateApiKey } from "@/lib/mcpAuth";
import { makeUser } from "../../../test/fixtures";
import { POST } from "./route";

// Bearer auth goes through the API-key path; OAuth tokens aren't under test.
vi.mock("@/lib/mcpOAuth", () => ({
  verifyMcpAccessToken: vi.fn(async () => null),
  getRequestBaseUrl: vi.fn(async () => "http://localhost"),
}));

async function apiKey() {
  const user = await makeUser();
  const { fullKey, keyPrefix, hashedKey } = generateApiKey();
  await prisma.apiKey.create({ data: { userId: user.id, name: "test", keyPrefix, hashedKey } });
  return fullKey;
}

async function call(key: string, body: unknown) {
  const res = await POST(
    new NextRequest("http://localhost/mcp", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

const rpc = (id: number, method: string, params?: unknown) => ({ jsonrpc: "2.0", id, method, params });

describe("POST /mcp: the JSON-RPC envelope", () => {
  it("runs a well-formed tool call", async () => {
    const key = await apiKey();
    const { status, json } = await call(key, rpc(1, "tools/call", { name: "list_tenants", arguments: {} }));
    expect(status).toBe(200);
    expect(json).toMatchObject({ id: 1, result: { content: [{ type: "text" }] } });
    expect(json.result.isError).toBeUndefined();
  });

  it.each([
    ["an array", ["x"]],
    ["a string", "everything"],
    ["null", null],
  ])("refuses tool arguments that are %s", async (_label, args) => {
    const key = await apiKey();
    const { json } = await call(key, rpc(2, "tools/call", { name: "list_tenants", arguments: args }));
    expect(json).toMatchObject({ id: 2, error: { code: -32602 } });
  });

  it("refuses a tool call without a name", async () => {
    const key = await apiKey();
    const { json } = await call(key, rpc(3, "tools/call", { arguments: {} }));
    expect(json).toMatchObject({ id: 3, error: { code: -32602 } });
  });

  it.each([
    ["no method", { jsonrpc: "2.0", id: 4 }],
    ["a non-string method", { jsonrpc: "2.0", id: 4, method: 7 }],
    ["params that are an array", rpc(4, "tools/list", [1, 2])],
    ["an object id", { jsonrpc: "2.0", id: { x: 1 }, method: "ping" }],
  ])("answers a request with %s as Invalid Request", async (_label, body) => {
    const key = await apiKey();
    const { status, json } = await call(key, body);
    expect(status).toBe(400);
    expect(json).toMatchObject({ error: { code: -32600 } });
  });

  it("answers each request in a batch, refusing only the malformed one", async () => {
    const key = await apiKey();
    const { status, json } = await call(key, [rpc(1, "ping"), { id: 2 }, rpc(3, "ping")]);
    expect(status).toBe(200);
    expect(json).toEqual([
      expect.objectContaining({ id: 1, result: {} }),
      expect.objectContaining({ id: 2, error: expect.objectContaining({ code: -32600 }) }),
      expect.objectContaining({ id: 3, result: {} }),
    ]);
  });

  it("refuses an empty batch and one over the cap", async () => {
    const key = await apiKey();
    const empty = await call(key, []);
    expect(empty.status).toBe(400);
    expect(empty.json).toMatchObject({ error: { code: -32600 } });

    const big = await call(key, Array.from({ length: 21 }, (_, i) => rpc(i, "ping")));
    expect(big.status).toBe(400);
    expect(big.json).toMatchObject({ error: { code: -32600 } });

    const atCap = await call(key, Array.from({ length: 20 }, (_, i) => rpc(i, "ping")));
    expect(atCap.json).toHaveLength(20);
  });

  it("refuses a request without a valid key before reading it", async () => {
    const { status } = await call("not-a-key", rpc(1, "ping"));
    expect(status).toBe(401);
  });
});
