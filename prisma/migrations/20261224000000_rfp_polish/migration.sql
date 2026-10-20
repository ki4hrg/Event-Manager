-- RFP polish: decision maker as a contact, hotel areas on the event (with an
-- RFP override), unscheduled function-space rows, and option lists tidied
-- to APEX terms.

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "hotelAreas" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Rfp" ADD COLUMN     "areas" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "decisionMakerId" TEXT;

-- AlterTable
ALTER TABLE "RfpSpaceRequest" ALTER COLUMN "day" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Rfp_decisionMakerId_idx" ON "Rfp"("decisionMakerId");

-- AddForeignKey
ALTER TABLE "Rfp" ADD CONSTRAINT "Rfp_decisionMakerId_fkey" FOREIGN KEY ("decisionMakerId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Methods of reservation: the APEX RFP lists rooming list and individual
-- reservations. Drop Housing Bureau wherever nothing uses it.
DELETE FROM "CustomOption" o
WHERE o."category" = 'reservation_method' AND o."label" = 'Housing Bureau'
  AND NOT EXISTS (SELECT 1 FROM "HotelBlock" b JOIN "HotelProposal" p ON p."id" = b."proposalId" JOIN "Event" e ON e."id" = p."eventId"
                  WHERE e."tenantId" = o."tenantId" AND b."reservationMethod" = o."label")
  AND NOT EXISTS (SELECT 1 FROM "Rfp" r JOIN "Event" e ON e."id" = r."eventId" WHERE e."tenantId" = o."tenantId" AND r."reservationMethod" = o."label")
  AND NOT EXISTS (SELECT 1 FROM "EventSpecification" s JOIN "Event" e ON e."id" = s."eventId" WHERE e."tenantId" = o."tenantId" AND s."reservationMethod" = o."label");

-- Amenities are property features; complimentary items are concessions.
-- Drop the complimentary-item amenities nothing references yet.
DELETE FROM "CustomOption" o
WHERE o."category" = 'hotel_amenity'
  AND lower(o."label") IN ('breakfast included', 'free breakfast', 'complimentary breakfast', 'free wi-fi', 'free wifi', 'complimentary wi-fi', 'free parking', 'complimentary parking')
  AND NOT EXISTS (SELECT 1 FROM "HotelProposal" p JOIN "Event" e ON e."id" = p."eventId" WHERE e."tenantId" = o."tenantId" AND o."label" = ANY(p."amenities"))
  AND NOT EXISTS (SELECT 1 FROM "Rfp" r JOIN "Event" e ON e."id" = r."eventId" WHERE e."tenantId" = o."tenantId" AND o."label" = ANY(r."amenities"));

INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'hotel_amenity', v.label, 100 + v.sort, CURRENT_TIMESTAMP
FROM "Tenant" t
CROSS JOIN (VALUES
  ('On-site Restaurant', 0), ('Fitness Center', 1), ('Indoor Pool', 2), ('Outdoor Pool', 3), ('Business Center', 4),
  ('Airport Shuttle', 5), ('Valet Parking', 6), ('Spa', 7), ('Golf', 8)
) AS v(label, sort)
WHERE NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'hotel_amenity' AND lower(o."label") = lower(v.label))
ON CONFLICT DO NOTHING;

INSERT INTO "CustomOption" ("id", "tenantId", "category", "label", "group", "sortOrder", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'rfp_concession', 'Complimentary breakfast', 'ROOMS', 6, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE NOT EXISTS (SELECT 1 FROM "CustomOption" o WHERE o."tenantId" = t."id" AND o."category" = 'rfp_concession' AND lower(o."label") IN ('complimentary breakfast', 'free breakfast', 'breakfast included'))
ON CONFLICT DO NOTHING;
