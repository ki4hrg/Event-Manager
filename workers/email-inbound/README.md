# Email inbound Worker

Receives mail for event inboxes (`<org>.<event>@eventmanage.net`) through
Cloudflare Email Routing and posts it to Event Manager's
`/api/inbound-email`. Design: `docs/proposals/email-ingest.md`.

## Setup

1. Generate a secret: `openssl rand -hex 32`.
2. On the Event Manager host, set `INBOUND_EMAIL_DOMAIN=eventmanage.net` and
   `INBOUND_EMAIL_SECRET=<secret>` (compose env), and redeploy.
3. From this directory (`workers/email-inbound/`), in a checkout of the repo on
   any machine with Node and a browser (not the app host):

   ```sh
   cd workers/email-inbound
   npx wrangler login                             # opens a browser to sign in to Cloudflare
   npx wrangler secret put APP_URL                # the app's public base URL, no trailing slash
   npx wrangler secret put INBOUND_EMAIL_SECRET   # same value as the app
   npx wrangler deploy
   ```

4. Cloudflare dashboard → eventmanage.net → Email → Email Routing: enable it
   (it adds the MX and SPF records), then Routing rules → **Catch-all address**
   → action *Send to a Worker* → `event-manager-email-inbound`.
5. In Event Manager, open an event's Settings → Inbox, give it an address, and
   send a test message to it. It appears under the event's Inbox (or Held, if
   the sender isn't a member of the organization).

## Behavior

- Unknown organization or malformed address: the app answers 404 and the
  Worker rejects the message, so the sender gets a bounce.
- Known organization, unknown event: stored in the organization's Unrouted
  queue (`/inbox`).
- Any other app error: the Worker throws, so the message is not accepted and
  the sending server sees a delivery failure instead of silent loss.
- Messages over Cloudflare's Email Routing size limit (25 MiB) never reach the
  Worker.
