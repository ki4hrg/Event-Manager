-- AlterEnum
ALTER TYPE "FormType" ADD VALUE 'PRESENTATION_DELIVERABLES';

-- AlterTable
ALTER TABLE "FormLink" ADD COLUMN     "presentationId" TEXT;

-- CreateIndex
CREATE INDEX "FormLink_presentationId_idx" ON "FormLink"("presentationId");

-- AddForeignKey
ALTER TABLE "FormLink" ADD CONSTRAINT "FormLink_presentationId_fkey" FOREIGN KEY ("presentationId") REFERENCES "Presentation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
