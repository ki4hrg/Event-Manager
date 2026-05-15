import path from "path";
import { randomUUID } from "crypto";
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from "fs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import {
  VALID_ENTITY_TYPES,
  EntityType,
  ENTITY_FK_FIELD,
  getUploadDir,
  getUploadPath,
  MAX_UPLOAD_BYTES,
  ALLOWED_UPLOAD_MIME_TYPES,
  isValidEntityId,
} from "@/lib/uploads";

export async function POST(request: NextRequest) {
  await requireAuth();

  let filePath: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const entityType = formData.get("entityType") as string | null;
    const entityId = formData.get("entityId") as string | null;
    const fileType = formData.get("fileType") as string | null;

    if (!file || file.size === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File exceeds maximum size of ${MAX_UPLOAD_BYTES} bytes` },
        { status: 413 }
      );
    }
    if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.type)) {
      return NextResponse.json({ error: "File type not allowed" }, { status: 415 });
    }
    if (!entityType || !VALID_ENTITY_TYPES.includes(entityType as EntityType)) {
      return NextResponse.json({ error: "Invalid entity type" }, { status: 400 });
    }
    if (!entityId || !isValidEntityId(entityId)) {
      return NextResponse.json({ error: "Invalid entity ID" }, { status: 400 });
    }

    const validEntityType = entityType as EntityType;
    const ext = path.extname(file.name);
    const storedName = `${randomUUID()}${ext}`;
    const uploadDir = getUploadDir(validEntityType, entityId);
    filePath = getUploadPath(validEntityType, entityId, storedName);

    mkdirSync(uploadDir, { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(filePath, buffer);

    const record = await prisma.fileUpload.create({
      data: {
        fileName: file.name,
        storedName,
        mimeType: file.type,
        fileSize: file.size,
        fileType: fileType || null,
        [ENTITY_FK_FIELD[validEntityType]]: entityId,
      },
    });

    return NextResponse.json({
      id: record.id,
      fileName: record.fileName,
      fileSize: record.fileSize,
      mimeType: record.mimeType,
    });
  } catch {
    if (filePath && existsSync(filePath)) {
      try { unlinkSync(filePath); } catch {}
    }
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
