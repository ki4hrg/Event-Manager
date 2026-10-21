-- A hotel proposal's lead source becomes an organization: "Direct", or a
-- vendor tagged LEAD_SOURCE (a CVB, a third-party planner) with an optional
-- contact. Labels from the old hotel_lead_source list carry over as vendors.

-- AlterTable
ALTER TABLE "HotelProposal"
ADD COLUMN     "leadSourceContactId" TEXT,
ADD COLUMN     "leadSourceDirect" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "leadSourceVendorId" TEXT;

-- "Direct" was a label like any other.
UPDATE "HotelProposal" SET "leadSourceDirect" = true WHERE lower(trim("leadSource")) = 'direct';

-- Every other label in use, or on a tenant's list: a lead-source vendor of
-- that name (an existing vendor of the same name is tagged instead).
CREATE TEMP TABLE "_LeadSource" AS
SELECT DISTINCT e."tenantId", trim(hp."leadSource") AS label
FROM "HotelProposal" hp JOIN "Event" e ON e."id" = hp."eventId"
WHERE trim(coalesce(hp."leadSource", '')) <> '' AND lower(trim(hp."leadSource")) <> 'direct'
UNION
SELECT o."tenantId", trim(o."label")
FROM "CustomOption" o
WHERE o."category" = 'hotel_lead_source' AND lower(trim(o."label")) <> 'direct';

UPDATE "Vendor" v SET "models" = array_append(v."models", 'LEAD_SOURCE')
FROM "_LeadSource" l
WHERE v."tenantId" = l."tenantId" AND lower(v."name") = lower(l.label) AND NOT ('LEAD_SOURCE' = ANY(v."models"));

INSERT INTO "Vendor" ("id", "tenantId", "name", "models", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, l."tenantId", l.label, ARRAY['LEAD_SOURCE'], CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "_LeadSource" l
WHERE NOT EXISTS (SELECT 1 FROM "Vendor" v WHERE v."tenantId" = l."tenantId" AND lower(v."name") = lower(l.label));

UPDATE "HotelProposal" hp SET "leadSourceVendorId" = v."id"
FROM "Event" e, "Vendor" v
WHERE e."id" = hp."eventId" AND v."tenantId" = e."tenantId"
  AND lower(v."name") = lower(trim(hp."leadSource")) AND lower(trim(hp."leadSource")) <> 'direct';

DROP TABLE "_LeadSource";

ALTER TABLE "HotelProposal" DROP COLUMN "leadSource";

DELETE FROM "CustomOption" WHERE "category" = 'hotel_lead_source';

-- CreateIndex
CREATE INDEX "HotelProposal_leadSourceVendorId_idx" ON "HotelProposal"("leadSourceVendorId");

-- CreateIndex
CREATE INDEX "HotelProposal_leadSourceContactId_idx" ON "HotelProposal"("leadSourceContactId");

-- AddForeignKey
ALTER TABLE "HotelProposal" ADD CONSTRAINT "HotelProposal_leadSourceVendorId_fkey" FOREIGN KEY ("leadSourceVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelProposal" ADD CONSTRAINT "HotelProposal_leadSourceContactId_fkey" FOREIGN KEY ("leadSourceContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
