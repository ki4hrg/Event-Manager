import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { makeUser } from "../../../../test/fixtures";
import { setNewPassword } from "./actions";

async function resetToken(opts: { expiresInMs?: number; used?: boolean } = {}) {
  const user = await makeUser();
  const row = await prisma.passwordResetToken.create({
    data: {
      token: randomUUID(),
      userId: user.id,
      expiresAt: new Date(Date.now() + (opts.expiresInMs ?? 3_600_000)),
      usedAt: opts.used ? new Date() : null,
    },
  });
  return { user, token: row.token };
}

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

// redirect() throws Next's redirect error; reaching it means the action succeeded.
const REDIRECTED = { digest: expect.stringContaining("NEXT_REDIRECT") };

describe("setNewPassword", () => {
  it("sets the password and spends the link", async () => {
    const { user, token } = await resetToken();
    await expect(setNewPassword(form({ token, password: "correct horse", confirm: "correct horse" }))).rejects.toMatchObject(REDIRECTED);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await bcrypt.compare("correct horse", after.password!)).toBe(true);
    const row = await prisma.passwordResetToken.findUniqueOrThrow({ where: { token } });
    expect(row.usedAt).not.toBeNull();
  });

  it.each([
    ["a short password", { password: "abc", confirm: "abc" }, "at least 6"],
    ["a mismatched confirmation", { password: "correct horse", confirm: "correct hose" }, "don't match"],
    ["a password bcrypt would truncate", { password: "é".repeat(40), confirm: "é".repeat(40) }, "72 bytes"],
  ])("returns { error } for %s, and changes nothing", async (_label, fields, message) => {
    const { user, token } = await resetToken();
    const result = await setNewPassword(form({ token, ...fields }));
    expect(result).toEqual({ error: expect.stringContaining(message) });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.password).toBeNull();
    expect((await prisma.passwordResetToken.findUniqueOrThrow({ where: { token } })).usedAt).toBeNull();
  });

  it.each([
    ["an unknown token", async () => ({ token: randomUUID() })],
    ["an expired token", async () => resetToken({ expiresInMs: -1000 })],
    ["a used token", async () => resetToken({ used: true })],
  ])("returns the expired-link error for %s", async (_label, make) => {
    const { token } = await make();
    const result = await setNewPassword(form({ token, password: "correct horse", confirm: "correct horse" }));
    expect(result).toEqual({ error: expect.stringContaining("no longer valid") });
  });

  it.each([
    ["missing", {}],
    ["empty", { token: "" }],
    ["over-long", { token: "x".repeat(201) }],
  ])("returns the expired-link error when the token is %s", async (_label, tokenField) => {
    const result = await setNewPassword(form({ ...tokenField, password: "correct horse", confirm: "correct horse" }));
    expect(result).toEqual({ error: expect.stringContaining("no longer valid") });
  });

  it("lets only one of two simultaneous submissions of a link set the password", async () => {
    const { user, token } = await resetToken();
    const results = await Promise.allSettled([
      setNewPassword(form({ token, password: "first one!", confirm: "first one!" })),
      setNewPassword(form({ token, password: "second one", confirm: "second one" })),
    ]);
    const redirected = results.filter((r) => r.status === "rejected" && String(r.reason?.digest).includes("NEXT_REDIRECT"));
    const refused = results.filter((r) => r.status === "fulfilled" && (r.value as { error?: string })?.error);
    expect(redirected).toHaveLength(1);
    expect(refused).toHaveLength(1);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const first = await bcrypt.compare("first one!", after.password!);
    const second = await bcrypt.compare("second one", after.password!);
    expect(first !== second).toBe(true);
  });

  it.each([
    ["an unknown link", async () => randomUUID()],
    ["an expired link", async () => (await resetToken({ expiresInMs: -1000 })).token],
    ["a spent link", async () => (await resetToken({ used: true })).token],
  ])("refuses %s without hashing the password", async (_, makeToken) => {
    const token = await makeToken();
    const hash = vi.spyOn(bcrypt, "hash");
    try {
      const result = await setNewPassword(form({ token, password: "correct horse", confirm: "correct horse" }));
      expect(result).toMatchObject({ error: expect.stringContaining("no longer valid") });
      expect(hash).not.toHaveBeenCalled();
    } finally {
      hash.mockRestore();
    }
  });
});
