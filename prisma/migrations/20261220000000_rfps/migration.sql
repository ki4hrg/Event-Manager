-- CreateEnum
CREATE TYPE "RfpKind" AS ENUM ('HOTEL');

-- CreateEnum
CREATE TYPE "RfpStatus" AS ENUM ('DRAFT', 'ISSUED', 'CLOSED');

-- AlterTable
ALTER TABLE "FileUpload" ADD COLUMN     "rfpId" TEXT;

-- AlterTable
ALTER TABLE "HotelProposal" ADD COLUMN     "rfpBlockId" TEXT,
ADD COLUMN     "rfpId" TEXT;

-- CreateTable
CREATE TABLE "Rfp" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "kind" "RfpKind" NOT NULL,
    "title" TEXT NOT NULL,
    "status" "RfpStatus" NOT NULL DEFAULT 'DRAFT',
    "responseDue" DATE,
    "decisionBy" DATE,
    "issuedOn" DATE,
    "sections" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "introduction" TEXT,
    "requirements" TEXT,
    "contactId" TEXT,
    "showRoomNames" BOOLEAN NOT NULL DEFAULT false,
    "excludedFunctionTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rfp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfpRecipient" (
    "id" TEXT NOT NULL,
    "rfpId" TEXT NOT NULL,
    "venueId" TEXT,
    "vendorId" TEXT,
    "sentOn" DATE,
    "declinedToBid" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RfpRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfpConcession" (
    "id" TEXT NOT NULL,
    "rfpId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RfpConcession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfpHotelBlock" (
    "id" TEXT NOT NULL,
    "rfpId" TEXT NOT NULL,
    "blockType" "HotelBlockType" NOT NULL,
    "isRunOfHouse" BOOLEAN NOT NULL DEFAULT false,
    "targetRate" DECIMAL(10,2),
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RfpHotelBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfpHotelBlockNight" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "roomType" TEXT,
    "night" DATE NOT NULL,
    "rooms" INTEGER NOT NULL,

    CONSTRAINT "RfpHotelBlockNight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FileUpload_rfpId_idx" ON "FileUpload"("rfpId");

-- CreateIndex
CREATE INDEX "HotelProposal_rfpId_idx" ON "HotelProposal"("rfpId");

-- CreateIndex
CREATE INDEX "HotelProposal_rfpBlockId_idx" ON "HotelProposal"("rfpBlockId");

-- CreateIndex
CREATE INDEX "Rfp_eventId_idx" ON "Rfp"("eventId");

-- CreateIndex
CREATE INDEX "Rfp_contactId_idx" ON "Rfp"("contactId");

-- CreateIndex
CREATE INDEX "Rfp_updatedById_idx" ON "Rfp"("updatedById");

-- CreateIndex
CREATE INDEX "RfpRecipient_venueId_idx" ON "RfpRecipient"("venueId");

-- CreateIndex
CREATE INDEX "RfpRecipient_vendorId_idx" ON "RfpRecipient"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "RfpRecipient_rfpId_venueId_key" ON "RfpRecipient"("rfpId", "venueId");

-- CreateIndex
CREATE UNIQUE INDEX "RfpRecipient_rfpId_vendorId_key" ON "RfpRecipient"("rfpId", "vendorId");

-- CreateIndex
CREATE INDEX "RfpConcession_rfpId_idx" ON "RfpConcession"("rfpId");

-- CreateIndex
CREATE INDEX "RfpHotelBlock_rfpId_idx" ON "RfpHotelBlock"("rfpId");

-- CreateIndex
CREATE INDEX "RfpHotelBlockNight_blockId_idx" ON "RfpHotelBlockNight"("blockId");

-- AddForeignKey
ALTER TABLE "FileUpload" ADD CONSTRAINT "FileUpload_rfpId_fkey" FOREIGN KEY ("rfpId") REFERENCES "Rfp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelProposal" ADD CONSTRAINT "HotelProposal_rfpId_fkey" FOREIGN KEY ("rfpId") REFERENCES "Rfp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelProposal" ADD CONSTRAINT "HotelProposal_rfpBlockId_fkey" FOREIGN KEY ("rfpBlockId") REFERENCES "RfpHotelBlock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfp" ADD CONSTRAINT "Rfp_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfp" ADD CONSTRAINT "Rfp_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfp" ADD CONSTRAINT "Rfp_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfpRecipient" ADD CONSTRAINT "RfpRecipient_rfpId_fkey" FOREIGN KEY ("rfpId") REFERENCES "Rfp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfpRecipient" ADD CONSTRAINT "RfpRecipient_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfpRecipient" ADD CONSTRAINT "RfpRecipient_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfpConcession" ADD CONSTRAINT "RfpConcession_rfpId_fkey" FOREIGN KEY ("rfpId") REFERENCES "Rfp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfpHotelBlock" ADD CONSTRAINT "RfpHotelBlock_rfpId_fkey" FOREIGN KEY ("rfpId") REFERENCES "Rfp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfpHotelBlockNight" ADD CONSTRAINT "RfpHotelBlockNight_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "RfpHotelBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
