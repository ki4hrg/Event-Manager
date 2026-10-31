export { auth as proxy } from "@/lib/auth";

// The proxy buffers every body it sees and cuts it off at 10MB (Next 16's
// default proxyClientMaxBodySize, deliberately not raised). The three upload
// routes skip it, so larger files arrive whole; each one authenticates (session,
// permission or form-link token) and caps its own body before reading it
// (uploadBodyTooLarge in src/lib/uploads.ts). No dotted-path exclusion:
// /.well-known/* must reach the authorized callback.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/upload$|f/[^/]+/upload$|api/events/[^/]+/inbox/upload$).*)",
  ],
};
