-- AlterTable
ALTER TABLE "SpeakerProfile" ADD COLUMN     "hotelBlockId" TEXT;

-- CreateIndex
CREATE INDEX "SpeakerProfile_hotelBlockId_idx" ON "SpeakerProfile"("hotelBlockId");

-- AddForeignKey
ALTER TABLE "SpeakerProfile" ADD CONSTRAINT "SpeakerProfile_hotelBlockId_fkey" FOREIGN KEY ("hotelBlockId") REFERENCES "HotelBlock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

