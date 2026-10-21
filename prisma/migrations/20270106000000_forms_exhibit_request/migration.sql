-- AlterEnum
ALTER TYPE "FormType" ADD VALUE 'EXHIBIT_REQUEST';

-- AlterTable
ALTER TABLE "FormLink" ADD COLUMN     "boothGroupId" TEXT;

-- CreateIndex
CREATE INDEX "FormLink_boothGroupId_idx" ON "FormLink"("boothGroupId");

-- AddForeignKey
ALTER TABLE "FormLink" ADD CONSTRAINT "FormLink_boothGroupId_fkey" FOREIGN KEY ("boothGroupId") REFERENCES "ExhibitBoothGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
