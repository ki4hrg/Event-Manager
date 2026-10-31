import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { redirectUriMatches, validateAuthorizationRequest } from "./mcpOAuth";

function authorize(clientId: string, redirectUri: string) {
  return validateAuthorizationRequest(
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      code_challenge: "x".repeat(43),
      code_challenge_method: "S256",
      state: "s",
    }),
  );
}

describe("redirectUriMatches", () => {
  it("matches exactly", () => {
    expect(redirectUriMatches("https://claude.ai/cb", "https://claude.ai/cb")).toBe(true);
    expect(redirectUriMatches("https://claude.ai/cb", "https://claude.ai/cb2")).toBe(false);
  });

  it("lets a loopback redirect use any port, and nothing else differ", () => {
    expect(redirectUriMatches("http://127.0.0.1/cb", "http://127.0.0.1:53121/cb")).toBe(true);
    expect(redirectUriMatches("http://localhost:8000/cb", "http://localhost:9000/cb")).toBe(true);
    expect(redirectUriMatches("http://127.0.0.1/cb", "http://127.0.0.1:53121/other")).toBe(false);
    expect(redirectUriMatches("http://127.0.0.1/cb", "http://evil.example:53121/cb")).toBe(false);
    expect(redirectUriMatches("https://claude.ai/cb", "https://claude.ai:8443/cb")).toBe(false);
  });
});

describe("validateAuthorizationRequest: redirect_uri", () => {
  it("accepts a registered https redirect", async () => {
    const client = await prisma.oAuthClient.create({ data: { redirectUris: ["https://claude.ai/api/mcp/auth_callback"] } });
    const result = await authorize(client.clientId, "https://claude.ai/api/mcp/auth_callback");
    expect(result.ok).toBe(true);
  });

  it("accepts a loopback redirect on a port chosen at request time", async () => {
    const client = await prisma.oAuthClient.create({ data: { redirectUris: ["http://127.0.0.1/cb"] } });
    const result = await authorize(client.clientId, "http://127.0.0.1:53121/cb");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.request.redirectUri).toBe("http://127.0.0.1:53121/cb");
  });

  it.each([
    ["plain http to a remote host", "http://evil.example/cb"],
    ["a custom scheme", "myapp://cb"],
    ["javascript:", "javascript:alert(1)"],
  ])("refuses %s stored before registration checked it, without redirecting", async (_label, uri) => {
    const client = await prisma.oAuthClient.create({ data: { redirectUris: [uri] } });
    const result = await authorize(client.clientId, uri);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.redirectUri).toBeNull();
  });

  it("refuses an unregistered redirect", async () => {
    const client = await prisma.oAuthClient.create({ data: { redirectUris: ["https://claude.ai/cb"] } });
    const result = await authorize(client.clientId, "https://evil.example/cb");
    expect(result.ok).toBe(false);
  });
});
