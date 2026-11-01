import { Prisma } from "@prisma/client";
import { UserFacingError } from "@/lib/userErrors";

// A write that a unique constraint can refuse (a contact already linked to
// this order). P2002 becomes a refusal the person can act on, instead of the
// generic "Couldn't save" every retry would hit (#252).
export async function refuseDuplicate<T>(write: Promise<T>, message: string): Promise<T> {
  try {
    return await write;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new UserFacingError(message);
    throw e;
  }
}
