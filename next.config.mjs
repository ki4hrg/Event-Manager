/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
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
    ];
  },
};

export default nextConfig;
