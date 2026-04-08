"use server";

import { unlinkSync } from "fs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getUploadPath, getEntityTypeFromRecord, getEntityIdFromRecord } from "@/lib/uploads";

export async function deleteFile(fileId: string, revalidateTarget: string) {
  const record = await prisma.fileUpload.findUnique({
    where: { id: fileId },
  });

  if (!record) return;

  const filePath = getUploadPath(
    getEntityTypeFromRecord(record),
    getEntityIdFromRecord(record),
    record.storedName
  );

  try { unlinkSync(filePath); } catch {}

  await prisma.fileUpload.delete({ where: { id: fileId } });
  revalidatePath(revalidateTarget);
}
