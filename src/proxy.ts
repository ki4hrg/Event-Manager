export { auth as proxy } from "@/lib/auth";

// The proxy buffers every body it sees and cuts it off at 10MB (Next 16's
// default proxyClientMaxBodySize, deliberately not raised). The three upload
// routes and the inbound-email webhook skip it, so large bodies arrive whole;
// each caps its own body before reading it (uploadBodyRefusal in
// src/lib/uploads.ts), and the uploads authenticate first (session,
// permission or form-link token). The webhook's HMAC covers the body, so it
// verifies after reading. No dotted-path exclusion:
// /.well-known/* must reach the authorized callback.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/upload$|f/[^/]+/upload$|api/events/[^/]+/inbox/upload$|api/inbound-email$).*)",
  ],
};
