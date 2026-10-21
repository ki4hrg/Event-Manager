-- Amenities move from each proposal to the hotel's profile (Venue.amenities);
-- a proposal now records only the amenities it confirms or says are
-- unavailable (HotelProposalAmenity). Concessions a proposal offers unasked
-- live beside its answers to requested ones (HotelProposalConcession.label).

-- CreateEnum
CREATE TYPE "AmenityStatus" AS ENUM ('CONFIRMED', 'UNAVAILABLE');

-- AlterTable
ALTER TABLE "Venue" ADD COLUMN     "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "HotelProposalAmenity" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "AmenityStatus" NOT NULL,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "HotelProposalAmenity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HotelProposalAmenity_proposalId_label_key" ON "HotelProposalAmenity"("proposalId", "label");

-- AddForeignKey
ALTER TABLE "HotelProposalAmenity" ADD CONSTRAINT "HotelProposalAmenity_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "HotelProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: an amenity ticked on a proposal meant the offer listed it, so it
-- is Confirmed there and joins the hotel's profile.
INSERT INTO "HotelProposalAmenity" ("id", "proposalId", "label", "status", "sortOrder")
SELECT gen_random_uuid()::text, p."id", a.label, 'CONFIRMED', a.ord - 1
FROM "HotelProposal" p
CROSS JOIN LATERAL (SELECT DISTINCT ON (label) label, ord FROM unnest(p."amenities") WITH ORDINALITY AS u(label, ord) ORDER BY label, ord) a;

UPDATE "Venue" v SET "amenities" = sub.labels
FROM (
  SELECT p."venueId", array_agg(DISTINCT a ORDER BY a) AS labels
  FROM "HotelProposal" p, unnest(p."amenities") AS a
  GROUP BY p."venueId"
) sub
WHERE sub."venueId" = v."id";

-- AlterTable
ALTER TABLE "HotelProposal" DROP COLUMN "amenities";

-- AlterTable
ALTER TABLE "HotelProposalConcession" ADD COLUMN     "label" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "concessionId" DROP NOT NULL;

-- A row answers a requested concession or names an unrequested one, never both.
ALTER TABLE "HotelProposalConcession" ADD CONSTRAINT "HotelProposalConcession_requested_or_label_check" CHECK (("concessionId" IS NULL) <> ("label" IS NULL));
