export const dynamic = "force-dynamic";

// Container healthcheck. Cheap and unauthenticated; deliberately does not touch the DB.
export async function GET() {
  return Response.json({ ok: true });
}
