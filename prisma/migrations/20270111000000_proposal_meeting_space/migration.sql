-- Proposals answer the RFP's function space and F&B: meeting space vs guest
-- charges, function space rows, F&B terms and meal prices.

-- CreateEnum
CREATE TYPE "HotelWaiverType" AS ENUM ('FB_SPEND', 'ROOM_NIGHTS', 'OTHER');

-- CreateEnum
CREATE TYPE "HotelChargeKind" AS ENUM ('GUEST', 'MEETING');

-- AlterTable
ALTER TABLE "HotelProposal" ADD COLUMN     "fbMinimum" DECIMAL(10,2),
ADD COLUMN     "fbMinimumNote" TEXT,
ADD COLUMN     "fbMinimumScope" "HotelChargeScope",
ADD COLUMN     "fbServiceCharge" DECIMAL(5,2),
ADD COLUMN     "fbTaxRate" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "HotelCharge" ADD COLUMN     "kind" "HotelChargeKind" NOT NULL DEFAULT 'GUEST';

-- CreateTable
CREATE TABLE "HotelProposalSpace" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "spaceRequestId" TEXT,
    "name" TEXT NOT NULL,
    "room" TEXT,
    "capacity" INTEGER,
    "hold24" BOOLEAN,
    "rental" DECIMAL(10,2),
    "rentalScope" "HotelChargeScope",
    "waiverType" "HotelWaiverType",
    "waiverAmount" DECIMAL(10,2),
    "waiverScope" "HotelChargeScope",
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "HotelProposalSpace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelProposalMeal" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "mealType" TEXT NOT NULL,
    "price" DECIMAL(10,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "HotelProposalMeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HotelProposalSpace_spaceRequestId_idx" ON "HotelProposalSpace"("spaceRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "HotelProposalSpace_proposalId_spaceRequestId_key" ON "HotelProposalSpace"("proposalId", "spaceRequestId");

-- CreateIndex
CREATE INDEX "HotelProposalMeal_proposalId_idx" ON "HotelProposalMeal"("proposalId");

-- AddForeignKey
ALTER TABLE "HotelProposalSpace" ADD CONSTRAINT "HotelProposalSpace_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "HotelProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelProposalSpace" ADD CONSTRAINT "HotelProposalSpace_spaceRequestId_fkey" FOREIGN KEY ("spaceRequestId") REFERENCES "RfpSpaceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelProposalMeal" ADD CONSTRAINT "HotelProposalMeal_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "HotelProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Existing proposal charges for meeting space or AV become meeting space
-- charges (by name); a nightly scope on them was the only option for a day
-- rate. Block charges stay guest charges.
UPDATE "HotelCharge"
SET "kind" = 'MEETING',
    "scope" = CASE WHEN "scope" = 'PER_NIGHT' THEN 'PER_DAY'::"HotelChargeScope" ELSE "scope" END
WHERE "proposalId" IS NOT NULL
  AND "chargeType" ~* '(meeting|function|ballroom|boardroom|breakout|room rental|\mav\M|audio|visual|projector|screen|microphone)';
