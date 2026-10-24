import { prisma } from "@/lib/prisma";

// FileUpload.fileType stores a "file_type" CustomOption label (an option
// rename rewrites the files). An issued RFP's copy is filed under the option
// whose group is RFP_FILE_TYPE_GROUP, so a renamed option keeps receiving
// them; the seeded "RFP" option carries it (prisma/tenantDefaults.mjs).
export const RFP_FILE_TYPE_GROUP = "RFP";
const DEFAULT_RFP_FILE_TYPE = "RFP";

async function findRfpFileType(tenantId: string) {
  const options = await prisma.customOption.findMany({
    where: { tenantId, category: "file_type", OR: [{ group: RFP_FILE_TYPE_GROUP }, { label: DEFAULT_RFP_FILE_TYPE }] },
    orderBy: { sortOrder: "asc" },
    select: { label: true, group: true },
  });
  return (options.find((o) => o.group === RFP_FILE_TYPE_GROUP) ?? options[0])?.label ?? null;
}

// For readers telling issued copies apart from staff attachments. A tenant
// with no such option has filed none under another label.
export async function rfpFileTypeLabel(tenantId: string): Promise<string> {
  return (await findRfpFileType(tenantId)) ?? DEFAULT_RFP_FILE_TYPE;
}

// For the writer: a tenant without the option (seeded before it was a
// default, or an admin deleted it) gets it back, so the file still lands under
// a real option. Uses the global client — call outside a $transaction.
export async function resolveRfpFileType(tenantId: string): Promise<string> {
  const found = await findRfpFileType(tenantId);
  if (found) return found;
  const last = await prisma.customOption.findFirst({
    where: { tenantId, category: "file_type" },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const option = await prisma.customOption.upsert({
    where: { tenantId_category_label: { tenantId, category: "file_type", label: DEFAULT_RFP_FILE_TYPE } },
    create: { tenantId, category: "file_type", label: DEFAULT_RFP_FILE_TYPE, group: RFP_FILE_TYPE_GROUP, sortOrder: (last?.sortOrder ?? -1) + 1 },
    update: {},
    select: { label: true },
  });
  return option.label;
}
