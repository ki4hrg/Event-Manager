import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { eventVenuesInclude } from "@/lib/eventVenues";

// No auth guard: the /share views reuse it, and callers gate access (the event
// layout, the share token). Deliberately outside the "use server" actions.ts,
// where every export is a callable endpoint, and from the public share routes,
// one that needs no session.
export const getEvent = cache(async (id: string) => {
  return prisma.event.findUnique({
    where: { id },
    include: {
      ...eventVenuesInclude,
      updatedBy: { select: { name: true, email: true } },
    },
  });
});
