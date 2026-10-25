-- Hotel block contract terms (attrition basis, comp ratio) and the final
-- review: the hotel's post-event guest list and the sign-off.
CREATE TYPE "HotelAttritionBasis" AS ENUM ('ROOM_NIGHTS', 'PER_NIGHT', 'REVENUE', 'PROFIT');

ALTER TABLE "HotelBlock"
  ADD COLUMN "attritionBasis" "HotelAttritionBasis",
  ADD COLUMN "compRatio" INTEGER,
  ADD COLUMN "finalListFileName" TEXT,
  ADD COLUMN "finalListLoadedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedOn" DATE,
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "reviewNotes" TEXT;

CREATE INDEX "HotelBlock_reviewedById_idx" ON "HotelBlock"("reviewedById");
ALTER TABLE "HotelBlock" ADD CONSTRAINT "HotelBlock_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "HotelFinalGuest" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "guestName" TEXT,
    "confirmationNumber" TEXT,
    "checkIn" DATE,
    "checkOut" DATE,
    "roomType" TEXT,

    CONSTRAINT "HotelFinalGuest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HotelFinalGuest_blockId_idx" ON "HotelFinalGuest"("blockId");
ALTER TABLE "HotelFinalGuest" ADD CONSTRAINT "HotelFinalGuest_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "HotelBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
