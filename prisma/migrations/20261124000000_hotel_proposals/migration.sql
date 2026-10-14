-- CreateEnum
CREATE TYPE "HotelBlockType" AS ENUM ('STAFF', 'COURTESY', 'CONTRACT');

-- CreateEnum
CREATE TYPE "HotelChargeScope" AS ENUM ('PER_NIGHT', 'PER_STAY', 'PER_PERSON', 'PER_PERSON_PER_NIGHT');

-- AlterEnum
ALTER TYPE "PermissionResource" ADD VALUE 'HOTELS';

-- AlterTable
ALTER TABLE "FileUpload" ADD COLUMN     "hotelProposalId" TEXT;

-- AlterTable
ALTER TABLE "Venue" ADD COLUMN     "area" TEXT,
ADD COLUMN     "brand" TEXT,
ADD COLUMN     "isLodging" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "HotelProposal" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "leadSource" TEXT,
    "blockType" "HotelBlockType",
    "submittedOn" DATE,
    "checkIn" DATE,
    "checkOut" DATE,
    "declinedReason" TEXT,
    "notes" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "isRunOfHouse" BOOLEAN NOT NULL DEFAULT false,
    "allowedAttrition" DECIMAL(5,2),
    "guaranteedRevenue" DECIMAL(10,2),
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelProposalNight" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "roomType" TEXT,
    "night" DATE NOT NULL,
    "rate" DECIMAL(10,2),
    "rooms" INTEGER,

    CONSTRAINT "HotelProposalNight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelCharge" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT,
    "chargeType" TEXT NOT NULL,
    "amount" DECIMAL(10,2),
    "scope" "HotelChargeScope",
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "HotelCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelProposalVersion" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "summary" TEXT,
    "snapshot" JSONB NOT NULL,
    "changes" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HotelProposalVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HotelProposal_eventId_idx" ON "HotelProposal"("eventId");

-- CreateIndex
CREATE INDEX "HotelProposal_venueId_idx" ON "HotelProposal"("venueId");

-- CreateIndex
CREATE INDEX "HotelProposal_updatedById_idx" ON "HotelProposal"("updatedById");

-- CreateIndex
CREATE INDEX "HotelProposalNight_proposalId_idx" ON "HotelProposalNight"("proposalId");

-- CreateIndex
CREATE INDEX "HotelCharge_proposalId_idx" ON "HotelCharge"("proposalId");

-- CreateIndex
CREATE INDEX "HotelProposalVersion_createdById_idx" ON "HotelProposalVersion"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "HotelProposalVersion_proposalId_revision_key" ON "HotelProposalVersion"("proposalId", "revision");

-- CreateIndex
CREATE INDEX "FileUpload_hotelProposalId_idx" ON "FileUpload"("hotelProposalId");

-- AddForeignKey
ALTER TABLE "FileUpload" ADD CONSTRAINT "FileUpload_hotelProposalId_fkey" FOREIGN KEY ("hotelProposalId") REFERENCES "HotelProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelProposal" ADD CONSTRAINT "HotelProposal_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelProposal" ADD CONSTRAINT "HotelProposal_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelProposal" ADD CONSTRAINT "HotelProposal_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelProposalNight" ADD CONSTRAINT "HotelProposalNight_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "HotelProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelCharge" ADD CONSTRAINT "HotelCharge_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "HotelProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelProposalVersion" ADD CONSTRAINT "HotelProposalVersion_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "HotelProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelProposalVersion" ADD CONSTRAINT "HotelProposalVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

