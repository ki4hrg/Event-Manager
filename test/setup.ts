import { afterAll, inject, vi } from "vitest";

// Point the app's Prisma singleton (src/lib/prisma.ts) at the test database.
// Setup files run before each test file imports anything, so the client is
// created with this URL.
process.env.DATABASE_URL = inject("databaseUrl");

// Cores take the user id as an argument and never read the session. lib/auth
// pulls in next-auth's Next.js integration, which doesn't load outside Next;
// a test that needs a session mocks `auth` itself.
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => null),
  requireAuth: vi.fn(async () => {
    throw new Error("No session in tests: mock @/lib/auth in this test file");
  }),
}));

afterAll(async () => {
  const { prisma } = await import("@/lib/prisma");
  await prisma.$disconnect();
});
