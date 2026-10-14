-- AlterTable
ALTER TABLE "EquipmentItem" ADD COLUMN     "exhibitBoothGroupId" TEXT;

-- AlterTable
ALTER TABLE "ExhibitBooth" ADD COLUMN     "groupId" TEXT;

-- CreateTable
CREATE TABLE "ExhibitBoothGroup" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "functionId" TEXT,
    "location" TEXT,
    "boothType" TEXT,
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

    CONSTRAINT "ExhibitBoothGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExhibitBoothGroup_eventId_idx" ON "ExhibitBoothGroup"("eventId");

-- CreateIndex
CREATE INDEX "ExhibitBoothGroup_functionId_idx" ON "ExhibitBoothGroup"("functionId");

-- CreateIndex
CREATE INDEX "ExhibitBoothGroup_updatedById_idx" ON "ExhibitBoothGroup"("updatedById");

-- CreateIndex
CREATE INDEX "EquipmentItem_exhibitBoothGroupId_idx" ON "EquipmentItem"("exhibitBoothGroupId");

-- CreateIndex
CREATE INDEX "ExhibitBooth_groupId_idx" ON "ExhibitBooth"("groupId");

-- AddForeignKey
ALTER TABLE "EquipmentItem" ADD CONSTRAINT "EquipmentItem_exhibitBoothGroupId_fkey" FOREIGN KEY ("exhibitBoothGroupId") REFERENCES "ExhibitBoothGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExhibitBoothGroup" ADD CONSTRAINT "ExhibitBoothGroup_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExhibitBoothGroup" ADD CONSTRAINT "ExhibitBoothGroup_functionId_fkey" FOREIGN KEY ("functionId") REFERENCES "Function"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExhibitBoothGroup" ADD CONSTRAINT "ExhibitBoothGroup_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExhibitBooth" ADD CONSTRAINT "ExhibitBooth_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ExhibitBoothGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Tag the default function types with their ESG function-space line.
UPDATE "CustomOption" SET "group" = 'REGISTRATION' WHERE "category" = 'function_type' AND "label" = 'Registration' AND "group" IS NULL;
UPDATE "CustomOption" SET "group" = 'SPEAKER_READY' WHERE "category" = 'function_type' AND "label" = 'Speaker Room' AND "group" IS NULL;
UPDATE "CustomOption" SET "group" = 'OFFICE' WHERE "category" = 'function_type' AND "label" = 'Office' AND "group" IS NULL;
UPDATE "CustomOption" SET "group" = 'STORAGE' WHERE "category" = 'function_type' AND "label" = 'Storage' AND "group" IS NULL;
