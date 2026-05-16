"use server";

import { unlinkSync } from "fs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { getUploadPath, getEntityTypeFromRecord, getEntityIdFromRecord, resolveFileEventId } from "@/lib/uploads";

export async function deleteFile(fileId: string, revalidateTarget: string) {
  const record = await prisma.fileUpload.findUnique({
    where: { id: fileId },
  });

  if (!record) return;

  // Venue-attached files have no event; resolveFileEventId returns null
  // and requirePermission falls through to GLOBAL scope.
  await requirePermission("FILES", "DELETE", await resolveFileEventId(record));

  const filePath = getUploadPath(
    getEntityTypeFromRecord(record),
    getEntityIdFromRecord(record),
    record.storedName
  );

  try { unlinkSync(filePath); } catch {}

  await prisma.fileUpload.delete({ where: { id: fileId } });
  revalidatePath(revalidateTarget);
}
