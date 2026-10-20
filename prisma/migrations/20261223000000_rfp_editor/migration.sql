-- RFP editor: requested dates, peak rooms and the APEX / hotel-RFP fields on
-- Rfp; alternate dates; RFP-owned function-space rows (RfpSpaceRequest)
-- replacing the live meeting-space read with its type exclusions and
-- room-name toggle; concession options grouped Guest rooms / F&B / Other.

-- CreateEnum
CREATE TYPE "RfpSpaceKind" AS ENUM ('MEETING', 'FB');

-- AlterTable
ALTER TABLE "Rfp" DROP COLUMN "excludedFunctionTypes",
DROP COLUMN "showRoomNames",
ADD COLUMN     "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "arrivalDate" DATE,
ADD COLUMN     "commissionNotes" TEXT,
ADD COLUMN     "dateNotes" TEXT,
ADD COLUMN     "datesFlexible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "decisionMaker" TEXT,
ADD COLUMN     "departureDate" DATE,
ADD COLUMN     "fbHistoricalSpend" DECIMAL(10,2),
ADD COLUMN     "fbIncludes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "fbMinimum" DECIMAL(10,2),
ADD COLUMN     "peakRooms" INTEGER,
ADD COLUMN     "reservationMethod" TEXT,
ADD COLUMN     "siteVisitBy" DATE;

-- CreateTable
CREATE TABLE "RfpAlternateDate" (
    "id" TEXT NOT NULL,
    "rfpId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RfpAlternateDate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfpSpaceRequest" (
    "id" TEXT NOT NULL,
    "rfpId" TEXT NOT NULL,
    "kind" "RfpSpaceKind" NOT NULL,
    "functionId" TEXT,
    "cateringOrderId" TEXT,
    "day" DATE NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "functionType" TEXT,
    "name" TEXT NOT NULL,
    "attendance" INTEGER,
    "setup" TEXT,
    "areaSqFt" INTEGER,
    "av" TEXT,
    "hold24" BOOLEAN NOT NULL DEFAULT false,
    "room" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RfpSpaceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RfpAlternateDate_rfpId_idx" ON "RfpAlternateDate"("rfpId");

-- CreateIndex
CREATE INDEX "RfpSpaceRequest_rfpId_idx" ON "RfpSpaceRequest"("rfpId");

-- CreateIndex
CREATE INDEX "RfpSpaceRequest_functionId_idx" ON "RfpSpaceRequest"("functionId");

-- CreateIndex
CREATE INDEX "RfpSpaceRequest_cateringOrderId_idx" ON "RfpSpaceRequest"("cateringOrderId");

-- AddForeignKey
ALTER TABLE "RfpAlternateDate" ADD CONSTRAINT "RfpAlternateDate_rfpId_fkey" FOREIGN KEY ("rfpId") REFERENCES "Rfp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfpSpaceRequest" ADD CONSTRAINT "RfpSpaceRequest_rfpId_fkey" FOREIGN KEY ("rfpId") REFERENCES "Rfp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfpSpaceRequest" ADD CONSTRAINT "RfpSpaceRequest_functionId_fkey" FOREIGN KEY ("functionId") REFERENCES "Function"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfpSpaceRequest" ADD CONSTRAINT "RfpSpaceRequest_cateringOrderId_fkey" FOREIGN KEY ("cateringOrderId") REFERENCES "BEO"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Existing RFPs ask for the event's own dates.
UPDATE "Rfp" r SET
  "arrivalDate" = (e."startDate" AT TIME ZONE 'UTC')::date,
  "departureDate" = (e."endDate" AT TIME ZONE 'UTC')::date
FROM "Event" e
WHERE e."id" = r."eventId";

-- Concession defaults, grouped as the APEX RFP's "Concessions Desired"
-- (ROOMS = guest rooms, FB = food & beverage, OTHER). Existing tenants never
-- ran the seed for this list, so add any default they lack.
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "group", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'rfp_concession', v.label, v.grp, v.sort, CURRENT_TIMESTAMP
FROM "Tenant" t
CROSS JOIN (VALUES
  ('Comp ratio', 'ROOMS', 0),
  ('Attrition', 'ROOMS', 1),
  ('Cut-off', 'ROOMS', 2),
  ('Rate cap', 'ROOMS', 3),
  ('Staff rate', 'ROOMS', 4),
  ('Upgrades', 'ROOMS', 5),
  ('Waived resort fee', 'ROOMS', 6),
  ('F&B discount', 'FB', 7),
  ('Complimentary Wi-Fi', 'OTHER', 8),
  ('Parking', 'OTHER', 9),
  ('Deposit schedule', 'OTHER', 10),
  ('Waived meeting room rental', 'OTHER', 11)
) AS v(label, grp, sort)
WHERE NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'rfp_concession' AND lower(o."label") = lower(v.label))
ON CONFLICT DO NOTHING;

-- Group the defaults a tenant already had.
UPDATE "CustomOption" SET "group" = CASE "label"
    WHEN 'Deposit schedule' THEN 'OTHER'
    WHEN 'Complimentary Wi-Fi' THEN 'OTHER'
    WHEN 'Parking' THEN 'OTHER'
    WHEN 'F&B discount' THEN 'FB'
    ELSE 'ROOMS'
  END
WHERE "category" = 'rfp_concession' AND "group" IS NULL
  AND "label" IN ('Comp ratio', 'Attrition', 'Cut-off', 'Rate cap', 'Deposit schedule', 'Complimentary Wi-Fi', 'Parking', 'Staff rate', 'Upgrades', 'F&B discount');
