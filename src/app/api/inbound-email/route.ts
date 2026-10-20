import { NextRequest, NextResponse } from "next/server";
import { getInboundEmailDomain, getInboundEmailSecret } from "@/lib/email";
import { verifyInboundSignature } from "@/lib/inboundMail";
import { ingestInboundEmail, purgeDismissedInboundEmails } from "@/app/events/inbox/core";

// Mail for event inboxes, posted by the Cloudflare Email Worker
// (workers/email-inbound/). Public in the `authorized` callback; the HMAC
// signature is the auth. 404 tells the Worker to bounce the message; any other
// failure is a 5xx, which makes the Worker throw so the sending server retries.
export async function POST(request: NextRequest) {
  const secret = getInboundEmailSecret();
  const domain = getInboundEmailDomain();
  if (!secret || !domain) return NextResponse.json({ error: "Inbound email is not configured" }, { status: 503 });

  const body = Buffer.from(await request.arrayBuffer());
  const ok = verifyInboundSignature(
    secret,
    request.headers.get("x-timestamp"),
    request.headers.get("x-signature"),
    body,
  );
  if (!ok) return NextResponse.json({ error: "Bad signature" }, { status: 401 });

  const to = request.headers.get("x-envelope-to");
  if (!to) return NextResponse.json({ error: "Missing X-Envelope-To" }, { status: 400 });

  const result = await ingestInboundEmail(body, { to, from: request.headers.get("x-envelope-from") }, domain);
  if (result.outcome === "rejected") return NextResponse.json({ error: "No such inbox" }, { status: 404 });

  // Housekeeping rides on deliveries; never fail one over it.
  await purgeDismissedInboundEmails().catch(() => {});

  return NextResponse.json(result);
}
