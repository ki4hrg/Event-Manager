import { NextRequest, NextResponse } from "next/server";
import { getRfpDocument } from "@/app/events/rfps/actions";

// .docx download of an RFP document — a binary stream, so a route handler
// rather than a Server Action. getRfpDocument checks the kind's permission
// (VIEW on the event) before reading anything.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; rfpId: string }> }) {
  const { id: eventId, rfpId } = await params;
  if (request.nextUrl.searchParams.get("format") !== "docx") return NextResponse.json({ error: "format must be docx" }, { status: 400 });

  const doc = await getRfpDocument(rfpId, eventId);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { renderRfpDocx, rfpFileName } = await import("@/lib/rfp/renderDocx");
  const buffer = await renderRfpDocx(doc);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": DOCX,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(rfpFileName(doc))}`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, no-store",
    },
  });
}
