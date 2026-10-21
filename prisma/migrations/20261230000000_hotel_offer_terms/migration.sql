-- A hotel offer's deadline (rates good until / contract by) and whether its
-- rates include taxes and fees.

-- AlterTable
ALTER TABLE "HotelProposal" ADD COLUMN     "taxIncluded" BOOLEAN,
ADD COLUMN     "validUntil" DATE;

