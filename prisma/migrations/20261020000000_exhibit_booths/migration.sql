-- AlterTable
ALTER TABLE "EquipmentItem" ADD COLUMN     "exhibitBoothId" TEXT;

-- CreateTable
CREATE TABLE "ExhibitBooth" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "functionId" TEXT,
    "boothNumber" TEXT,
    "location" TEXT,
    "boothType" TEXT,
    "name" TEXT NOT NULL,
    "companyName" TEXT,
    "contactId" TEXT,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "setupBy" TIMESTAMP(3),
    "teardownBy" TIMESTAMP(3),
    "specialRequirements" TEXT,
    "setupNotes" TEXT,
    "avProvider" "ProvidedBy",
    "avNotes" TEXT,
    "fbNotes" TEXT,
    "decorNotes" TEXT,
    "securityNotes" TEXT,
    "signageNotes" TEXT,
    "shippingRequired" BOOLEAN,
    "customsRequired" BOOLEAN,
    "materialHandlingNotes" TEXT,
    "electricalProvider" "ProvidedBy",
    "electricalNotes" TEXT,
    "utilitiesNotes" TEXT,
    "taxExempt" BOOLEAN,
    "taxExemptId" TEXT,
    "costCenter" TEXT,
    "billingNotes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExhibitBooth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExhibitBooth_eventId_idx" ON "ExhibitBooth"("eventId");

-- CreateIndex
CREATE INDEX "ExhibitBooth_functionId_idx" ON "ExhibitBooth"("functionId");

-- CreateIndex
CREATE INDEX "ExhibitBooth_contactId_idx" ON "ExhibitBooth"("contactId");

-- CreateIndex
CREATE INDEX "ExhibitBooth_updatedById_idx" ON "ExhibitBooth"("updatedById");

-- CreateIndex
CREATE INDEX "EquipmentItem_exhibitBoothId_idx" ON "EquipmentItem"("exhibitBoothId");

-- AddForeignKey
ALTER TABLE "EquipmentItem" ADD CONSTRAINT "EquipmentItem_exhibitBoothId_fkey" FOREIGN KEY ("exhibitBoothId") REFERENCES "ExhibitBooth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExhibitBooth" ADD CONSTRAINT "ExhibitBooth_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExhibitBooth" ADD CONSTRAINT "ExhibitBooth_functionId_fkey" FOREIGN KEY ("functionId") REFERENCES "Function"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExhibitBooth" ADD CONSTRAINT "ExhibitBooth_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExhibitBooth" ADD CONSTRAINT "ExhibitBooth_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

