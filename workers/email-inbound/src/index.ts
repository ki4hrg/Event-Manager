// Cloudflare Email Worker: hands each message for an event inbox to Event
// Manager's /api/inbound-email, signed with the shared secret. The app decides
// whether the address exists; a 404 bounces the message at SMTP time.
//
// Signature: hex HMAC-SHA256 over `${timestamp}.${raw message}`, checked by
// verifyInboundSignature in src/lib/inboundMail.ts.

// The slice of the Workers email API this uses (no @cloudflare/workers-types).
interface EmailMessage {
  readonly from: string;
  readonly to: string;
  readonly raw: ReadableStream<Uint8Array>;
  readonly rawSize: number;
  setReject(reason: string): void;
}

interface Env {
  APP_URL: string;
  INBOUND_EMAIL_SECRET: string;
}

const encoder = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sign(secret: string, timestamp: string, body: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prefix = encoder.encode(`${timestamp}.`);
  const data = new Uint8Array(prefix.length + body.length);
  data.set(prefix);
  data.set(body, prefix.length);
  return toHex(await crypto.subtle.sign("HMAC", key, data));
}

export default {
  async email(message: EmailMessage, env: Env): Promise<void> {
    const body = new Uint8Array(await new Response(message.raw).arrayBuffer());
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const res = await fetch(`${env.APP_URL.replace(/\/$/, "")}/api/inbound-email`, {
      method: "POST",
      headers: {
        "Content-Type": "message/rfc822",
        "X-Envelope-To": message.to,
        "X-Envelope-From": message.from,
        "X-Timestamp": timestamp,
        "X-Signature": await sign(env.INBOUND_EMAIL_SECRET, timestamp, body),
      },
      body,
    });
    if (res.status === 404) {
      message.setReject("No such event inbox");
      return;
    }
    // Anything else unexpected (app down, bad secret, not configured): fail the
    // delivery rather than drop the mail.
    if (!res.ok) throw new Error(`Event Manager answered ${res.status}`);
  },
};
