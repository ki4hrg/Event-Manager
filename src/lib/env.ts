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

const schema = z
  .object({
    DATABASE_URL: z.url(),
    // next-auth v5 reads AUTH_SECRET first; the compose files provision
    // NEXTAUTH_SECRET, which it also accepts (getOAuthSigningSecret in lib/auth).
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
  })
  .superRefine((e, ctx) => {
    const secret = e.AUTH_SECRET ?? e.NEXTAUTH_SECRET;
    if (!secret) {
      ctx.addIssue({ code: "custom", path: ["NEXTAUTH_SECRET"], message: "Set NEXTAUTH_SECRET (or AUTH_SECRET)" });
    } else if (secret === PLACEHOLDER_SECRET) {
      ctx.addIssue({ code: "custom", path: ["NEXTAUTH_SECRET"], message: "Still the example value; generate one with `openssl rand -base64 32`" });
    } else if (secret.length < 32) {
      ctx.addIssue({ code: "custom", path: ["NEXTAUTH_SECRET"], message: "Must be at least 32 characters" });
    }
    if (!!e.INBOUND_EMAIL_DOMAIN !== !!e.INBOUND_EMAIL_SECRET) {
      ctx.addIssue({ code: "custom", path: ["INBOUND_EMAIL_SECRET"], message: "Set INBOUND_EMAIL_DOMAIN and INBOUND_EMAIL_SECRET together, or neither" });
    }
    if (!!e.MAILGUN_API_KEY !== !!e.MAILGUN_DOMAIN) {
      ctx.addIssue({ code: "custom", path: ["MAILGUN_DOMAIN"], message: "Set MAILGUN_API_KEY and MAILGUN_DOMAIN together, or neither" });
    }
  });

export type Env = z.infer<typeof schema>;

let parsed: Env | undefined;

export function env(): Env {
  if (parsed) return parsed;
  // Compose passes unset optional variables as empty strings; treat them as absent.
  const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  parsed = result.data;
  return parsed;
}
