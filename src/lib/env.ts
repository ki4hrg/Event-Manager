import { z } from "zod";

// The environment, checked once at server start (src/instrumentation.ts) so a
// missing or malformed variable stops the boot with a readable message instead
// of failing on first use. `next build` never runs it: the image is built with
// no secrets.
//
// The modules that read env today (lib/auth, lib/email, lib/uploads, lib/prisma)
// keep reading process.env directly: lib/auth reads NEXTAUTH_URL at import
// time, which the build does. This file is the single list of what the app
// expects; add a variable here when you add a reader.

// The value compose files and .env.example shipped before the guards; a
// deployment still using it has forgeable sessions.
const PLACEHOLDER_SECRET = "change-this-to-a-secure-random-string";

const optionalNonEmpty = z.string().min(1).optional();

const schema = z.object({
  DATABASE_URL: z.url(),
  // next-auth v5 reads AUTH_SECRET first; the compose files provision
  // NEXTAUTH_SECRET, which it also accepts (getOAuthSigningSecret in lib/auth).
  // Checked as a pair in crossFieldProblems.
  NEXTAUTH_SECRET: z.string().optional(),
  AUTH_SECRET: z.string().optional(),
  NEXTAUTH_URL: z.url(),
  GIT_REVISION: z.string().default("dev"),
  UPLOAD_DIR: optionalNonEmpty,
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().optional(),
  MAILGUN_API_KEY: optionalNonEmpty,
  MAILGUN_DOMAIN: optionalNonEmpty,
  MAILGUN_FROM: optionalNonEmpty,
  MAILGUN_BASE_URL: z.url().optional(),
  INBOUND_EMAIL_DOMAIN: optionalNonEmpty,
  INBOUND_EMAIL_SECRET: optionalNonEmpty,
  ANTHROPIC_API_KEY: optionalNonEmpty,
});

// Checks across fields. Run on the raw values, not as a zod refinement: a
// refinement is skipped when any field fails, which would surface these one
// deploy at a time.
function crossFieldProblems(e: Record<string, string | undefined>): string[] {
  const problems: string[] = [];
  const secret = e.AUTH_SECRET ?? e.NEXTAUTH_SECRET;
  if (!secret) problems.push("NEXTAUTH_SECRET: set it (or AUTH_SECRET)");
  else if (secret === PLACEHOLDER_SECRET) problems.push("NEXTAUTH_SECRET: still the example value; generate one with `openssl rand -base64 32`");
  else if (secret.length < 32) problems.push("NEXTAUTH_SECRET: must be at least 32 characters");
  if (!!e.INBOUND_EMAIL_DOMAIN !== !!e.INBOUND_EMAIL_SECRET) {
    problems.push("INBOUND_EMAIL_DOMAIN and INBOUND_EMAIL_SECRET: set both, or neither");
  }
  if (!!e.MAILGUN_API_KEY !== !!e.MAILGUN_DOMAIN) {
    problems.push("MAILGUN_API_KEY and MAILGUN_DOMAIN: set both, or neither");
  }
  return problems;
}

// Variables the app reads straight from process.env (lib/auth, lib/prisma,
// lib/uploads), not through this module: a value this check would clean up
// (quotes, padding) is used as written there and breaks, so refuse it here
// rather than pass a value the app then reads differently (#275).
const READ_RAW = ["NEXTAUTH_URL", "DATABASE_URL", "UPLOAD_DIR"] as const;

export function rawReadProblems(source: Record<string, string | undefined>): string[] {
  return READ_RAW.flatMap((key) => {
    const value = source[key];
    if (value === undefined || value === "") return [];
    return normalize(value) === value ? [] : [`${key}: remove the surrounding quotes or spaces (the app reads it as written)`];
  });
}

// The same clean-up lib/email's readEnv applies: trim, and drop one pair of
// surrounding quotes (an env file or panel that keeps them). Blank is absent.
function normalize(raw: string): string | undefined {
  let value = raw.trim();
  if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value[value.length - 1] === value[0]) {
    value = value.slice(1, -1).trim();
  }
  return value === "" ? undefined : value;
}

export type Env = z.infer<typeof schema>;

let parsed: Env | undefined;

export function env(): Env {
  if (parsed) return parsed;
  // Compose passes unset optional variables as empty strings; those are absent.
  const raw: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) {
    const v = value === undefined ? undefined : normalize(value);
    if (v !== undefined) raw[key] = v;
  }
  const result = schema.safeParse(raw);
  const problems = [
    ...(result.success ? [] : [z.prettifyError(result.error)]),
    ...crossFieldProblems(raw).map((p) => `✖ ${p}`),
    ...rawReadProblems(process.env).map((p) => `✖ ${p}`),
  ];
  if (problems.length > 0 || !result.success) {
    throw new Error(`Invalid environment:\n${problems.join("\n")}`);
  }
  parsed = result.data;
  return parsed;
}
