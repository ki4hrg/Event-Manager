import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { redirect } from "next/navigation";

const useSecureCookies = process.env.NEXTAUTH_URL?.startsWith("https://");

export const { handlers, signIn, signOut, auth } = NextAuth({
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
          roleId: user.roleId,
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
      if (nextUrl.pathname === "/forgot-password") return true;
      if (nextUrl.pathname.startsWith("/reset-password/")) return true;
      // /api/mcp does its own bearer-token auth via @/lib/mcpAuth.
      if (nextUrl.pathname.startsWith("/api/mcp")) return true;
      // OAuth 2.1 endpoints backing the remote MCP connector are public by
      // design: register (anonymous DCR), authorize (own credential form),
      // token/revoke (PKCE / token-based). Discovery docs are public metadata,
      // served both at the spec /.well-known/* paths and their /api/well-known/*
      // rewrite targets.
      if (nextUrl.pathname.startsWith("/api/oauth/")) return true;
      if (nextUrl.pathname.startsWith("/api/well-known/")) return true;
      if (nextUrl.pathname.startsWith("/.well-known/")) return true;

      return isLoggedIn;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.roleId = user.roleId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.roleId = (token.roleId as string | null) ?? null;
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
// Reuses AUTH_SECRET — the secret next-auth v5 already requires for its own JWT
// sessions — so there's no second secret to provision. Funnelled through this
// module because env access is restricted to lib/prisma, lib/auth, lib/uploads.
export function getOAuthSigningSecret(): Uint8Array {
  const raw = process.env.AUTH_SECRET;
  if (!raw) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(raw);
}
