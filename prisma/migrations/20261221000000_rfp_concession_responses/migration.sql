-- CreateEnum
CREATE TYPE "ConcessionMet" AS ENUM ('MET', 'PARTIAL', 'NOT_MET');

-- CreateTable
CREATE TABLE "HotelProposalConcession" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "concessionId" TEXT NOT NULL,
    "offered" TEXT,
    "met" "ConcessionMet",

    CONSTRAINT "HotelProposalConcession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HotelProposalConcession_concessionId_idx" ON "HotelProposalConcession"("concessionId");

-- CreateIndex
CREATE UNIQUE INDEX "HotelProposalConcession_proposalId_concessionId_key" ON "HotelProposalConcession"("proposalId", "concessionId");

-- AddForeignKey
ALTER TABLE "HotelProposalConcession" ADD CONSTRAINT "HotelProposalConcession_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "HotelProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelProposalConcession" ADD CONSTRAINT "HotelProposalConcession_concessionId_fkey" FOREIGN KEY ("concessionId") REFERENCES "RfpConcession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

