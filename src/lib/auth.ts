import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { redirect } from "next/navigation";

const useSecureCookies = process.env.NEXTAUTH_URL?.startsWith("https://");
// Same rule for the app's own cookies (the public form draft cookie).
export const SECURE_COOKIES = Boolean(useSecureCookies);

export const { handlers, signIn, signOut, auth } = NextAuth({
  // Explicit, so next-auth signs with the same secret as the MCP tokens.
  secret: authSecret(),
  trustHost: true,
  cookies: {
    sessionToken: {
      name: useSecureCookies ? "__Secure-authjs.session-token" : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.password) {
          return null;
        }

        const passwordMatch = await bcrypt.compare(
          credentials.password as string,
          user.password
        );

        if (!passwordMatch) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLoginPage = nextUrl.pathname === "/login";
      const isAuthRoute = nextUrl.pathname.startsWith("/api/auth");

      if (isAuthRoute) return true;
      if (isOnLoginPage) return true;
      if (nextUrl.pathname.startsWith("/share/")) return true;
      // Public forms (src/app/f/): every action and the upload route check the
      // link token themselves. The trailing slash matters — "/f" alone would
      // also open /files, /functions and /forgot-password.
      if (nextUrl.pathname.startsWith("/f/")) return true;
      if (nextUrl.pathname === "/forgot-password") return true;
      if (nextUrl.pathname.startsWith("/reset-password/")) return true;
      // /mcp does its own bearer-token auth via @/lib/mcpAuth.
      if (nextUrl.pathname === "/mcp" || nextUrl.pathname.startsWith("/mcp/")) return true;
      // Posted by the Cloudflare Email Worker; verifies its own HMAC signature.
      if (nextUrl.pathname === "/api/inbound-email") return true;
      // OAuth 2.1 endpoints backing the remote MCP connector are public by
      // design: register (anonymous DCR), authorize (own credential form),
      // token/revoke (PKCE / token-based). Discovery docs are public metadata,
      // served both at the spec /.well-known/* paths and their /api/well-known/*
      // rewrite targets.
      if (nextUrl.pathname.startsWith("/api/oauth/")) return true;
      if (nextUrl.pathname.startsWith("/api/well-known/")) return true;
      // Container healthcheck target (see docker-compose.yml). Must stay unauthenticated.
      if (nextUrl.pathname === "/api/health") return true;
      if (nextUrl.pathname.startsWith("/.well-known/")) return true;

      return isLoggedIn;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});

export async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  return session;
}

// HS256 signing key for the OAuth MCP access tokens (see @/lib/mcpOAuth).
// Reuses the secret next-auth v5 already requires for its own JWT sessions, so
// there's no second secret to provision. Like next-auth, accept the legacy
// NEXTAUTH_SECRET name too — docker-compose.yml and .env.example only set that
// one. Funnelled through this module because env access is restricted to
// lib/prisma, lib/auth, lib/uploads.
export function getOAuthSigningSecret(): Uint8Array {
  const secret = authSecret();
  if (!secret) throw new Error("AUTH_SECRET (or NEXTAUTH_SECRET) is not set");
  return new TextEncoder().encode(secret);
}

// The secret for sessions and MCP tokens. A blank or whitespace-only
// AUTH_SECRET is unset, as the startup check reads it (#275): before, " " was
// truthy here and became the signing key. A non-blank value is used as
// written, so existing sessions and tokens stay valid.
function authSecret(): string | undefined {
  const usable = (v: string | undefined) => (v && v.trim() ? v : undefined);
  return usable(process.env.AUTH_SECRET) ?? usable(process.env.NEXTAUTH_SECRET);
}
