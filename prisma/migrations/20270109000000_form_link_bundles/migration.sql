-- AlterTable
ALTER TABLE "FormLink" ADD COLUMN     "bundle" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "parentId" TEXT;

-- CreateIndex
CREATE INDEX "FormLink_parentId_idx" ON "FormLink"("parentId");

-- AddForeignKey
ALTER TABLE "FormLink" ADD CONSTRAINT "FormLink_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "FormLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
