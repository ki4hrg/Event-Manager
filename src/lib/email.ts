import crypto from "crypto";
import { prisma } from "@/lib/prisma";

function readEnv(key: string, fallback = ""): string {
  const raw = process.env[key];
  if (raw == null) return fallback;
  let value = raw.trim();
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      value = value.slice(1, -1).trim();
    }
  }
  return value || fallback;
}

const MAILGUN_API_KEY = readEnv("MAILGUN_API_KEY");
const MAILGUN_DOMAIN = readEnv("MAILGUN_DOMAIN");
const MAILGUN_FROM = readEnv("MAILGUN_FROM");
const MAILGUN_BASE_URL = readEnv("MAILGUN_BASE_URL", "https://api.mailgun.net");
const APP_BASE_URL = readEnv("NEXTAUTH_URL", "http://localhost:3000");

export const INVITE_TOKEN_EXPIRY_HOURS = 168; // 7 days
export const RESET_TOKEN_EXPIRY_HOURS = 1;

function appUrl(path: string): string {
  const base = APP_BASE_URL.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function isEmailConfigured(): boolean {
  return Boolean(MAILGUN_API_KEY && MAILGUN_DOMAIN && MAILGUN_FROM);
}

export function getEmailConfigStatus() {
  return {
    apiKeySet: Boolean(MAILGUN_API_KEY),
    domain: MAILGUN_DOMAIN || null,
    from: MAILGUN_FROM || null,
    baseUrl: MAILGUN_BASE_URL,
    appBaseUrl: APP_BASE_URL,
  };
}

export async function sendTestEmail(to: string): Promise<void> {
  const subject = "Event Manager — test email";
  const text = [
    "This is a test message from Event Manager.",
    "",
    "If you received this, the Mailgun integration is configured correctly.",
    `Sent: ${new Date().toISOString()}`,
  ].join("\n");
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#111;line-height:1.5">
    <p>This is a test message from <strong>Event Manager</strong>.</p>
    <p>If you received this, the Mailgun integration is configured correctly.</p>
    <p style="color:#666;font-size:0.9em">Sent: ${escapeHtml(new Date().toISOString())}</p>
  </body></html>`;
  await sendEmail({ to, subject, text, html });
}

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export async function sendEmail({ to, subject, text, html }: SendEmailInput): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error("Mailgun is not configured (MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_FROM)");
  }

  const body = new FormData();
  body.append("from", MAILGUN_FROM);
  body.append("to", to);
  body.append("subject", subject);
  body.append("text", text);
  body.append("html", html);

  const auth = Buffer.from(`api:${MAILGUN_API_KEY}`).toString("base64");
  const url = `${MAILGUN_BASE_URL.replace(/\/$/, "")}/v3/${MAILGUN_DOMAIN}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}` },
    body,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Mailgun send failed (${response.status}): ${detail.slice(0, 500)}`);
  }
}

export async function generatePasswordResetToken(
  userId: string,
  { expiresInHours }: { expiresInHours: number }
): Promise<{ token: string; url: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

  // Burn any prior unused tokens for this user so the freshest link is the only valid one.
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: { token, userId, expiresAt },
    }),
  ]);

  return { token, url: appUrl(`/reset-password/${token}`), expiresAt };
}

export async function consumePasswordResetToken(
  token: string
): Promise<{ id: string; userId: string } | null> {
  const row = await prisma.passwordResetToken.findUnique({
    where: { token },
    select: { id: true, userId: true, usedAt: true, expiresAt: true },
  });
  if (!row) return null;
  if (row.usedAt) return null;
  if (row.expiresAt < new Date()) return null;
  return { id: row.id, userId: row.userId };
}

type InviteRecipient = {
  id: string;
  email: string;
  name: string | null;
  // Says what kind of account this is. "An account has been created for you"
  // alone gives an outside collaborator nothing to act on. Not listing their
  // events: a user has no assignments at the moment they're invited.
  roleName?: string | null;
};

export async function sendInviteEmail(user: InviteRecipient): Promise<void> {
  const { url } = await generatePasswordResetToken(user.id, {
    expiresInHours: INVITE_TOKEN_EXPIRY_HOURS,
  });
  const loginUrl = appUrl("/login");
  const greeting = user.name ? `Hi ${user.name},` : "Hi,";

  const roleLine = user.roleName ? `Your access level: ${user.roleName}` : null;

  const text = [
    greeting,
    "",
    "An account has been created for you in Event Manager.",
    "",
    `Your username: ${user.email}`,
    ...(roleLine ? [roleLine] : []),
    `Set your password: ${url}`,
    `Sign-in page: ${loginUrl}`,
    "",
    `This setup link expires in ${INVITE_TOKEN_EXPIRY_HOURS / 24} days. If you weren't expecting this, you can ignore the email.`,
  ].join("\n");

  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#111;line-height:1.5">
    <p>${escapeHtml(greeting)}</p>
    <p>An account has been created for you in Event Manager.</p>
    <p><strong>Your username:</strong> ${escapeHtml(user.email)}</p>
    ${roleLine ? `<p>${escapeHtml(roleLine)}</p>` : ""}
    <p><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none">Set your password</a></p>
    <p>Or paste this link into your browser:<br><span style="word-break:break-all;color:#555">${escapeHtml(url)}</span></p>
    <p>Once your password is set, sign in here: <a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a></p>
    <p style="color:#666;font-size:0.9em">This setup link expires in ${INVITE_TOKEN_EXPIRY_HOURS / 24} days. If you weren't expecting this email, you can safely ignore it.</p>
  </body></html>`;

  await sendEmail({
    to: user.email,
    subject: "Set up your Event Manager account",
    text,
    html,
  });
}

export async function sendPasswordResetEmail(user: InviteRecipient): Promise<void> {
  const { url } = await generatePasswordResetToken(user.id, {
    expiresInHours: RESET_TOKEN_EXPIRY_HOURS,
  });

  const text = [
    user.name ? `Hi ${user.name},` : "Hi,",
    "",
    `Someone requested a password reset for ${user.email} on Event Manager.`,
    "",
    `Choose a new password: ${url}`,
    "",
    `This link expires in ${RESET_TOKEN_EXPIRY_HOURS} hour. If you didn't request this, you can ignore the email — your existing password is unchanged.`,
  ].join("\n");

  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#111;line-height:1.5">
    <p>${escapeHtml(user.name ? `Hi ${user.name},` : "Hi,")}</p>
    <p>Someone requested a password reset for <strong>${escapeHtml(user.email)}</strong> on Event Manager.</p>
    <p><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none">Choose a new password</a></p>
    <p>Or paste this link into your browser:<br><span style="word-break:break-all;color:#555">${escapeHtml(url)}</span></p>
    <p style="color:#666;font-size:0.9em">This link expires in ${RESET_TOKEN_EXPIRY_HOURS} hour. If you didn't request this, you can ignore the email — your existing password is unchanged.</p>
  </body></html>`;

  await sendEmail({
    to: user.email,
    subject: "Reset your Event Manager password",
    text,
    html,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
