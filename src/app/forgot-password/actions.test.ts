import { describe, expect, it, vi } from "vitest";
import { makeUser } from "../../../test/fixtures";

// The reset mail itself is out of scope; record who it would go to.
const sent = vi.hoisted(() => [] as string[]);
vi.mock("@/lib/email", () => ({
  sendPasswordResetEmail: vi.fn(async (user: { email: string }) => {
    sent.push(user.email);
  }),
}));
// Each call gets a fresh client IP so the per-IP limit never trips.
vi.mock("@/lib/rateLimit", async (orig) => ({
  ...(await orig<typeof import("@/lib/rateLimit")>()),
  clientIp: async () => `10.1.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
}));

const { requestPasswordReset } = await import("./actions");

function form(email: unknown) {
  const fd = new FormData();
  if (email !== undefined) fd.set("email", email as string);
  return fd;
}

const SAME_ANSWER = { digest: expect.stringContaining("NEXT_REDIRECT") };

describe("requestPasswordReset", () => {
  it("mails a registered address, matched case-insensitively", async () => {
    const user = await makeUser();
    await expect(requestPasswordReset(form(`  ${user.email.toUpperCase()} `))).rejects.toMatchObject(SAME_ANSWER);
    expect(sent).toContain(user.email);
  });

  it.each([
    ["an unregistered address", "nobody@example.test"],
    ["something that isn't an address", "not an email"],
    ["an over-long address", `${"a".repeat(250)}@example.test`],
    ["an empty field", ""],
    ["a missing field", undefined],
  ])("answers %s exactly like a registered one, and sends nothing", async (_label, email) => {
    const before = sent.length;
    await expect(requestPasswordReset(form(email))).rejects.toMatchObject(SAME_ANSWER);
    expect(sent.length).toBe(before);
  });
});
