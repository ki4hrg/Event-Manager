-- CreateEnum
CREATE TYPE "HotelPickupMethod" AS ENUM ('APPEND', 'MERGE', 'REPLACE', 'COUNTS');

-- AlterTable
ALTER TABLE "HotelCharge" ADD COLUMN     "blockId" TEXT;

-- CreateTable
CREATE TABLE "HotelBlock" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "isHq" BOOLEAN NOT NULL DEFAULT false,
    "checkIn" DATE,
    "checkOut" DATE,
    "reservationMethod" TEXT,
    "groupCode" TEXT,
    "bookingLink" TEXT,
    "bookingPhone" TEXT,
    "cutoffDate" DATE,
    "contractedOn" DATE,
    "cutoffExercised" BOOLEAN,
    "isRunOfHouse" BOOLEAN NOT NULL DEFAULT false,
    "allowedAttrition" DECIMAL(5,2),
    "guaranteedRevenue" DECIMAL(10,2),
    "distanceMiles" DECIMAL(10,2),
    "driveMinutes" INTEGER,
    "compRooms" INTEGER,
    "staffRooms" INTEGER,
    "notes" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelBlockNight" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "roomType" TEXT,
    "night" DATE NOT NULL,
    "rate" DECIMAL(10,2),
    "contractedRooms" INTEGER,
    "rooms" INTEGER NOT NULL DEFAULT 0,
    "otherReservations" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "HotelBlockNight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelPickupImport" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "method" "HotelPickupMethod" NOT NULL,
    "fileName" TEXT,
    "inserted" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "importedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HotelPickupImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelPickupGuest" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "importId" TEXT,
    "guestName" TEXT,
    "confirmationNumber" TEXT,
    "checkIn" DATE,
    "checkOut" DATE,
    "roomType" TEXT,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "rawStatus" TEXT,

    CONSTRAINT "HotelPickupGuest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelPickupCount" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "night" DATE NOT NULL,
    "roomType" TEXT,
    "rooms" INTEGER NOT NULL,

    CONSTRAINT "HotelPickupCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelPickupSnapshot" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "takenOn" DATE NOT NULL,
    "nights" JSONB NOT NULL,

    CONSTRAINT "HotelPickupSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HotelBlock_proposalId_key" ON "HotelBlock"("proposalId");

-- CreateIndex
CREATE INDEX "HotelBlock_updatedById_idx" ON "HotelBlock"("updatedById");

-- CreateIndex
CREATE INDEX "HotelBlockNight_blockId_idx" ON "HotelBlockNight"("blockId");

-- CreateIndex
CREATE INDEX "HotelPickupImport_blockId_idx" ON "HotelPickupImport"("blockId");

-- CreateIndex
CREATE INDEX "HotelPickupImport_importedById_idx" ON "HotelPickupImport"("importedById");

-- CreateIndex
CREATE INDEX "HotelPickupGuest_blockId_confirmationNumber_idx" ON "HotelPickupGuest"("blockId", "confirmationNumber");

-- CreateIndex
CREATE INDEX "HotelPickupGuest_importId_idx" ON "HotelPickupGuest"("importId");

-- CreateIndex
CREATE INDEX "HotelPickupCount_blockId_idx" ON "HotelPickupCount"("blockId");

-- CreateIndex
CREATE UNIQUE INDEX "HotelPickupSnapshot_blockId_takenOn_key" ON "HotelPickupSnapshot"("blockId", "takenOn");

-- CreateIndex
CREATE INDEX "HotelCharge_blockId_idx" ON "HotelCharge"("blockId");

-- AddForeignKey
ALTER TABLE "HotelCharge" ADD CONSTRAINT "HotelCharge_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "HotelBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelBlock" ADD CONSTRAINT "HotelBlock_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "HotelProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelBlock" ADD CONSTRAINT "HotelBlock_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelBlockNight" ADD CONSTRAINT "HotelBlockNight_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "HotelBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelPickupImport" ADD CONSTRAINT "HotelPickupImport_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "HotelBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelPickupImport" ADD CONSTRAINT "HotelPickupImport_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelPickupGuest" ADD CONSTRAINT "HotelPickupGuest_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "HotelBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelPickupGuest" ADD CONSTRAINT "HotelPickupGuest_importId_fkey" FOREIGN KEY ("importId") REFERENCES "HotelPickupImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelPickupCount" ADD CONSTRAINT "HotelPickupCount_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "HotelBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelPickupSnapshot" ADD CONSTRAINT "HotelPickupSnapshot_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "HotelBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

