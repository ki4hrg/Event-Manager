import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { PermissionError, requirePermissionForUser } from "@/lib/permissions";
import { MAX_UPLOAD_BYTES, uploadBodyRefusal } from "@/lib/uploads";
import { submitInboundItemCore, type SubmitAttachment } from "@/app/events/inbox/core";
import { isInboxUploadable } from "@/app/events/inbox/views";

// Files dropped on an event's inbox: one item (origin UPLOAD) read like
// delivered mail. A multipart upload, so a route handler rather than a Server
// Action (whose body limit is too small for a PDF). Handing mail in is inbox
// triage: EVENTS WRITE, as in submitInboundItemCore.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  // Outside the proxy (src/proxy.ts): auth and the cap on the whole body (all
  // files together) come before formData() buffers it. Refusals are JSON
  // statuses, not redirects: the drop zone's fetch would follow a redirect to
  // a 200 page and report the upload as done.
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Signed out. Sign in and try again." }, { status: 401 });
  try {
    await requirePermissionForUser(session.user.id, "EVENTS", "WRITE", eventId);
  } catch (err) {
    if (err instanceof PermissionError) {
      return err.kind === "NOT_FOUND"
        ? NextResponse.json({ error: "Not found" }, { status: 404 })
        : NextResponse.json({ error: "You can't add to this inbox" }, { status: 403 });
    }
    throw err;
  }
  const refusal = uploadBodyRefusal(request, MAX_UPLOAD_BYTES);
  if (refusal) {
    return NextResponse.json(
      { error: refusal === 411 ? "Content-Length required" : "The files together are larger than the upload limit" },
      { status: refusal },
    );
  }

  const formData = await request.formData();
  const files = formData.getAll("files").filter((f): f is File => typeof f !== "string" && f.size > 0);
  // The note is the item's text: read with the files, as an email body is.
  const note = (formData.get("note") as string | null)?.trim() || null;
  if (files.length === 0) return NextResponse.json({ error: "No files" }, { status: 400 });
  for (const f of files) {
    if (f.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: `${f.name} is larger than the upload limit` }, { status: 413 });
    if (!isInboxUploadable(f.name)) return NextResponse.json({ error: `${f.name}: file type not allowed` }, { status: 415 });
  }

  const attachments: SubmitAttachment[] = await Promise.all(
    files.map(async (f) => ({ fileName: f.name, mimeType: f.type || null, content: Buffer.from(await f.arrayBuffer()) })),
  );
  try {
    const row = await submitInboundItemCore(
      eventId,
      { subject: files.map((f) => f.name).join(", "), text: note, attachments },
      session.user.id,
      "UPLOAD",
    );
    return NextResponse.json({ id: row.id, files: files.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 400 });
  }
}
