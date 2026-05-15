import { readFileSync } from "fs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { getUploadPath, getEntityTypeFromRecord, getEntityIdFromRecord } from "@/lib/uploads";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  await requireAuth();
  const { fileId } = await params;

  const record = await prisma.fileUpload.findUnique({
    where: { id: fileId },
  });

  if (!record) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const entityType = getEntityTypeFromRecord(record);
  const entityId = getEntityIdFromRecord(record);
  const filePath = getUploadPath(entityType, entityId, record.storedName);

  let buffer: Buffer;
  try {
    buffer = readFileSync(filePath);
  } catch {
    return NextResponse.json({ error: "File not found on disk" }, { status: 404 });
  }

  const encodedName = encodeURIComponent(record.fileName);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": record.mimeType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodedName}`,
      "Content-Length": String(buffer.length),
    },
  });
}
