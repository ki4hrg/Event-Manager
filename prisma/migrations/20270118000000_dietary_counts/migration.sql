-- Special-meal counts per catering order and a speaker's dietary needs, both
-- from the per-tenant dietary_need list (#204). Existing dietary notes stay as
-- they are; nothing is backfilled.
-- AlterTable
ALTER TABLE "SpeakerProfile" ADD COLUMN     "dietaryNeeds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "CateringOrderDietaryCount" (
    "id" TEXT NOT NULL,
    "cateringOrderId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CateringOrderDietaryCount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CateringOrderDietaryCount_cateringOrderId_label_key" ON "CateringOrderDietaryCount"("cateringOrderId", "label");

-- AddForeignKey
ALTER TABLE "CateringOrderDietaryCount" ADD CONSTRAINT "CateringOrderDietaryCount_cateringOrderId_fkey" FOREIGN KEY ("cateringOrderId") REFERENCES "BEO"("id") ON DELETE CASCADE ON UPDATE CASCADE;

