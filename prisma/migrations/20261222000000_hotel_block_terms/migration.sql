-- Hotel block terms: the single block type (CONTRACT / COURTESY / STAFF) splits
-- into a contract type (CONTRACT / COURTESY) and a guest type (a
-- hotel_guest_type option label). Run of house stops being a block flag: a
-- night with a null room type is the Run of House allotment, so one block can
-- mix it with typed rooms.

-- Guest type list, seeded before the mapping so the mapped labels exist.
INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'hotel_guest_type', v.label, v.sort, CURRENT_TIMESTAMP
FROM "Tenant" t
CROSS JOIN (VALUES ('Attendees', 0), ('Staff', 1), ('Speakers', 2), ('Exhibitors', 3), ('VIP', 4)) AS v(label, sort)
WHERE NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'hotel_guest_type' AND lower(o."label") = lower(v.label))
ON CONFLICT DO NOTHING;

-- CreateEnum
CREATE TYPE "HotelContractType" AS ENUM ('CONTRACT', 'COURTESY');

-- AlterTable
ALTER TABLE "HotelProposal" ADD COLUMN "contractType" "HotelContractType",
ADD COLUMN "guestType" TEXT;

ALTER TABLE "RfpHotelBlock" ADD COLUMN "contractType" "HotelContractType",
ADD COLUMN "guestType" TEXT;

-- CONTRACT → Contract · Attendees; COURTESY → Courtesy · Attendees;
-- STAFF → Contract · Staff.
UPDATE "HotelProposal" SET
  "contractType" = CASE "blockType" WHEN 'COURTESY' THEN 'COURTESY'::"HotelContractType" ELSE 'CONTRACT'::"HotelContractType" END,
  "guestType" = CASE "blockType" WHEN 'STAFF' THEN 'Staff' ELSE 'Attendees' END
WHERE "blockType" IS NOT NULL;

UPDATE "RfpHotelBlock" SET
  "contractType" = CASE "blockType" WHEN 'COURTESY' THEN 'COURTESY'::"HotelContractType" ELSE 'CONTRACT'::"HotelContractType" END,
  "guestType" = CASE "blockType" WHEN 'STAFF' THEN 'Staff' ELSE 'Attendees' END;

ALTER TABLE "RfpHotelBlock" ALTER COLUMN "contractType" SET NOT NULL;

-- Run-of-house blocks already store null room types on their nights (the
-- cores write it that way); make sure before the flag goes. Pickup counts in a
-- run-of-house block land on the null bucket too. Guests keep the room type
-- they actually had.
UPDATE "HotelProposalNight" n SET "roomType" = NULL
FROM "HotelProposal" p WHERE n."proposalId" = p."id" AND p."isRunOfHouse" AND n."roomType" IS NOT NULL;

UPDATE "HotelBlockNight" n SET "roomType" = NULL
FROM "HotelBlock" b WHERE n."blockId" = b."id" AND b."isRunOfHouse" AND n."roomType" IS NOT NULL;

UPDATE "HotelPickupCount" c SET "roomType" = NULL
FROM "HotelBlock" b WHERE c."blockId" = b."id" AND b."isRunOfHouse" AND c."roomType" IS NOT NULL;

UPDATE "RfpHotelBlockNight" n SET "roomType" = NULL
FROM "RfpHotelBlock" b WHERE n."blockId" = b."id" AND b."isRunOfHouse" AND n."roomType" IS NOT NULL;

-- AlterTable
ALTER TABLE "HotelProposal" DROP COLUMN "blockType",
DROP COLUMN "isRunOfHouse";

ALTER TABLE "HotelBlock" DROP COLUMN "isRunOfHouse";

ALTER TABLE "RfpHotelBlock" DROP COLUMN "blockType",
DROP COLUMN "isRunOfHouse";

-- DropEnum
DROP TYPE "HotelBlockType";
