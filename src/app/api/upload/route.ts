import path from "path";
import { randomUUID } from "crypto";
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from "fs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { VALID_ENTITY_TYPES, EntityType, ENTITY_FK_FIELD, getUploadDir, getUploadPath } from "@/lib/uploads";

export async function POST(request: NextRequest) {
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
    if (!entityType || !VALID_ENTITY_TYPES.includes(entityType as EntityType)) {
      return NextResponse.json({ error: "Invalid entity type" }, { status: 400 });
    }
    if (!entityId) {
      return NextResponse.json({ error: "Entity ID required" }, { status: 400 });
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
        mimeType: file.type || "application/octet-stream",
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
  } catch (error) {
    if (filePath && existsSync(filePath)) {
      try { unlinkSync(filePath); } catch {}
    }
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
