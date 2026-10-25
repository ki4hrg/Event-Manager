-- One accepted proposal can become several blocks, each with its own guest
-- type (and contract type), e.g. attendees and staff from one hotel's offer
-- (#177). Existing blocks take their proposal's.
DROP INDEX "HotelBlock_proposalId_key";

ALTER TABLE "HotelBlock" ADD COLUMN "contractType" TEXT,
ADD COLUMN "guestType" TEXT;

UPDATE "HotelBlock" b
SET "contractType" = p."contractType", "guestType" = p."guestType"
FROM "HotelProposal" p
WHERE p."id" = b."proposalId";

CREATE INDEX "HotelBlock_proposalId_idx" ON "HotelBlock"("proposalId");
