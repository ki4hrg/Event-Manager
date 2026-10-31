/** @type {import('next').NextConfig} */
const nextConfig = {
  // No `output: "standalone"`: the image runs `next start` from the full build
  // because its CMD also needs the Prisma CLI for baseline + migrate + seed.
  // Server-only document renderers for the ESG / PER downloads (exceljs uses
  // optional requires the bundler shouldn't try to bundle).
  serverExternalPackages: ["exceljs", "docx"],
  // No `experimental.proxyClientMaxBodySize`: it applies to every route the
  // proxy matches, signed in or not. Requests through the proxy keep Next's
  // 10MB default; the upload routes skip the proxy instead (src/proxy.ts).
  // OAuth discovery documents must be served from the spec /.well-known/ paths,
  // but Next's App Router can't host a route segment whose folder starts with a
  // dot — so the handlers live under /api/well-known/* and we rewrite the spec
  // paths onto them. claude.ai fetches these to discover the auth server.
  // Public form links carry their token in the path: keep it out of Referer
  // headers and search indexes. (Caching needs no header: the pages are
  // force-dynamic, which Next already serves as private, no-store.)
  async headers() {
    return [
      {
        source: "/f/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/api/well-known/oauth-authorization-server",
      },
      {
        source: "/.well-known/oauth-protected-resource",
        destination: "/api/well-known/oauth-protected-resource",
      },
      // RFC 9728 path-suffixed form for the protected resource at /mcp; clients
      // try this first, then fall back to the root form above.
      {
        source: "/.well-known/oauth-protected-resource/mcp",
        destination: "/api/well-known/oauth-protected-resource",
      },
    ];
  },
};

export default nextConfig;
