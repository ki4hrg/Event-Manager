import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

// Each request gets its own client IP, so the per-IP rate limit never trips
// across tests.
function register(body: unknown, raw = false) {
  return POST(
    new Request("http://localhost/api/oauth/register", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${randomUUID().slice(0, 4)}` },
      body: raw ? (body as string) : JSON.stringify(body),
    }),
  );
}

describe("POST /api/oauth/register", () => {
  it("registers claude.ai's https callback", async () => {
    const res = await register({ client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.redirect_uris).toEqual(["https://claude.ai/api/mcp/auth_callback"]);
    const stored = await prisma.oAuthClient.findUnique({ where: { clientId: json.client_id } });
    expect(stored?.clientName).toBe("Claude");
  });

  it("accepts http only on a loopback host", async () => {
    expect((await register({ redirect_uris: ["http://localhost:8765/cb"] })).status).toBe(201);
    expect((await register({ redirect_uris: ["http://127.0.0.1/cb"] })).status).toBe(201);
    expect((await register({ redirect_uris: ["http://evil.example/cb"] })).status).toBe(400);
  });

  it.each([
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,hi"],
    ["a custom scheme", "myapp://callback"],
    ["a fragment", "https://claude.ai/cb#frag"],
    ["not a URL", "not a url"],
  ])("refuses a redirect_uri with %s", async (_label, uri) => {
    const res = await register({ redirect_uris: [uri] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_client_metadata");
  });

  it.each([
    ["a null body", null],
    ["an array body", []],
    ["no redirect_uris", { client_name: "x" }],
    ["an empty list", { redirect_uris: [] }],
    ["a non-string uri", { redirect_uris: [42] }],
    ["too many uris", { redirect_uris: Array.from({ length: 11 }, (_, i) => `https://e.example/${i}`) }],
    ["a long client_name", { client_name: "x".repeat(201), redirect_uris: ["https://e.example/cb"] }],
  ])("refuses %s with 400, not 500", async (_label, body) => {
    const res = await register(body);
    expect(res.status).toBe(400);
  });

  it("refuses a body that isn't JSON", async () => {
    const res = await register("{not json", true);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_request");
  });

  it("stores nothing for a refused registration", async () => {
    const before = await prisma.oAuthClient.count();
    await register({ redirect_uris: ["javascript:alert(1)"] });
    expect(await prisma.oAuthClient.count()).toBe(before);
  });
});

describe("registration edge cases", () => {
  it("accepts client_name: null (some libraries send it for unset fields)", async () => {
    expect((await register({ client_name: null, redirect_uris: ["https://e.example/cb"] })).status).toBe(201);
  });

  it("refuses a redirect_uri with a user name, and doesn't echo it", async () => {
    const res = await register({ redirect_uris: ["https://ok.example/cb", "https://claude.ai@evil.example/cb"] });
    expect(res.status).toBe(400);
    const { error_description } = await res.json();
    expect(error_description).toContain("redirect_uris[1]");
    expect(error_description).not.toContain("evil.example");
  });
});
