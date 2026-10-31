import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

// Container healthcheck. Cheap and unauthenticated; deliberately does not touch the DB.
// `revision` is the commit the image was built from (GIT_REVISION build arg), so a
// deploy can be checked against what's actually serving.
export async function GET() {
  return Response.json({ ok: true, revision: env().GIT_REVISION });
}
