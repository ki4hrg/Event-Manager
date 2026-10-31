import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { MAX_UPLOAD_BYTES, uploadBodyTooLarge } from "@/lib/uploads";
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
  const session = await requirePermission("EVENTS", "WRITE", eventId);
  // Outside the proxy (src/proxy.ts): cap the whole body, all files together,
  // before formData() buffers it.
  if (uploadBodyTooLarge(request, MAX_UPLOAD_BYTES)) {
    return NextResponse.json({ error: "The files together are larger than the upload limit" }, { status: 413 });
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
