-- AlterTable
ALTER TABLE "HotelProposalConcession" ADD COLUMN     "label" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "concessionId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "VenueConcession" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VenueConcession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VenueConcession_venueId_idx" ON "VenueConcession"("venueId");

-- AddForeignKey
ALTER TABLE "VenueConcession" ADD CONSTRAINT "VenueConcession_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A row answers a requested concession or names an unrequested one, never both.
ALTER TABLE "HotelProposalConcession" ADD CONSTRAINT "HotelProposalConcession_requested_or_label_check" CHECK (("concessionId" IS NULL) <> ("label" IS NULL));
