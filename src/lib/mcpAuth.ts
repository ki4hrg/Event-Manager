import { createHash, randomBytes } from "crypto";
import { prisma } from "./prisma";

// API keys are random 32-byte tokens (base64url-encoded). High-entropy means a
// single indexed SHA-256 lookup at verification time is sufficient; bcrypt would
// be the wrong tool — slow per-row compare with no benefit at this entropy.
export function generateApiKey(): { fullKey: string; keyPrefix: string; hashedKey: string } {
  const fullKey = randomBytes(32).toString("base64url");
  const keyPrefix = fullKey.slice(0, 8);
  const hashedKey = hashApiKey(fullKey);
  return { fullKey, keyPrefix, hashedKey };
}

export function hashApiKey(fullKey: string): string {
  return createHash("sha256").update(fullKey).digest("hex");
}

// Resolves a bearer token to the owning userId. Returns null on any failure —
// bad header, unknown key, revoked key. Side effect: stamps lastUsedAt on the
// resolved key. Callers map null → 401 in the MCP error envelope.
export async function resolveBearerToUserId(authorizationHeader: string | null): Promise<string | null> {
  if (!authorizationHeader) return null;
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const fullKey = match[1].trim();
  if (!fullKey) return null;

  const hashedKey = hashApiKey(fullKey);
  const apiKey = await prisma.apiKey.findUnique({
    where: { hashedKey },
    select: { id: true, userId: true, revokedAt: true },
  });
  if (!apiKey || apiKey.revokedAt) return null;

  // Fire-and-forget — don't block the request on the audit write.
  prisma.apiKey
    .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return apiKey.userId;
}
