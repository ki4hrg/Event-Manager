import path from "path";
import { randomUUID } from "crypto";
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from "fs";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requirePermission } from "@/lib/permissions";
import {
  uploadBodyRefusal,
  VALID_ENTITY_TYPES,
  EntityType,
  ENTITY_FK_FIELD,
  getUploadDir,
  getUploadPath,
  MAX_UPLOAD_BYTES,
  ALLOWED_UPLOAD_MIME_TYPES,
  isValidEntityId,
  resolveEntityEventId,
  eventlessOwnerTenantId,
} from "@/lib/uploads";

export async function POST(request: NextRequest) {
  let filePath: string | null = null;

  // Outside the proxy (src/proxy.ts): sign-in and the size cap come before
  // formData() buffers the body. The FILES permission needs the entity from
  // the body, so it is checked below.
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const refusal = uploadBodyRefusal(request, MAX_UPLOAD_BYTES);
  if (refusal) {
    return NextResponse.json(
      { error: refusal === 411 ? "Content-Length required" : `File exceeds maximum size of ${MAX_UPLOAD_BYTES} bytes` },
      { status: refusal }
    );
  }

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
    const { tenantId } = await requirePermission("FILES", "WRITE", await resolveEntityEventId(validEntityType, entityId));
    // A venue has no event: the check above ran against the active tenant,
    // so the venue must be that tenant's own.
    const ownerTenantId = await eventlessOwnerTenantId(validEntityType, entityId);
    if (ownerTenantId && ownerTenantId !== tenantId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
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
