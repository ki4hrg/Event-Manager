import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      roleId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    roleId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    roleId?: string | null;
  }
}
