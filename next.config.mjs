/** @type {import('next').NextConfig} */
const nextConfig = {
  // No `output: "standalone"`: the image runs `next start` from the full build
  // because its CMD also needs the Prisma CLI for baseline + migrate + seed.
  // Server-only document renderers for the ESG / PER downloads (exceljs uses
  // optional requires webpack shouldn't try to bundle).
  experimental: {
    serverComponentsExternalPackages: ["exceljs", "docx"],
  },
  // OAuth discovery documents must be served from the spec /.well-known/ paths,
  // but Next's App Router can't host a route segment whose folder starts with a
  // dot — so the handlers live under /api/well-known/* and we rewrite the spec
  // paths onto them. claude.ai fetches these to discover the auth server.
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
